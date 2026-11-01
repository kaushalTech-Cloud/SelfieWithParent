using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Gratitude streaks (weekly check-ins: "this week I called / visited Maa") and visitors' public profile pages.
/// Writes go through selfie.usp_GratitudeCheckIn / usp_SetStreakNudges / usp_SaveMyProfile (the visitor's own rows).
/// </summary>
public sealed class GratitudeRepository(SqlConnectionFactory db)
{
    private static readonly TimeSpan India = TimeSpan.FromMinutes(330);

    /// <summary>Today in India time (weeks run Monday to Sunday).</summary>
    public static DateOnly Today(DateTimeOffset utcNow) => DateOnly.FromDateTime(utcNow.ToOffset(India).DateTime);
    public static DateOnly MondayOf(DateOnly d) => d.AddDays(-(((int)d.DayOfWeek + 6) % 7));

    public sealed record Streak(int Current, int Best, int Total, bool ThisWeek, string? ThisWeekKind, IReadOnlyList<string> Badges, IReadOnlyList<DateOnly> RecentWeeks);

    /// <summary>Weeks in a row up to this week (or up to last week, while this week isn't marked yet), the best run, badges.</summary>
    public static Streak Compute(IReadOnlyList<(DateOnly Week, string Kind)> checkIns, DateOnly today)
    {
        var weeks = checkIns.Select(c => c.Week).Distinct().OrderByDescending(w => w).ToList();
        var thisMonday = MondayOf(today);
        var thisWeek = weeks.Count > 0 && weeks[0] == thisMonday;
        int current = 0;
        var expect = thisWeek ? thisMonday : thisMonday.AddDays(-7);
        foreach (var w in weeks) { if (w == expect) { current++; expect = expect.AddDays(-7); } else if (w < expect) break; }
        int best = 0, run = 0; DateOnly? prev = null;
        foreach (var w in weeks.OrderBy(x => x)) { run = prev is { } p && w == p.AddDays(7) ? run + 1 : 1; best = Math.Max(best, run); prev = w; }
        var badges = new[] { (4, "month"), (12, "season"), (26, "half-year"), (52, "year") }.Where(b => best >= b.Item1).Select(b => b.Item2).ToList();
        return new Streak(current, best, weeks.Count, thisWeek, thisWeek ? checkIns.First(c => c.Week == thisMonday).Kind : null, badges,
            weeks.Where(w => w > thisMonday.AddDays(-7 * 12)).ToList());
    }

    public async Task<IReadOnlyList<(DateOnly Week, string Kind)>> CheckInsAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return (await conn.QueryAsync<(DateTime Week, string Kind)>(new CommandDefinition(
            "SELECT WeekStart, Kind FROM selfie.GratitudeCheckIn WHERE UserId = @userId ORDER BY WeekStart DESC;", new { userId }, cancellationToken: ct)))
            .Select(x => (DateOnly.FromDateTime(x.Week), x.Kind)).ToList();
    }

    public async Task<string?> CheckInAsync(long userId, DateOnly weekStart, string kind, string? note, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("selfie.usp_GratitudeCheckIn", new { WeekStart = weekStart.ToDateTime(TimeOnly.MinValue), Kind = kind, Note = note },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (ex.Number is >= 50070 and <= 50079) { return ex.Message; }
        catch (SqlException ex) when (ex.Number == 547) { return "Choose how you stayed in touch."; }
    }

    public async Task<bool> NudgesOnAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return await conn.ExecuteScalarAsync<bool?>(new CommandDefinition("SELECT StreakNudges FROM selfie.ReminderSetting WHERE UserId = @userId;",
            new { userId }, cancellationToken: ct)) ?? true;
    }

    public async Task SetNudgesAsync(long userId, bool on, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        await conn.ExecuteAsync(new CommandDefinition("selfie.usp_SetStreakNudges", new { On = on }, commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    // ---------- Profile ----------

    public sealed record MyProfile(string Handle, bool IsPublic, string DisplayName, string? Bio, bool ShowStreak);

    public async Task<MyProfile?> MyProfileAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return await conn.QuerySingleOrDefaultAsync<MyProfile>(new CommandDefinition(
            "SELECT Handle, IsPublic, DisplayName, Bio, ShowStreak FROM selfie.Profile WHERE UserId = @userId;", new { userId }, cancellationToken: ct));
    }

    public async Task<string?> SaveProfileAsync(long userId, MyProfile p, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("selfie.usp_SaveMyProfile", new { p.Handle, p.IsPublic, p.DisplayName, p.Bio, p.ShowStreak },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (ex.Number is >= 50070 and <= 50079) { return ex.Message; }
        catch (SqlException ex) when (ex.Number == 547) { return "The address can have 3 to 30 small letters, numbers and dashes."; }
    }

    public sealed record PublicProfileRow(long UserId, string Handle, string DisplayName, string? Bio, bool ShowStreak, DateTime MemberSinceUtc, bool HasPhoto);
    public sealed record ProfileItem(Guid PublicId, string Kind, string ParentName, string? Relation, Guid? PhotoId, Guid? VideoId, int Likes, bool IsWinner, DateTime ApprovedAtUtc);

    /// <summary>A public profile (System scope; only when the visitor switched it on and the account is active).</summary>
    public async Task<PublicProfileRow?> PublicProfileAsync(string handle, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<PublicProfileRow>(new CommandDefinition(@"
            SELECT p.UserId, p.Handle, p.DisplayName, p.Bio, p.ShowStreak, u.CreatedAtUtc AS MemberSinceUtc,
                   CAST(IIF(EXISTS (SELECT 1 FROM auth.ProfilePhoto AS f WHERE f.UserId = p.UserId), 1, 0) AS BIT) AS HasPhoto
            FROM selfie.Profile AS p JOIN auth.[User] AS u ON u.UserId = p.UserId
            WHERE p.Handle = @handle AND p.IsPublic = 1 AND u.Status = 'Active';", new { handle }, cancellationToken: ct));
    }

    /// <summary>Their approved selfies, family photos, Then &amp; Now, frames and reels (newest first) and contest wins.</summary>
    public async Task<(IReadOnlyList<ProfileItem> Items, int Wins)> ProfileItemsAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var items = (await conn.QueryAsync<ProfileItem>(new CommandDefinition(@"
            SELECT TOP (60) s.PublicId, s.Kind, s.ParentName, s.Relation,
                   (SELECT f.PublicId FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main') AS PhotoId,
                   (SELECT f.PublicId FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'video') AS VideoId,
                   (SELECT COUNT(*) FROM selfie.SubmissionLike AS l WHERE l.SubmissionId = s.SubmissionId) AS Likes,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.Contest AS c WHERE c.WinnerSubmissionId = s.SubmissionId), 1, 0) AS BIT) AS IsWinner,
                   s.ReviewedAtUtc AS ApprovedAtUtc
            FROM selfie.Submission AS s
            WHERE s.UserId = @userId AND s.Status = 'Approved' AND s.Kind <> 'memory'
            ORDER BY s.ReviewedAtUtc DESC;", new { userId }, cancellationToken: ct))).ToList();
        return (items, items.Count(i => i.IsWinner));
    }

    public async Task<IReadOnlyList<(DateOnly Week, string Kind)>> CheckInsSystemAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<(DateTime Week, string Kind)>(new CommandDefinition(
            "SELECT WeekStart, Kind FROM selfie.GratitudeCheckIn WHERE UserId = @userId ORDER BY WeekStart DESC;", new { userId }, cancellationToken: ct)))
            .Select(x => (DateOnly.FromDateTime(x.Week), x.Kind)).ToList();
    }

    public async Task<SelfieRepository.FileData?> ProfilePhotoAsync(string handle, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<SelfieRepository.FileData>(new CommandDefinition(@"
            SELECT f.ContentType, f.Data FROM auth.ProfilePhoto AS f JOIN selfie.Profile AS p ON p.UserId = f.UserId
            JOIN auth.[User] AS u ON u.UserId = p.UserId
            WHERE p.Handle = @handle AND p.IsPublic = 1 AND u.Status = 'Active';", new { handle }, cancellationToken: ct));
    }

    // ---------- Sunday reminder (System scope) ----------

    public sealed record StreakNudgeRow(long UserId, Guid UserPublicId, string Email, string? FullName, int Weeks);

    /// <summary>Visitors with a streak going (marked last week) who haven't marked this week, with the reminder on.</summary>
    public async Task<IReadOnlyList<StreakNudgeRow>> DueNudgesAsync(DateOnly monday, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<StreakNudgeRow>(new CommandDefinition(@"
            SELECT u.UserId, u.PublicId AS UserPublicId, u.Email, u.FullName,
                   (SELECT COUNT(*) FROM selfie.GratitudeCheckIn AS x WHERE x.UserId = u.UserId) AS Weeks
            FROM auth.[User] AS u
            LEFT JOIN selfie.ReminderSetting AS r ON r.UserId = u.UserId
            WHERE u.Status = 'Active' AND u.Email IS NOT NULL AND ISNULL(r.StreakNudges, 1) = 1
              AND EXISTS (SELECT 1 FROM selfie.GratitudeCheckIn AS c WHERE c.UserId = u.UserId AND c.WeekStart = DATEADD(DAY, -7, @monday))
              AND NOT EXISTS (SELECT 1 FROM selfie.GratitudeCheckIn AS c WHERE c.UserId = u.UserId AND c.WeekStart = @monday);",
            new { monday = monday.ToDateTime(TimeOnly.MinValue) }, cancellationToken: ct))).ToList();
    }
}
