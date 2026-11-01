using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Bringing visitors back: family dates and reminder choices (the visitor's own rows, through the database procedures),
/// and what the daily reminder job has to send (System scope, read-only, plus selfie.usp_LogReminder).
/// </summary>
public sealed class EngagementRepository(SqlConnectionFactory db)
{
    public sealed record FamilyDateRow(Guid PublicId, string Name, string Relation, string Occasion, byte DateMonth, byte DateDay, short? DateYear);

    public sealed record NewFamilyDate(string Name, string Relation, string Occasion, byte DateMonth, byte DateDay, short? DateYear);

    public sealed record ReminderSettingsRow(bool EmailReminders, bool ThenNowNudges);

    /// <summary>My family dates, by the day of the year.</summary>
    public async Task<IReadOnlyList<FamilyDateRow>> MyDatesAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return (await conn.QueryAsync<FamilyDateRow>(new CommandDefinition(@"
            SELECT PublicId, Name, Relation, Occasion, DateMonth, DateDay, DateYear FROM selfie.FamilyDate
            WHERE UserId = @userId ORDER BY DateMonth, DateDay, Name;", new { userId }, cancellationToken: ct))).ToList();
    }

    /// <summary>Adds (publicId null) or changes one of my family dates. Null + the database's message when refused.</summary>
    public async Task<(Guid? PublicId, string? Problem)> SaveDateAsync(long userId, Guid? publicId, NewFamilyDate d, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<Guid>(new CommandDefinition("selfie.usp_SaveFamilyDate",
                new { PublicId = publicId, d.Name, d.Relation, d.Occasion, d.DateMonth, d.DateDay, d.DateYear },
                commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return (null, "That isn't a real date. Please check the day and month.");
        }
    }

    /// <summary>Removes one of my family dates. False when it wasn't found.</summary>
    public async Task<bool> DeleteDateAsync(long userId, Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("selfie.usp_DeleteFamilyDate", new { PublicId = publicId },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return true;
        }
        catch (SqlException ex) when (ex.Number == 50031)
        {
            return false;
        }
    }

    /// <summary>My reminder choices (both on until I change them).</summary>
    public async Task<ReminderSettingsRow> MySettingsAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return await conn.QuerySingleOrDefaultAsync<ReminderSettingsRow>(new CommandDefinition(
            "SELECT EmailReminders, ThenNowNudges FROM selfie.ReminderSetting WHERE UserId = @userId;", new { userId }, cancellationToken: ct))
            ?? new ReminderSettingsRow(true, true);
    }

    public async Task SetSettingsAsync(long userId, bool emailReminders, bool thenNowNudges, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        await conn.ExecuteAsync(new CommandDefinition("selfie.usp_SetReminderSettings",
            new { EmailReminders = emailReminders, ThenNowNudges = thenNowNudges }, commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    /// <summary>The account behind a "switch off reminders" link (only active accounts), or null.</summary>
    public async Task<long?> ActiveUserIdAsync(Guid userPublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<long?>(new CommandDefinition(
            "SELECT UserId FROM auth.[User] WHERE PublicId = @userPublicId AND Status = 'Active';", new { userPublicId }, cancellationToken: ct));
    }

    public sealed record SelfieAnniversaryRow(Guid PublicId, string Kind, string ParentName, DateTime ApprovedAtUtc, Guid PhotoId);

    /// <summary>
    /// My approved photo selfies whose approval anniversary (1 year or more) is within <paramref name="days"/> days of today,
    /// for the on-site "a year ago you shared this" notice.
    /// </summary>
    public async Task<IReadOnlyList<SelfieAnniversaryRow>> MySelfieAnniversariesAsync(long userId, DateOnly today, int days, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var rows = await conn.QueryAsync<SelfieAnniversaryRow>(new CommandDefinition(@"
            SELECT s.PublicId, s.Kind, s.ParentName, s.ReviewedAtUtc AS ApprovedAtUtc, f.PublicId AS PhotoId
            FROM selfie.Submission AS s
            JOIN selfie.SubmissionFile AS f ON f.SubmissionId = s.SubmissionId AND f.Role = 'main'
            WHERE s.UserId = @userId AND s.Status = 'Approved' AND s.Kind IN ('real', 'ai', 'family')
              AND s.ReviewedAtUtc < DATEADD(DAY, -300, SYSUTCDATETIME());", new { userId }, cancellationToken: ct));
        return rows.Where(r => Math.Abs(Anniversary.DaysFrom(today, DateOnly.FromDateTime(r.ApprovedAtUtc))) <= days).ToList();
    }

    // ---------- The daily reminder job (System scope) ----------

    public sealed record DueDateRow(long UserId, Guid UserPublicId, string? Email, string? FullName, string PreferredLanguage, long FamilyDateId,
        string Name, string Relation, string Occasion, byte DateMonth, byte DateDay, short? DateYear);

    /// <summary>Family dates on the given days of the year, for accounts with an email and reminders switched on.</summary>
    public async Task<IReadOnlyList<DueDateRow>> DueDatesAsync(IReadOnlyCollection<(int Month, int Day)> days, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var list = new List<DueDateRow>();
        foreach (var (month, day) in days.Distinct())
            list.AddRange(await conn.QueryAsync<DueDateRow>(new CommandDefinition(@"
                SELECT u.UserId, u.PublicId AS UserPublicId, u.Email, u.FullName, u.PreferredLanguage, d.FamilyDateId, d.Name, d.Relation, d.Occasion, d.DateMonth, d.DateDay, d.DateYear
                FROM selfie.FamilyDate AS d
                JOIN auth.[User] AS u ON u.UserId = d.UserId
                LEFT JOIN selfie.ReminderSetting AS r ON r.UserId = d.UserId
                WHERE d.DateMonth = @month AND d.DateDay = @day AND u.Status = 'Active' AND u.Email IS NOT NULL
                  AND ISNULL(r.EmailReminders, 1) = 1;", new { month, day }, cancellationToken: ct)));
        return list;
    }

    public sealed record DueThenNowRow(long UserId, Guid UserPublicId, string? Email, string? FullName, string PreferredLanguage, long SubmissionId,
        Guid PublicId, string ParentName, DateTime ApprovedAtUtc);

    /// <summary>Approved photo selfies approved on this day of the year in an earlier year (accounts with nudges on).</summary>
    public async Task<IReadOnlyList<DueThenNowRow>> DueThenNowAsync(DateOnly today, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<DueThenNowRow>(new CommandDefinition(@"
            SELECT u.UserId, u.PublicId AS UserPublicId, u.Email, u.FullName, u.PreferredLanguage, s.SubmissionId, s.PublicId, s.ParentName, s.ReviewedAtUtc AS ApprovedAtUtc
            FROM selfie.Submission AS s
            JOIN auth.[User] AS u ON u.UserId = s.UserId
            LEFT JOIN selfie.ReminderSetting AS r ON r.UserId = s.UserId
            WHERE s.Status = 'Approved' AND s.Kind IN ('real', 'ai', 'family')
              AND MONTH(s.ReviewedAtUtc) = @month AND DAY(s.ReviewedAtUtc) = @day AND YEAR(s.ReviewedAtUtc) < @year
              AND EXISTS (SELECT 1 FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main')
              AND u.Status = 'Active' AND u.Email IS NOT NULL AND ISNULL(r.ThenNowNudges, 1) = 1;",
            new { month = today.Month, day = today.Day, year = today.Year }, cancellationToken: ct))).ToList();
    }

    /// <summary>Claims a reminder before sending it (true: send it now; false: already sent). Release gives it back.</summary>
    public async Task<bool> ClaimReminderAsync(long userId, string kind, long refId, DateOnly forDate, bool release, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleAsync<bool>(new CommandDefinition("selfie.usp_LogReminder",
            new { UserId = userId, Kind = kind, RefId = refId, ForDate = forDate.ToDateTime(TimeOnly.MinValue), Release = release },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }
}

/// <summary>Days between today and the next / last yearly occurrence of a date (29 February counts as 28 February in other years).</summary>
public static class Anniversary
{
    /// <summary>The date's day in the given year (29 February → 28 February when the year isn't a leap year).</summary>
    public static DateOnly InYear(int year, int month, int day) =>
        new(year, month, Math.Min(day, DateTime.DaysInMonth(year, month)));

    /// <summary>Days from today to the next occurrence (0 = today).</summary>
    public static int DaysUntil(DateOnly today, int month, int day)
    {
        var next = InYear(today.Year, month, day);
        if (next < today) next = InYear(today.Year + 1, month, day);
        return next.DayNumber - today.DayNumber;
    }

    /// <summary>Signed days from this year's occurrence of <paramref name="date"/> to today, nearest one (−182 … 182).</summary>
    public static int DaysFrom(DateOnly today, DateOnly date)
    {
        var diff = today.DayNumber - InYear(today.Year, date.Month, date.Day).DayNumber;
        return diff > 182 ? diff - 365 : diff < -182 ? diff + 365 : diff;
    }
}
