using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// The website's contact details (site settings 'contact.*', changed by super admins / admins) and the contact form's
/// messages (sent by anyone through site.usp_SendContactMessage; read and marked by super admins / admins).
/// </summary>
public sealed class ContactRepository(SqlConnectionFactory db)
{
    public sealed record ContactDetails(string Email, string Phone, string Address);

    public async Task<ContactDetails> DetailsAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var s = (await conn.QueryAsync<(string Key, string Value)>(new CommandDefinition(
            "SELECT SettingKey, Value FROM site.Setting WHERE SettingKey LIKE 'contact.%';", cancellationToken: ct))).ToDictionary(x => x.Key, x => x.Value);
        return new ContactDetails(s.GetValueOrDefault("contact.email", ""), s.GetValueOrDefault("contact.phone", ""), s.GetValueOrDefault("contact.address", ""));
    }

    /// <summary>Saves the three contact details through site.usp_SetSetting (the database checks the role and the values).</summary>
    public async Task<string?> SaveDetailsAsync(long userId, ContactDetails d, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        try
        {
            foreach (var (key, value) in new[] { ("contact.email", d.Email), ("contact.phone", d.Phone), ("contact.address", d.Address) })
                await conn.ExecuteAsync(new CommandDefinition("site.usp_SetSetting", new { SettingKey = key, Value = value }, tx,
                    commandType: CommandType.StoredProcedure, cancellationToken: ct));
            await tx.CommitAsync(ct);
            return null;
        }
        catch (SqlException ex) when (ex.Number is >= 50020 and <= 50029)
        {
            await tx.RollbackAsync(ct);
            return ex.Message;
        }
    }

    /// <summary>Saves a contact-form message (signed-in sender: their account is noted). Null + the message when refused.</summary>
    public async Task<(Guid? PublicId, string? Problem)> SendAsync(long? userId, string name, string email, string? subject, string message, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(userId is { } id ? DbAccess.ForUser(id) : DbAccess.ForSystem(), ct);
        try
        {
            return (await conn.QuerySingleAsync<Guid>(new CommandDefinition("site.usp_SendContactMessage",
                new { Name = name, Email = email, Subject = subject, Message = message }, commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50020 and <= 50029)
        {
            return (null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return (null, "Please check your name and email address.");
        }
    }

    public sealed record MessageRow(Guid PublicId, string Name, string Email, string? Subject, string Message, string Status,
        DateTime CreatedAtUtc, DateTime? ReadAtUtc, string? ReadBy, bool FromAccount);

    public sealed record MessageCounts(int New, int Read, int Archived);

    /// <summary>A page of messages with a status ('' = New and Read), newest first, and how many there are of each.</summary>
    public async Task<(IReadOnlyList<MessageRow> Items, int Total, MessageCounts Counts)> MessagesAsync(string? status, int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        const string filter = "(@status IS NULL AND m.Status IN ('New', 'Read')) OR m.Status = @status";
        var items = (await conn.QueryAsync<MessageRow>(new CommandDefinition($@"
            SELECT m.PublicId, m.Name, m.Email, m.Subject, m.Message, m.Status, m.CreatedAtUtc, m.ReadAtUtc, r.FullName AS ReadBy,
                   CAST(IIF(m.UserId IS NULL, 0, 1) AS bit) AS FromAccount
            FROM site.ContactMessage AS m LEFT JOIN auth.[User] AS r ON r.UserId = m.ReadByUserId
            WHERE {filter}
            ORDER BY IIF(m.Status = 'New', 0, 1), m.CreatedAtUtc DESC, m.ContactMessageId DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;", new { status, skip = (page - 1) * pageSize, take = pageSize }, cancellationToken: ct))).ToList();
        var counts = await conn.QuerySingleAsync<MessageCounts>(new CommandDefinition(@"
            SELECT ISNULL(SUM(IIF(Status = 'New', 1, 0)), 0) AS New, ISNULL(SUM(IIF(Status = 'Read', 1, 0)), 0) AS [Read],
                   ISNULL(SUM(IIF(Status = 'Archived', 1, 0)), 0) AS Archived FROM site.ContactMessage;", cancellationToken: ct));
        var total = status switch { "New" => counts.New, "Read" => counts.Read, "Archived" => counts.Archived, _ => counts.New + counts.Read };
        return (items, total, counts);
    }

    /// <summary>How many messages are new, and when the latest arrived (for the admin site's notification).</summary>
    public async Task<(int Count, DateTime? LatestAtUtc, string? LatestFrom)> UnreadAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleAsync<(int, DateTime?, string?)>(new CommandDefinition(@"
            SELECT (SELECT COUNT(*) FROM site.ContactMessage WHERE Status = 'New'),
                   (SELECT MAX(CreatedAtUtc) FROM site.ContactMessage WHERE Status = 'New'),
                   (SELECT TOP (1) Name FROM site.ContactMessage WHERE Status = 'New' ORDER BY CreatedAtUtc DESC, ContactMessageId DESC);",
            cancellationToken: ct));
    }

    /// <summary>Marks a message New, Read or Archived through site.usp_SetContactMessageStatus. Null when done, or the message.</summary>
    public async Task<(bool NotFound, string? Problem)> SetStatusAsync(long userId, Guid publicId, string status, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("site.usp_SetContactMessageStatus", new { PublicId = publicId, Status = status },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return (false, null);
        }
        catch (SqlException ex) when (ex.Number is >= 50020 and <= 50029)
        {
            return (ex.Number == 50025, ex.Message);
        }
    }
}
