using System.Data;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using SelfiewithParent.Api.Content;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Giving (give schema): the Support page's content, campaigns and donations. Every write goes through a give.usp_
/// procedure; marking a donation paid is only allowed from System access, after the payment gateway's signature is checked.
/// </summary>
public sealed class GivingRepository(SqlConnectionFactory db)
{
    public const string EnabledKey = "donations.enabled";
    public static readonly JsonSerializerOptions Json = HomeContentRules.Json;

    private static string? Problem(SqlException ex) => ex.Number is >= 50060 and <= 50069 or 50020 or 50021 or 50022 or 50023 ? ex.Message
        : ex.Number == 547 ? "Some of the details aren't valid. Please check them and try again." : null;

    // ---------- Support page content ----------

    public async Task<(SupportContent? Content, DateTime? UpdatedAtUtc)> GetContentAsync(string lang, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var row = await conn.QuerySingleOrDefaultAsync<(string Json, DateTime UpdatedAtUtc)?>(new CommandDefinition(
            "SELECT ContentJson, UpdatedAtUtc FROM give.SupportContent WHERE LanguageCode = @lang;", new { lang }, cancellationToken: ct));
        if (row is null) return (null, null);
        try { return (JsonSerializer.Deserialize<SupportContent>(row.Value.Json, Json), row.Value.UpdatedAtUtc); }
        catch (JsonException) { return (null, row.Value.UpdatedAtUtc); }   // never break the page
    }

    public async Task<string?> SaveContentAsync(long userId, string lang, SupportContent? content, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("give.usp_SaveSupportContent",
                new { LanguageCode = lang, ContentJson = content is null ? null : JsonSerializer.Serialize(content, Json) },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return m; }
    }

    // ---------- Switch ----------

    public async Task<bool> EnabledAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.ExecuteScalarAsync<string?>(new CommandDefinition("SELECT Value FROM site.Setting WHERE SettingKey = @k;", new { k = EnabledKey }, cancellationToken: ct)) == "1";
    }

    public async Task<string?> SetEnabledAsync(long userId, bool on, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("site.usp_SetSetting", new { SettingKey = EnabledKey, Value = on ? "1" : "0" },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return m; }
    }

    // ---------- Campaigns ----------

    public sealed record CampaignRow(Guid PublicId, string Slug, string Title, string? Summary, string? Story, string? Image, decimal GoalAmount,
        decimal OfflineRaised, decimal Raised, int Donors, DateTime? StartsAtUtc, DateTime? EndsAtUtc, string Status, bool IsFeatured, int SortOrder);

    private const string CampaignSql = @"
        SELECT c.PublicId, c.Slug, c.Title, c.Summary, c.Story, c.Image, c.GoalAmount, c.OfflineRaised,
               c.OfflineRaised + ISNULL(d.Raised, 0) AS Raised, ISNULL(d.Donors, 0) AS Donors,
               c.StartsAtUtc, c.EndsAtUtc, c.Status, c.IsFeatured, c.SortOrder
        FROM give.Campaign AS c
        OUTER APPLY (SELECT SUM(x.Amount) AS Raised, COUNT(*) AS Donors FROM give.Donation AS x WHERE x.CampaignId = c.CampaignId AND x.Status = 'Paid') AS d";

    /// <summary>Campaigns visitors can see and give to: active, started, not ended. Featured first.</summary>
    public async Task<IReadOnlyList<CampaignRow>> ActiveCampaignsAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<CampaignRow>(new CommandDefinition(CampaignSql + @"
            WHERE c.Status = 'Active' AND (c.StartsAtUtc IS NULL OR c.StartsAtUtc <= SYSUTCDATETIME()) AND (c.EndsAtUtc IS NULL OR c.EndsAtUtc > SYSUTCDATETIME())
            ORDER BY c.IsFeatured DESC, c.SortOrder, c.CreatedAtUtc DESC;", cancellationToken: ct))).ToList();
    }

    public async Task<IReadOnlyList<CampaignRow>> AllCampaignsAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<CampaignRow>(new CommandDefinition(CampaignSql + @"
            ORDER BY CASE c.Status WHEN 'Active' THEN 0 WHEN 'Draft' THEN 1 WHEN 'Paused' THEN 2 ELSE 3 END, c.SortOrder, c.CreatedAtUtc DESC;", cancellationToken: ct))).ToList();
    }

    public sealed record SaveCampaign(Guid? PublicId, string Slug, string Title, string? Summary, string? Story, string? Image, decimal GoalAmount,
        decimal OfflineRaised, DateTime? StartsAtUtc, DateTime? EndsAtUtc, string Status, bool IsFeatured, int SortOrder);

    public async Task<(Guid? Id, string? Problem)> SaveCampaignAsync(long userId, SaveCampaign c, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<Guid>(new CommandDefinition("give.usp_SaveCampaign", c, commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return (null, m); }
    }

    public async Task<string?> DeleteCampaignAsync(long userId, Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("give.usp_DeleteCampaign", new { PublicId = publicId }, commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return m; }
    }

    // ---------- Totals and the donor wall (public) ----------

    public sealed record Totals(decimal Raised, int Donors, int Campaigns);

    public async Task<Totals> TotalsAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleAsync<Totals>(new CommandDefinition(@"
            SELECT ISNULL((SELECT SUM(Amount) FROM give.Donation WHERE Status = 'Paid'), 0) + ISNULL((SELECT SUM(OfflineRaised) FROM give.Campaign WHERE Status <> 'Draft'), 0) AS Raised,
                   (SELECT COUNT(DISTINCT Email) FROM give.Donation WHERE Status = 'Paid') AS Donors,
                   (SELECT COUNT(*) FROM give.Campaign WHERE Status IN ('Active', 'Closed')) AS Campaigns;", cancellationToken: ct));
    }

    public sealed record WallRow(string? WallName, decimal Amount, string? InHonourOf, string? CampaignTitle, DateTime PaidAtUtc);

    /// <summary>Donors who chose to appear: the name they chose (or anonymous), the amount, in whose honour.</summary>
    public async Task<IReadOnlyList<WallRow>> WallAsync(int take, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<WallRow>(new CommandDefinition(@"
            SELECT TOP (@take) d.WallName, d.Amount, d.InHonourOf, c.Title AS CampaignTitle, d.PaidAtUtc
            FROM give.Donation AS d LEFT JOIN give.Campaign AS c ON c.CampaignId = d.CampaignId
            WHERE d.Status = 'Paid' AND d.ShowOnWall = 1 ORDER BY d.PaidAtUtc DESC;", new { take }, cancellationToken: ct))).ToList();
    }

    // ---------- Online donations ----------

    public sealed record NewDonation(Guid? CampaignPublicId, decimal Amount, string DonorName, string Email, string? Phone, string? Pan,
        string? InHonourOf, string? Message, bool ShowOnWall, string? WallName, string GatewayOrderId);

    public async Task<(Guid? Id, string? Problem)> CreateDonationAsync(long? userId, NewDonation d, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(userId is { } u ? DbAccess.ForUser(u) : DbAccess.ForSystem(), ct);
        try
        {
            return (await conn.QuerySingleAsync<Guid>(new CommandDefinition("give.usp_CreateDonation", d, commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return (null, m); }
    }

    public sealed record PaidDonation(Guid PublicId, string ReceiptNo, decimal Amount, string DonorName, string Email, string? Pan, string? InHonourOf,
        DateTime PaidAtUtc, bool JustPaid, string? CampaignTitle);

    public async Task<decimal?> AmountOfOrderAsync(string orderId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.ExecuteScalarAsync<decimal?>(new CommandDefinition("SELECT Amount FROM give.Donation WHERE GatewayOrderId = @orderId;", new { orderId }, cancellationToken: ct));
    }

    /// <summary>Marks the order's donation paid (System access; the gateway's signature has been checked). Idempotent.</summary>
    public async Task<(PaidDonation? Donation, string? Problem)> SetPaidAsync(string orderId, string paymentId, decimal amount, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        try
        {
            return (await conn.QuerySingleAsync<PaidDonation>(new CommandDefinition("give.usp_SetDonationPaid",
                new { GatewayOrderId = orderId, GatewayPaymentId = paymentId, AmountPaid = amount }, commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return (null, m); }
    }

    public async Task SetFailedAsync(string orderId, string reason, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        await conn.ExecuteAsync(new CommandDefinition("give.usp_SetDonationFailed", new { GatewayOrderId = orderId, Reason = reason },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task MarkReceiptSentAsync(Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        await conn.ExecuteAsync(new CommandDefinition("give.usp_MarkReceiptSent", new { PublicId = publicId }, commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    // ---------- Admin: donations ----------

    public sealed record DonationRow(Guid PublicId, string? ReceiptNo, decimal Amount, string DonorName, string Email, string? Phone, string? Pan,
        string? InHonourOf, string? Message, bool ShowOnWall, string? WallName, string Method, string? GatewayPaymentId, string? Reference,
        string Status, string? StatusNote, string? CampaignTitle, DateTime CreatedAtUtc, DateTime? PaidAtUtc, DateTime? ReceiptSentAtUtc);

    public sealed record DonationSums(decimal PaidAmount, int Paid, int Created, int Failed, int Refunded);

    /// <summary>One page of donations (newest first), filtered by status / campaign / a search in name, email or receipt.</summary>
    public async Task<(IReadOnlyList<DonationRow> Items, int Total, DonationSums Sums)> DonationsAsync(string? status, Guid? campaign, string? search,
        int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var where = @"FROM give.Donation AS d LEFT JOIN give.Campaign AS c ON c.CampaignId = d.CampaignId
            WHERE (@status IS NULL OR d.Status = @status) AND (@campaign IS NULL OR c.PublicId = @campaign)
              AND (@search IS NULL OR d.DonorName LIKE @like OR d.Email LIKE @like OR d.ReceiptNo LIKE @like)";
        var p = new { status, campaign, search, like = search is null ? null : "%" + search.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]") + "%",
            skip = (page - 1) * pageSize, take = pageSize };
        using var multi = await conn.QueryMultipleAsync(new CommandDefinition($@"
            SELECT d.PublicId, d.ReceiptNo, d.Amount, d.DonorName, d.Email, d.Phone, d.Pan, d.InHonourOf, d.Message, d.ShowOnWall, d.WallName, d.Method,
                   d.GatewayPaymentId, d.Reference, d.Status, d.StatusNote, c.Title AS CampaignTitle, d.CreatedAtUtc, d.PaidAtUtc, d.ReceiptSentAtUtc
            {where} ORDER BY COALESCE(d.PaidAtUtc, d.CreatedAtUtc) DESC, d.DonationId DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
            SELECT COUNT(*) {where};
            SELECT ISNULL(SUM(IIF(Status = 'Paid', Amount, 0)), 0) AS PaidAmount, SUM(IIF(Status = 'Paid', 1, 0)) AS Paid, SUM(IIF(Status = 'Created', 1, 0)) AS Created,
                   SUM(IIF(Status = 'Failed', 1, 0)) AS Failed, SUM(IIF(Status = 'Refunded', 1, 0)) AS Refunded FROM give.Donation;", p, cancellationToken: ct));
        var items = (await multi.ReadAsync<DonationRow>()).ToList();
        var total = await multi.ReadSingleAsync<int>();
        var s = await multi.ReadSingleAsync<(decimal PaidAmount, int? Paid, int? Created, int? Failed, int? Refunded)>();
        return (items, total, new DonationSums(s.PaidAmount, s.Paid ?? 0, s.Created ?? 0, s.Failed ?? 0, s.Refunded ?? 0));
    }

    public sealed record OfflineDonation(Guid? CampaignPublicId, decimal Amount, string Method, string? Reference, string DonorName, string Email,
        string? Phone, string? Pan, string? InHonourOf, bool ShowOnWall, string? WallName, DateTime? PaidAtUtc);

    public async Task<(string? ReceiptNo, string? Problem)> RecordOfflineAsync(long userId, OfflineDonation d, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            var r = await conn.QuerySingleAsync<(Guid PublicId, string ReceiptNo)>(new CommandDefinition("give.usp_RecordOfflineDonation", d,
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return (r.ReceiptNo, null);
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return (null, m); }
    }

    public async Task<string?> RefundAsync(long userId, Guid publicId, string note, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("give.usp_RefundDonation", new { PublicId = publicId, Note = note }, commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (Problem(ex) is { } m) { return m; }
    }
}
