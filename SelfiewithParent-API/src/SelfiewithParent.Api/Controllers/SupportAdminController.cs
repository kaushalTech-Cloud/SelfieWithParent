using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Content;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Giving;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

public sealed record AdminSupportContentResponse(string Language, SupportContent? Content, DateTime? UpdatedAtUtc);
public sealed record GivingSettingsResponse(bool Enabled, bool GatewayConfigured, bool TestMode, bool WebhookConfigured, string WebhookPath);
public sealed record GivingSettingsRequest { [Required] public bool? Enabled { get; init; } }

public sealed record AdminCampaignResponse(Guid PublicId, string Slug, string Title, string? Summary, string? Story, string? Image, decimal GoalAmount,
    decimal OfflineRaised, decimal Raised, int Donors, DateTime? StartsAtUtc, DateTime? EndsAtUtc, string Status, bool IsFeatured, int SortOrder);

public sealed record SaveCampaignRequest
{
    [Required, RegularExpression("^[a-z0-9-]{3,60}$", ErrorMessage = "Web address: 3 to 60 small letters, numbers and dashes.")] public string Slug { get; init; } = "";
    [Required(ErrorMessage = "Give the campaign a title."), StringLength(120)] public string Title { get; init; } = "";
    [StringLength(300)] public string? Summary { get; init; }
    [StringLength(4000)] public string? Story { get; init; }
    [StringLength(80)] public string? Image { get; init; }
    [Required, Range(1, 1_000_000_000, ErrorMessage = "Set a goal amount.")] public decimal? GoalAmount { get; init; }
    [Range(0, 1_000_000_000)] public decimal? OfflineRaised { get; init; }
    public DateTime? StartsAtUtc { get; init; }
    public DateTime? EndsAtUtc { get; init; }
    [Required, RegularExpression("^(Draft|Active|Paused|Closed)$")] public string Status { get; init; } = "Draft";
    public bool IsFeatured { get; init; }
    public int SortOrder { get; init; }
}

public sealed record AdminDonationResponse(Guid PublicId, string? ReceiptNo, decimal Amount, string DonorName, string Email, string? Phone, string? Pan,
    string? InHonourOf, string? Message, bool ShowOnWall, string? WallName, string Method, string? PaymentId, string? Reference, string Status,
    string? StatusNote, string? Campaign, DateTime CreatedAtUtc, DateTime? PaidAtUtc, DateTime? ReceiptSentAtUtc);
public sealed record AdminDonationPage(IReadOnlyList<AdminDonationResponse> Items, int Total, int Page, int PageSize,
    decimal PaidAmount, int Paid, int Created, int Failed, int Refunded);

public sealed record OfflineDonationRequest
{
    public Guid? CampaignId { get; init; }
    [Required, Range(1, 10_000_000, ErrorMessage = "Enter the amount received.")] public decimal? Amount { get; init; }
    [Required, RegularExpression("^(cash|bank|cheque|upi)$", ErrorMessage = "Choose how it was paid.")] public string Method { get; init; } = "";
    [StringLength(100)] public string? Reference { get; init; }
    [Required(ErrorMessage = "Enter the donor's name."), StringLength(100, MinimumLength = 2)] public string Name { get; init; } = "";
    [Required(ErrorMessage = "Enter the donor's email for the receipt."), EmailAddress, StringLength(254)] public string Email { get; init; } = "";
    [RegularExpression(@"^\+?[0-9 ()-]{7,20}$")] public string? Phone { get; init; }
    [RegularExpression("^[A-Za-z]{5}[0-9]{4}[A-Za-z]$", ErrorMessage = "Enter a valid PAN.")] public string? Pan { get; init; }
    [StringLength(100)] public string? InHonourOf { get; init; }
    public bool ShowOnWall { get; init; }
    [StringLength(60)] public string? WallName { get; init; }
    public DateTime? PaidAtUtc { get; init; }
}
public sealed record RefundRequest { [Required, StringLength(300, MinimumLength = 5, ErrorMessage = "Say why it was refunded (at least 5 characters).")] public string Note { get; init; } = ""; }

/// <summary>Admin site: the Support page's words, campaigns, donations (online and offline), refunds, and the giving switch. Super admins and admins.</summary>
[ApiController]
[Route("api/v1/admin/support")]
[Authorize(Policy = Policies.ContentEditor)]
[Produces("application/json")]
public sealed class SupportAdminController(GivingRepository giving, RazorpayGateway gateway, ILogger<SupportAdminController> log) : ControllerBase
{
    private static readonly string[] Languages = ["en", "hi", "bn", "ar", "es", "fr"];
    private static string Lang(string? lang) => lang is not null && Languages.Contains(lang) ? lang : "en";
    private string? Actor => User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

    // ---------- Page content ----------

    [HttpGet("content")]
    public async Task<IActionResult> GetContent([FromQuery] string? lang, CancellationToken ct)
    {
        var l = Lang(lang);
        var (content, updated) = await giving.GetContentAsync(l, ct);
        return Ok(new AdminSupportContentResponse(l, content, updated));
    }

    [HttpPut("content")]
    public async Task<IActionResult> SaveContent([FromQuery] string? lang, [FromBody] SupportContent content, CancellationToken ct)
    {
        var l = Lang(lang);
        var (clean, error) = SupportContentRules.Validate(content);
        if (clean is null) { log.LogWarning("Support page ({Lang}) refused for {Actor}: {Error}", l, Actor, error); return Problem(statusCode: 400, title: error); }
        var problem = await giving.SaveContentAsync(User.GetUserId(), l, clean, ct);
        if (problem is not null) { log.LogWarning("Support page ({Lang}) refused by the database for {Actor}: {Problem}", l, Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Support page ({Lang}) saved by {Actor}", l, Actor);
        return NoContent();
    }

    [HttpDelete("content")]
    public async Task<IActionResult> ResetContent([FromQuery] string? lang, CancellationToken ct)
    {
        var l = Lang(lang);
        var problem = await giving.SaveContentAsync(User.GetUserId(), l, null, ct);
        if (problem is not null) return Problem(statusCode: 400, title: problem);
        log.LogInformation("Support page ({Lang}) reset by {Actor}", l, Actor);
        return NoContent();
    }

    // ---------- Switch ----------

    [HttpGet("settings")]
    public async Task<IActionResult> Settings(CancellationToken ct) =>
        Ok(new GivingSettingsResponse(await giving.EnabledAsync(ct), gateway.IsConfigured, gateway.IsTestMode, gateway.HasWebhookSecret, "/api/v1/support/razorpay/webhook"));

    [HttpPut("settings")]
    public async Task<IActionResult> SetSettings(GivingSettingsRequest r, CancellationToken ct)
    {
        if (r.Enabled == true && !gateway.IsConfigured)
            return Problem(statusCode: 400, title: "Add the Razorpay keys on the server first (Razorpay:KeyId and Razorpay:KeySecret).");
        var problem = await giving.SetEnabledAsync(User.GetUserId(), r.Enabled!.Value, ct);
        if (problem is not null) return Problem(statusCode: 400, title: problem);
        log.LogInformation("Online donations switched {State} by {Actor}", r.Enabled.Value ? "on" : "off", Actor);
        return NoContent();
    }

    // ---------- Campaigns ----------

    [HttpGet("campaigns")]
    public async Task<IActionResult> Campaigns(CancellationToken ct) =>
        Ok((await giving.AllCampaignsAsync(ct)).Select(c => new AdminCampaignResponse(c.PublicId, c.Slug, c.Title, c.Summary, c.Story, c.Image, c.GoalAmount,
            c.OfflineRaised, c.Raised, c.Donors, c.StartsAtUtc, c.EndsAtUtc, c.Status, c.IsFeatured, c.SortOrder)).ToList());

    [HttpPost("campaigns")]
    public Task<IActionResult> AddCampaign(SaveCampaignRequest r, CancellationToken ct) => SaveCampaign(null, r, ct);

    [HttpPut("campaigns/{publicId:guid}")]
    public Task<IActionResult> EditCampaign(Guid publicId, SaveCampaignRequest r, CancellationToken ct) => SaveCampaign(publicId, r, ct);

    private async Task<IActionResult> SaveCampaign(Guid? id, SaveCampaignRequest r, CancellationToken ct)
    {
        foreach (var v in new[] { r.Title, r.Summary, r.Story })
            if (v is not null && (v.Contains('<') || v.Contains('>'))) return Problem(statusCode: 400, title: "Text can't contain < or >.");
        if (r.Image is not null && !(r.Image.StartsWith("img/") || r.Image.StartsWith("media/"))) return Problem(statusCode: 400, title: "Choose one of the website's pictures.");
        if (r.EndsAtUtc is { } e && r.StartsAtUtc is { } s && e <= s) return Problem(statusCode: 400, title: "The end must be after the start.");
        var (saved, problem) = await giving.SaveCampaignAsync(User.GetUserId(), new GivingRepository.SaveCampaign(id, r.Slug, r.Title.Trim(),
            Clean(r.Summary), Clean(r.Story), Clean(r.Image), r.GoalAmount!.Value, r.OfflineRaised ?? 0, r.StartsAtUtc, r.EndsAtUtc, r.Status, r.IsFeatured, r.SortOrder), ct);
        if (saved is null) { log.LogWarning("Campaign {Slug} refused for {Actor}: {Problem}", r.Slug, Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Campaign {Slug} ({Status}) saved by {Actor}", r.Slug, r.Status, Actor);
        return Ok(new { publicId = saved });
    }

    [HttpDelete("campaigns/{publicId:guid}")]
    public async Task<IActionResult> DeleteCampaign(Guid publicId, CancellationToken ct)
    {
        var problem = await giving.DeleteCampaignAsync(User.GetUserId(), publicId, ct);
        if (problem is not null) return Problem(statusCode: 400, title: problem);
        log.LogInformation("Campaign {Campaign} deleted by {Actor}", publicId, Actor);
        return NoContent();
    }

    // ---------- Donations ----------

    [HttpGet("donations")]
    public async Task<IActionResult> Donations([FromQuery] string? status, [FromQuery] Guid? campaign, [FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        status = status is "Paid" or "Created" or "Failed" or "Refunded" ? status : null;
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var (items, total, s) = await giving.DonationsAsync(status, campaign, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), page, pageSize, ct);
        return Ok(new AdminDonationPage(items.Select(ToResponse).ToList(), total, page, pageSize, s.PaidAmount, s.Paid, s.Created, s.Failed, s.Refunded));
    }

    /// <summary>All paid and refunded donations as a CSV file (for the accountant / 80G filings).</summary>
    [HttpGet("donations/export")]
    [Produces("text/csv")]
    public async Task<IActionResult> Export(CancellationToken ct)
    {
        var sb = new StringBuilder("Receipt,Date,Amount,Status,Name,Email,Phone,PAN,In honour of,Campaign,Method,Payment / reference\n");
        static string C(string? v) => v is null ? "" : "\"" + (v.Length > 0 && "=+-@".Contains(v[0]) ? "'" + v : v).Replace("\"", "\"\"") + "\"";   // no spreadsheet formulas
        for (var page = 1; ; page++)
        {
            var (items, _, _) = await giving.DonationsAsync(null, null, null, page, 100, ct);
            foreach (var d in items.Where(x => x.Status is "Paid" or "Refunded"))
                sb.Append(string.Join(',', C(d.ReceiptNo), C(d.PaidAtUtc?.ToString("yyyy-MM-dd")), d.Amount.ToString(CultureInfo.InvariantCulture), C(d.Status), C(d.DonorName),
                    C(d.Email), C(d.Phone), C(d.Pan), C(d.InHonourOf), C(d.CampaignTitle), C(d.Method), C(d.GatewayPaymentId ?? d.Reference))).Append('\n');
            if (items.Count < 100) break;
        }
        log.LogInformation("Donations exported by {Actor}", Actor);
        return File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray(), "text/csv", $"donations-{DateTime.UtcNow:yyyy-MM-dd}.csv");
    }

    [HttpPost("donations/offline")]
    public async Task<IActionResult> RecordOffline(OfflineDonationRequest r, CancellationToken ct)
    {
        foreach (var v in new[] { r.Name, r.Reference, r.InHonourOf, r.WallName })
            if (v is not null && (v.Contains('<') || v.Contains('>'))) return Problem(statusCode: 400, title: "Text can't contain < or >.");
        var (receipt, problem) = await giving.RecordOfflineAsync(User.GetUserId(), new GivingRepository.OfflineDonation(r.CampaignId, Math.Round(r.Amount!.Value, 2), r.Method,
            Clean(r.Reference), r.Name.Trim(), r.Email.Trim(), Clean(r.Phone), Clean(r.Pan)?.ToUpperInvariant(), Clean(r.InHonourOf), r.ShowOnWall,
            r.ShowOnWall ? Clean(r.WallName) : null, r.PaidAtUtc), ct);
        if (receipt is null) { log.LogWarning("Offline donation refused for {Actor}: {Problem}", Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Offline donation {Receipt} ({Method}) recorded by {Actor}", receipt, r.Method, Actor);
        return Ok(new { receiptNo = receipt });
    }

    [HttpPut("donations/{publicId:guid}/refund")]
    public async Task<IActionResult> Refund(Guid publicId, RefundRequest r, CancellationToken ct)
    {
        if (r.Note.Contains('<') || r.Note.Contains('>')) return Problem(statusCode: 400, title: "Text can't contain < or >.");
        var problem = await giving.RefundAsync(User.GetUserId(), publicId, r.Note.Trim(), ct);
        if (problem is not null) return Problem(statusCode: 400, title: problem);
        log.LogInformation("Donation {Donation} marked refunded by {Actor}", publicId, Actor);
        return NoContent();
    }

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private static AdminDonationResponse ToResponse(GivingRepository.DonationRow d) => new(d.PublicId, d.ReceiptNo, d.Amount, d.DonorName, d.Email, d.Phone, d.Pan,
        d.InHonourOf, d.Message, d.ShowOnWall, d.WallName, d.Method, d.GatewayPaymentId, d.Reference, d.Status, d.StatusNote, d.CampaignTitle,
        d.CreatedAtUtc, d.PaidAtUtc, d.ReceiptSentAtUtc);
}
