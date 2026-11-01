using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Selfies, family photos and videos shared by visitors, stored in the database with their files.
/// Visitors create them through selfie.usp_CreateSubmission (always 'Pending'); staff review them through
/// selfie.usp_ReviewSubmission, which checks the reviewer's role again in the database.
/// </summary>
public sealed class SelfieRepository(SqlConnectionFactory db)
{
    public sealed record NewFile(string ContentType, byte[] Data, string FileName);

    public sealed record NewSubmission(string Kind, string YourName, string ParentName, string? Relation, string? FamilySize,
        string? Generations, short? MemoryYear, string CountryCode, string? StateName, string? City, bool IsAdult,
        string? GuardianName, string? GuardianMobile, string? Message, NewFile? Main, NewFile? Source, NewFile? Video, NewFile? Voice = null,
        NewFile? Then = null, short? ThenYear = null, short? NowYear = null);

    public sealed record Created(Guid PublicId, string Reference);

    /// <summary>Saves a submission and its files together. Returns null + the database's message when refused.</summary>
    public async Task<(Created? Result, string? Problem)> CreateAsync(long userId, NewSubmission s, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var p = new DynamicParameters();
        p.Add("Kind", s.Kind); p.Add("YourName", s.YourName); p.Add("ParentName", s.ParentName); p.Add("Relation", s.Relation);
        p.Add("FamilySize", s.FamilySize); p.Add("Generations", s.Generations); p.Add("MemoryYear", s.MemoryYear);
        p.Add("CountryCode", s.CountryCode); p.Add("StateName", s.StateName); p.Add("City", s.City); p.Add("IsAdult", s.IsAdult);
        p.Add("GuardianName", s.GuardianName); p.Add("GuardianMobile", s.GuardianMobile); p.Add("Message", s.Message);
        p.Add("ThenYear", s.ThenYear); p.Add("NowYear", s.NowYear);
        foreach (var (prefix, f) in new[] { ("Main", s.Main), ("Source", s.Source), ("Video", s.Video), ("Voice", s.Voice), ("Then", s.Then) })
        {
            p.Add(prefix + "Type", f?.ContentType);
            p.Add(prefix + "Data", f?.Data, DbType.Binary, size: -1);
            p.Add(prefix + "Name", f?.FileName);
        }
        try
        {
            var created = await conn.QuerySingleAsync<Created>(new CommandDefinition("selfie.usp_CreateSubmission", p,
                commandType: CommandType.StoredProcedure, commandTimeout: 120, cancellationToken: ct));
            return (created, null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return (null, "Some of the details aren't valid. Please check them and try again.");   // a table rule refused it
        }
    }

    // ---------- Review (System scope; the controller has already checked the reviewer's role) ----------

    public sealed record FileInfoRow(Guid SubmissionPublicId, Guid PublicId, string Role, string ContentType, int SizeBytes, string? FileName);

    public sealed record SubmissionRow(Guid PublicId, string Reference, string Kind, string YourName, string ParentName, string? Relation,
        string? FamilySize, string? Generations, short? MemoryYear, string CountryCode, string? StateName, string? City, bool IsAdult,
        string? GuardianName, string? GuardianMobile, string? Message, string Status, string? ReviewNote, string? ReviewedBy,
        DateTime? ReviewedAtUtc, DateTime CreatedAtUtc, Guid OwnerPublicId, string? OwnerEmail,
        short? ThenYear = null, short? NowYear = null, bool IsFeatured = false, int Candles = 0,
        string? FrameStyle = null, string? Festival = null, string? SourceReference = null)
    {
        public IReadOnlyList<FileInfoRow> Files { get; set; } = [];
    }

    public sealed record Counts(int Pending, int Approved, int Rejected);

    /// <summary>One page of submissions with a status (pending: oldest first; reviewed: newest review first).</summary>
    public async Task<(IReadOnlyList<SubmissionRow> Items, int Total, Counts Counts)> ListAsync(string status, int page, int pageSize, CancellationToken ct)
        => await ListAsync(status, null, page, pageSize, ct);

    /// <summary>
    /// Submissions with a status (pending: oldest first; reviewed: newest review first), or — with <paramref name="owner"/> and
    /// no status — everything one visitor shared, newest first.
    /// </summary>
    public async Task<(IReadOnlyList<SubmissionRow> Items, int Total, Counts Counts)> ListAsync(string? status, Guid? owner, int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var order = owner is not null ? "s.CreatedAtUtc DESC, s.SubmissionId DESC"
            : status == "Pending" ? "s.CreatedAtUtc, s.SubmissionId" : "s.ReviewedAtUtc DESC, s.SubmissionId DESC";
        var items = (await conn.QueryAsync<SubmissionRow>(new CommandDefinition($@"
            SELECT s.PublicId, CONCAT('SWP-', RIGHT(CONCAT('000000', s.SubmissionId), 6)) AS Reference, s.Kind, s.YourName, s.ParentName, s.Relation, s.FamilySize, s.Generations, s.MemoryYear,
                   s.CountryCode, s.StateName, s.City, s.IsAdult, s.GuardianName, s.GuardianMobile, s.Message, s.Status, s.ReviewNote,
                   r.FullName AS ReviewedBy, s.ReviewedAtUtc, s.CreatedAtUtc, o.PublicId AS OwnerPublicId, o.Email AS OwnerEmail,
                   s.ThenYear, s.NowYear, s.IsFeatured, (SELECT COUNT(*) FROM selfie.Candle AS c WHERE c.SubmissionId = s.SubmissionId) AS Candles,
                   s.FrameStyle, s.Festival,
                   IIF(s.SourceSubmissionId IS NULL, NULL, CONCAT('SWP-', RIGHT(CONCAT('000000', s.SourceSubmissionId), 6))) AS SourceReference
            FROM selfie.Submission AS s
            JOIN auth.[User] AS o ON o.UserId = s.UserId
            LEFT JOIN auth.[User] AS r ON r.UserId = s.ReviewedByUserId
            WHERE (@status IS NULL OR s.Status = @status) AND (@owner IS NULL OR o.PublicId = @owner)
            ORDER BY {order}
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;",
            new { status, owner, skip = (page - 1) * pageSize, take = pageSize }, cancellationToken: ct))).ToList();

        if (items.Count > 0)
        {
            var files = (await conn.QueryAsync<FileInfoRow>(new CommandDefinition(@"
                SELECT s.PublicId AS SubmissionPublicId, f.PublicId, f.Role, f.ContentType, f.SizeBytes, f.FileName
                FROM selfie.SubmissionFile AS f JOIN selfie.Submission AS s ON s.SubmissionId = f.SubmissionId
                WHERE s.PublicId IN @ids ORDER BY f.Role;", new { ids = items.Select(i => i.PublicId) }, cancellationToken: ct))).ToLookup(f => f.SubmissionPublicId);
            foreach (var i in items) i.Files = files[i.PublicId].ToList();
        }

        var counts = await conn.QuerySingleAsync<Counts>(new CommandDefinition(@"
            SELECT ISNULL(SUM(IIF(s.Status = 'Pending', 1, 0)), 0) AS Pending, ISNULL(SUM(IIF(s.Status = 'Approved', 1, 0)), 0) AS Approved,
                   ISNULL(SUM(IIF(s.Status = 'Rejected', 1, 0)), 0) AS Rejected
            FROM selfie.Submission AS s JOIN auth.[User] AS o ON o.UserId = s.UserId
            WHERE @owner IS NULL OR o.PublicId = @owner;", new { owner }, cancellationToken: ct));
        var total = status switch
        {
            "Pending" => counts.Pending, "Approved" => counts.Approved, "Rejected" => counts.Rejected,
            _ => counts.Pending + counts.Approved + counts.Rejected
        };
        return (items, total, counts);
    }

    public sealed record FileData(string ContentType, byte[] Data);

    // ---------- Admin dashboard and "uploads by visitor" (System scope; the controller has checked the role) ----------

    public sealed record DashboardNumbers(int Pending, DateTime? OldestPendingAtUtc, int ApprovedThisWeek, int ApprovedLastWeek,
        int Total, int Approved, int Rejected, int Uploaders, int SharedThisWeek, int SharedLastWeek,
        int Photos, int Videos, int VideosThisWeek, int VideosLastWeek, int VoiceNotes,
        int Visitors, int NewVisitorsThisWeek, int NewVisitorsLastWeek);

    public sealed record DayCount(DateTime Day, int Count);
    public sealed record KindCount(string Kind, int Count);
    public sealed record LatestRow(Guid PublicId, long SubmissionId, string Kind, string YourName, string ParentName, string Status,
        DateTime CreatedAtUtc, bool HasPhoto, bool HasVideo, bool HasVoice);

    public async Task<(DashboardNumbers Numbers, IReadOnlyList<DayCount> Days, IReadOnlyList<KindCount> Kinds, IReadOnlyList<LatestRow> Latest)>
        DashboardAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var now = DateTime.UtcNow;
        var p = new { week = now.AddDays(-7), twoWeeks = now.AddDays(-14), days = now.Date.AddDays(-6) };
        var numbers = await conn.QuerySingleAsync<DashboardNumbers>(new CommandDefinition(@"
            SELECT
                (SELECT COUNT(*) FROM selfie.Submission WHERE Status = 'Pending') AS Pending,
                (SELECT MIN(CreatedAtUtc) FROM selfie.Submission WHERE Status = 'Pending') AS OldestPendingAtUtc,
                (SELECT COUNT(*) FROM selfie.Submission WHERE Status = 'Approved' AND ReviewedAtUtc >= @week) AS ApprovedThisWeek,
                (SELECT COUNT(*) FROM selfie.Submission WHERE Status = 'Approved' AND ReviewedAtUtc >= @twoWeeks AND ReviewedAtUtc < @week) AS ApprovedLastWeek,
                (SELECT COUNT(*) FROM selfie.Submission) AS Total,
                (SELECT COUNT(*) FROM selfie.Submission WHERE Status = 'Approved') AS Approved,
                (SELECT COUNT(*) FROM selfie.Submission WHERE Status = 'Rejected') AS Rejected,
                (SELECT COUNT(DISTINCT UserId) FROM selfie.Submission) AS Uploaders,
                (SELECT COUNT(*) FROM selfie.Submission WHERE CreatedAtUtc >= @week) AS SharedThisWeek,
                (SELECT COUNT(*) FROM selfie.Submission WHERE CreatedAtUtc >= @twoWeeks AND CreatedAtUtc < @week) AS SharedLastWeek,
                (SELECT COUNT(*) FROM selfie.SubmissionFile WHERE Role = 'main') AS Photos,
                (SELECT COUNT(*) FROM selfie.SubmissionFile WHERE Role = 'video') AS Videos,
                (SELECT COUNT(*) FROM selfie.SubmissionFile WHERE Role = 'video' AND CreatedAtUtc >= @week) AS VideosThisWeek,
                (SELECT COUNT(*) FROM selfie.SubmissionFile WHERE Role = 'video' AND CreatedAtUtc >= @twoWeeks AND CreatedAtUtc < @week) AS VideosLastWeek,
                (SELECT COUNT(*) FROM selfie.SubmissionFile WHERE Role = 'voice') AS VoiceNotes,
                (SELECT COUNT(*) FROM auth.[User] AS u WHERE u.Status <> 'Deleted' AND NOT EXISTS
                    (SELECT 1 FROM auth.UserRole AS ur JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND r.RoleCode <> 'Visitor')) AS Visitors,
                (SELECT COUNT(*) FROM auth.[User] AS u WHERE u.Status <> 'Deleted' AND u.CreatedAtUtc >= @week AND NOT EXISTS
                    (SELECT 1 FROM auth.UserRole AS ur JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND r.RoleCode <> 'Visitor')) AS NewVisitorsThisWeek,
                (SELECT COUNT(*) FROM auth.[User] AS u WHERE u.Status <> 'Deleted' AND u.CreatedAtUtc >= @twoWeeks AND u.CreatedAtUtc < @week AND NOT EXISTS
                    (SELECT 1 FROM auth.UserRole AS ur JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND r.RoleCode <> 'Visitor')) AS NewVisitorsLastWeek;",
            p, cancellationToken: ct));
        var days = (await conn.QueryAsync<DayCount>(new CommandDefinition(@"
            SELECT CAST(CreatedAtUtc AS date) AS Day, COUNT(*) AS Count FROM selfie.Submission
            WHERE CreatedAtUtc >= @days GROUP BY CAST(CreatedAtUtc AS date);", p, cancellationToken: ct))).ToList();
        var kinds = (await conn.QueryAsync<KindCount>(new CommandDefinition(
            "SELECT Kind, COUNT(*) AS Count FROM selfie.Submission GROUP BY Kind;", cancellationToken: ct))).ToList();
        var latest = (await conn.QueryAsync<LatestRow>(new CommandDefinition(@"
            SELECT TOP (5) s.PublicId, s.SubmissionId, s.Kind, s.YourName, s.ParentName, s.Status, s.CreatedAtUtc,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.SubmissionFile f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main'), 1, 0) AS bit) AS HasPhoto,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.SubmissionFile f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'video'), 1, 0) AS bit) AS HasVideo,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.SubmissionFile f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'voice'), 1, 0) AS bit) AS HasVoice
            FROM selfie.Submission AS s WHERE s.Status = 'Pending' ORDER BY s.CreatedAtUtc, s.SubmissionId;", cancellationToken: ct))).ToList();
        return (numbers, days, kinds, latest);
    }

    // ---------- Activity: uploads and review decisions over time ----------

    public sealed record ActivityRow(string Type, DateTime AtUtc, Guid PublicId, long SubmissionId, string Kind, string YourName, string ParentName,
        string? Reviewer, string? Note, bool HasPhoto, bool HasVideo, bool HasVoice);

    public sealed record ActivityDay(DateTime Day, int Shared, int Approved, int Rejected);

    /// <summary>
    /// What happened, newest first: "shared" when a visitor uploaded, "Approved" / "Rejected" for the latest review decision.
    /// Plus a per-day count over the last <paramref name="days"/> days. Filter: all / shared / reviewed.
    /// </summary>
    public async Task<(IReadOnlyList<ActivityRow> Items, int Total, IReadOnlyList<ActivityDay> Days)> ActivityAsync(
        string filter, int days, int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var since = DateTime.UtcNow.Date.AddDays(1 - days);
        const string events = @"
            SELECT 'shared' AS Type, s.CreatedAtUtc AS AtUtc, s.SubmissionId, NULL AS ReviewerId, NULL AS Note FROM selfie.Submission AS s
            WHERE @filter IN ('all', 'shared') AND s.CreatedAtUtc >= @since
            UNION ALL
            SELECT s.Status, s.ReviewedAtUtc, s.SubmissionId, s.ReviewedByUserId, s.ReviewNote FROM selfie.Submission AS s
            WHERE @filter IN ('all', 'reviewed') AND s.ReviewedAtUtc IS NOT NULL AND s.ReviewedAtUtc >= @since";
        var p = new { filter, since, skip = (page - 1) * pageSize, take = pageSize };
        var items = (await conn.QueryAsync<ActivityRow>(new CommandDefinition($@"
            SELECT e.Type, e.AtUtc, s.PublicId, s.SubmissionId, s.Kind, s.YourName, s.ParentName,
                   COALESCE(r.FullName, IIF(r.UserId IS NULL, NULL, 'A staff member')) AS Reviewer, e.Note,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.SubmissionFile f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main'), 1, 0) AS bit) AS HasPhoto,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.SubmissionFile f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'video'), 1, 0) AS bit) AS HasVideo,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.SubmissionFile f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'voice'), 1, 0) AS bit) AS HasVoice
            FROM ({events}) AS e
            JOIN selfie.Submission AS s ON s.SubmissionId = e.SubmissionId
            LEFT JOIN auth.[User] AS r ON r.UserId = e.ReviewerId
            ORDER BY e.AtUtc DESC, s.SubmissionId DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;", p, cancellationToken: ct))).ToList();
        var total = await conn.QuerySingleAsync<int>(new CommandDefinition($"SELECT COUNT(*) FROM ({events}) AS e;", p, cancellationToken: ct));
        var perDay = (await conn.QueryAsync<ActivityDay>(new CommandDefinition(@"
            SELECT d.Day, SUM(d.Shared) AS Shared, SUM(d.Approved) AS Approved, SUM(d.Rejected) AS Rejected
            FROM (SELECT CAST(CreatedAtUtc AS date) AS Day, 1 AS Shared, 0 AS Approved, 0 AS Rejected FROM selfie.Submission WHERE CreatedAtUtc >= @since
                  UNION ALL
                  SELECT CAST(ReviewedAtUtc AS date), 0, IIF(Status = 'Approved', 1, 0), IIF(Status = 'Rejected', 1, 0)
                  FROM selfie.Submission WHERE ReviewedAtUtc >= @since) AS d
            GROUP BY d.Day;", p, cancellationToken: ct))).ToList();
        return (items, total, perDay);
    }

    public sealed record UploaderRow(Guid PublicId, string? FullName, string? Email, string? MobileCountryCode, string? MobileNumber, string Status,
        int Submissions, int Pending, int Approved, int Rejected, int Photos, int Videos, int VoiceNotes, DateTime FirstAtUtc, DateTime LastAtUtc);

    /// <summary>Every visitor who has shared something, with what and how many (latest sharer first). Search: name / email / mobile digits.</summary>
    public async Task<(IReadOnlyList<UploaderRow> Items, int Total)> UploadersAsync(string? search, int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var term = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        var digits = term is null ? "" : new string(term.Where(char.IsAsciiDigit).ToArray());
        const string from = @"
            FROM (SELECT s.UserId, COUNT(*) AS Submissions,
                         SUM(IIF(s.Status = 'Pending', 1, 0)) AS Pending, SUM(IIF(s.Status = 'Approved', 1, 0)) AS Approved,
                         SUM(IIF(s.Status = 'Rejected', 1, 0)) AS Rejected,
                         SUM(f.Photos) AS Photos, SUM(f.Videos) AS Videos, SUM(f.Voices) AS VoiceNotes,
                         MIN(s.CreatedAtUtc) AS FirstAtUtc, MAX(s.CreatedAtUtc) AS LastAtUtc
                  FROM selfie.Submission AS s
                  CROSS APPLY (SELECT ISNULL(SUM(IIF(x.Role = 'main', 1, 0)), 0) AS Photos, ISNULL(SUM(IIF(x.Role = 'video', 1, 0)), 0) AS Videos,
                                      ISNULL(SUM(IIF(x.Role = 'voice', 1, 0)), 0) AS Voices
                               FROM selfie.SubmissionFile AS x WHERE x.SubmissionId = s.SubmissionId) AS f
                  GROUP BY s.UserId) AS a
            JOIN auth.[User] AS u ON u.UserId = a.UserId
            WHERE @term IS NULL
               OR u.FullName LIKE '%' + @term + '%'
               OR u.Email LIKE '%' + @term + '%'
               OR (LEN(@digits) >= 3 AND u.MobileNumber LIKE '%' + @digits)";
        var p = new { term, digits, skip = (page - 1) * pageSize, take = pageSize };
        var items = (await conn.QueryAsync<UploaderRow>(new CommandDefinition($@"
            SELECT u.PublicId, u.FullName, u.Email, u.MobileCountryCode, u.MobileNumber, u.Status,
                   a.Submissions, a.Pending, a.Approved, a.Rejected, a.Photos, a.Videos, a.VoiceNotes, a.FirstAtUtc, a.LastAtUtc
            {from}
            ORDER BY a.LastAtUtc DESC, u.UserId
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;", p, cancellationToken: ct))).ToList();
        var total = await conn.QuerySingleAsync<int>(new CommandDefinition($"SELECT COUNT(*) {from};", p, cancellationToken: ct));
        return (items, total);
    }

    // ---------- Public gallery: approved submissions only (System scope, read-only) ----------

    /// <summary>
    /// Gallery tabs: with parents / with grandparents (by relation), AI-made, family, anything with a video;
    /// and for the Community pages: Then &amp; Now pairs, Memory Wall tributes, and Featured Stories (picked by staff).
    /// </summary>
    public static readonly string[] GalleryTabs = ["parent", "grand", "ai", "family", "video", "thennow", "memory", "featured"];

    private const string TabFilter = @"
        (@tab = 'parent' AND s.Kind IN ('real', 'memory') AND s.Relation IN ('Mother', 'Father', 'Both parents', 'Step-parent', 'Guardian'))
     OR (@tab = 'grand'  AND s.Kind IN ('real', 'memory') AND s.Relation IN ('Grandmother', 'Grandfather', 'Grandparents'))
     OR (@tab = 'ai'     AND s.Kind = 'ai')
     OR (@tab = 'family' AND s.Kind = 'family')
     OR (@tab = 'video'  AND EXISTS (SELECT 1 FROM selfie.SubmissionFile AS v WHERE v.SubmissionId = s.SubmissionId AND v.Role = 'video'))
     OR (@tab = 'thennow' AND s.Kind = 'thennow')
     OR (@tab = 'memory' AND s.Kind = 'memory')
     OR (@tab = 'featured' AND s.IsFeatured = 1)
     OR (@tab = 'latest' AND s.Kind NOT IN ('frame', 'reel'))";   // frames and reels repeat a selfie that is already in the gallery

    internal const string GalleryColumns = @"
            s.PublicId, s.Kind, s.YourName, s.ParentName, s.Relation, s.MemoryYear, s.CountryCode, s.StateName, s.City, s.Message,
                   s.ReviewedAtUtc AS ApprovedAtUtc,
                   (SELECT f.PublicId FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main') AS PhotoId,
                   (SELECT f.PublicId FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'video') AS VideoId,
                   (SELECT f.PublicId FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'voice') AS VoiceId,
                   (SELECT f.PublicId FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'then') AS ThenId,
                   s.ThenYear, s.NowYear, s.IsFeatured,
                   (SELECT COUNT(*) FROM selfie.Candle AS c WHERE c.SubmissionId = s.SubmissionId) AS Candles,
                   (SELECT COUNT(*) FROM selfie.SubmissionLike AS l WHERE l.SubmissionId = s.SubmissionId) AS Likes,
                   CAST(IIF(EXISTS (SELECT 1 FROM selfie.Contest AS w WHERE w.WinnerSubmissionId = s.SubmissionId), 1, 0) AS bit) AS IsWinner";

    public sealed record GalleryRow(Guid PublicId, string Kind, string YourName, string ParentName, string? Relation, short? MemoryYear,
        string CountryCode, string? StateName, string? City, string? Message, DateTime ApprovedAtUtc, Guid? PhotoId, Guid? VideoId, Guid? VoiceId,
        Guid? ThenId, short? ThenYear, short? NowYear, bool IsFeatured, int Candles, int Likes, bool IsWinner);

    /// <summary>One page of approved submissions for a tab (newest approval first), and how many each tab has.</summary>
    public async Task<(IReadOnlyList<GalleryRow> Items, int Total, IReadOnlyDictionary<string, int> Counts)> GalleryAsync(
        string tab, int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var items = (await conn.QueryAsync<GalleryRow>(new CommandDefinition($@"
            SELECT {GalleryColumns}
            FROM selfie.Submission AS s
            WHERE s.Status = 'Approved' AND ({TabFilter})
            ORDER BY IIF(@tab = 'featured', s.FeaturedAtUtc, s.ReviewedAtUtc) DESC, s.SubmissionId DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;", new { tab, skip = (page - 1) * pageSize, take = pageSize }, cancellationToken: ct))).ToList();

        var counts = new Dictionary<string, int>();
        foreach (var t in GalleryTabs)
            counts[t] = await conn.QuerySingleAsync<int>(new CommandDefinition(
                $"SELECT COUNT(*) FROM selfie.Submission AS s WHERE s.Status = 'Approved' AND ({TabFilter});", new { tab = t }, cancellationToken: ct));
        // The Memory Wall shows how many candles are lit on the whole wall
        if (tab == "memory")
            counts["candles"] = await conn.QuerySingleAsync<int>(new CommandDefinition(@"
                SELECT COUNT(*) FROM selfie.Candle AS c JOIN selfie.Submission AS s ON s.SubmissionId = c.SubmissionId
                WHERE s.Status = 'Approved' AND s.Kind = 'memory';", cancellationToken: ct));
        var total = counts.TryGetValue(tab, out var n) ? n : await conn.QuerySingleAsync<int>(new CommandDefinition(
            "SELECT COUNT(*) FROM selfie.Submission WHERE Status = 'Approved' AND Kind NOT IN ('frame', 'reel');", cancellationToken: ct));
        return (items, total, counts);
    }

    /// <summary>One approved submission (its story page), or null when it doesn't exist or isn't approved.</summary>
    public async Task<GalleryRow?> GetApprovedAsync(Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<GalleryRow>(new CommandDefinition($@"
            SELECT {GalleryColumns}
            FROM selfie.Submission AS s
            WHERE s.PublicId = @publicId AND s.Status = 'Approved';", new { publicId }, cancellationToken: ct));
    }

    /// <summary>The gallery tab a submission belongs to (its photo's tab; video-only ones are in "video").</summary>
    public static string TabOf(GalleryRow r) =>
        r.Kind == "frame" ? "frames"
        : r.Kind == "family" ? "family"
        : r.Kind == "ai" ? "ai"
        : r.Kind == "thennow" ? "thennow"
        : r.PhotoId is null ? "video"
        : r.Relation is "Grandmother" or "Grandfather" or "Grandparents" ? "grand"
        : "parent";

    public sealed record PlaceRow(string CountryCode, string? StateName, string? City);

    /// <summary>Where I said I was on my latest upload (so the upload form needn't ask again), or null. My own rows only.</summary>
    public async Task<PlaceRow?> MyLastPlaceAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return await conn.QuerySingleOrDefaultAsync<PlaceRow>(new CommandDefinition(@"
            SELECT TOP (1) CountryCode, StateName, City FROM selfie.Submission
            WHERE UserId = @userId AND Kind NOT IN ('frame', 'reel') ORDER BY CreatedAtUtc DESC, SubmissionId DESC;", new { userId }, cancellationToken: ct));
    }

    // ---------- Photo Frames: the owner shares a selfie in a frame; a gallery filtered by country and festival ----------

    /// <summary>Status: Pending (waits for review) or Approved (auto-approve is on).</summary>
    public sealed record FrameCreated(Guid PublicId, string Reference, string Status);

    /// <summary>
    /// Shares my approved selfie in a frame through selfie.usp_ShareFrame: pending review, or approved straight away when
    /// staff have switched auto-approve on. Null + the message when refused.
    /// </summary>
    public async Task<(FrameCreated? Result, string? Problem)> ShareFrameAsync(long userId, Guid sourcePublicId, string frameStyle, string? festival,
        NewFile picture, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var p = new DynamicParameters();
        p.Add("SourcePublicId", sourcePublicId); p.Add("FrameStyle", frameStyle); p.Add("Festival", festival);
        p.Add("PictureType", picture.ContentType); p.Add("PictureData", picture.Data, DbType.Binary, size: -1); p.Add("PictureName", picture.FileName);
        try
        {
            return (await conn.QuerySingleAsync<FrameCreated>(new CommandDefinition("selfie.usp_ShareFrame", p,
                commandType: CommandType.StoredProcedure, commandTimeout: 120, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return (null, "Some of the details aren't valid. Please check them and try again.");
        }
    }

    public sealed record SharedFrameRow(string FrameStyle, string Status);

    /// <summary>Shares my approved selfie's reel to the Videos gallery through selfie.usp_ShareReel (pending review).</summary>
    public async Task<(Created? Result, string? Problem)> ShareReelAsync(long userId, Guid sourcePublicId, NewFile video, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var p = new DynamicParameters();
        p.Add("SourcePublicId", sourcePublicId); p.Add("VideoType", video.ContentType);
        p.Add("VideoData", video.Data, DbType.Binary, size: -1); p.Add("VideoName", video.FileName);
        try
        {
            return (await conn.QuerySingleAsync<Created>(new CommandDefinition("selfie.usp_ShareReel", p,
                commandType: CommandType.StoredProcedure, commandTimeout: 120, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return (null, "The reel must be an MP4 or WebM video up to 50 MB.");
        }
    }

    /// <summary>Whether I can share this selfie's reel (my own approved photo selfie), and my latest reel of it (Pending / Approved), if any.</summary>
    public async Task<(bool Owner, string? Status)> ReelShareStateAsync(long userId, Guid sourcePublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var source = await conn.QuerySingleOrDefaultAsync<long?>(new CommandDefinition(@"
            SELECT s.SubmissionId FROM selfie.Submission AS s
            WHERE s.PublicId = @sourcePublicId AND s.UserId = @userId AND s.Status = 'Approved' AND s.Kind NOT IN ('frame', 'reel')
              AND EXISTS (SELECT 1 FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main');",
            new { sourcePublicId, userId }, cancellationToken: ct));
        if (source is null) return (false, null);
        var status = await conn.QuerySingleOrDefaultAsync<string?>(new CommandDefinition(@"
            SELECT TOP (1) Status FROM selfie.Submission WHERE SourceSubmissionId = @source AND Kind = 'reel' AND Status IN ('Pending', 'Approved')
            ORDER BY CreatedAtUtc DESC;", new { source }, cancellationToken: ct));
        return (true, status);
    }

    private const string AutoApproveKey = "frames.auto-approve";

    /// <summary>Whether shared photo frames go straight to the gallery (site setting, read in System scope).</summary>
    public async Task<bool> FramesAutoApproveAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            "SELECT Value FROM site.Setting WHERE SettingKey = @key;", new { key = AutoApproveKey }, cancellationToken: ct)) == "1";
    }

    /// <summary>Switches auto-approve for photo frames through site.usp_SetSetting (the database checks SuperAdmin / Admin).</summary>
    public async Task<string?> SetFramesAutoApproveAsync(long userId, bool on, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("site.usp_SetSetting", new { SettingKey = AutoApproveKey, Value = on ? "1" : "0" },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (ex.Number is >= 50020 and <= 50029)
        {
            return ex.Message;
        }
    }

    /// <summary>
    /// Whether the selfie is my own approved photo selfie (so I can share it in a frame), and the frames I've already shared of it.
    /// My scope: row-level security only shows my own rows, so someone else's selfie is simply not found.
    /// </summary>
    public async Task<(bool Owner, IReadOnlyList<SharedFrameRow> Shared)> FrameShareStateAsync(long userId, Guid sourcePublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var source = await conn.QuerySingleOrDefaultAsync<long?>(new CommandDefinition(@"
            SELECT s.SubmissionId FROM selfie.Submission AS s
            WHERE s.PublicId = @sourcePublicId AND s.UserId = @userId AND s.Status = 'Approved' AND s.Kind NOT IN ('frame', 'reel')
              AND EXISTS (SELECT 1 FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main');",
            new { sourcePublicId, userId }, cancellationToken: ct));
        if (source is null) return (false, []);
        var shared = (await conn.QueryAsync<SharedFrameRow>(new CommandDefinition(@"
            SELECT FrameStyle, Status FROM selfie.Submission WHERE SourceSubmissionId = @source AND Status IN ('Pending', 'Approved');",
            new { source }, cancellationToken: ct))).ToList();
        return (true, shared);
    }

    public sealed record FrameRow(Guid PublicId, string YourName, string ParentName, string CountryCode, string? StateName, string? City,
        string? Festival, string FrameStyle, DateTime ApprovedAtUtc, Guid PhotoId, Guid? SourcePublicId, string SourceKind, int Likes);

    public sealed record FilterCount(string Key, int Count);

    /// <summary>
    /// One page of approved framed photos (newest first), filtered by country and festival ('everyday' = frames without a
    /// festival), and how many there are for each country and festival (to build the filters).
    /// </summary>
    public async Task<(IReadOnlyList<FrameRow> Items, int Total, IReadOnlyList<FilterCount> Countries, IReadOnlyList<FilterCount> Festivals)> FramesAsync(
        string? country, string? festival, int page, int pageSize, CancellationToken ct)
    {
        const string where = @"s.Status = 'Approved' AND s.Kind = 'frame'";
        const string filters = @"(@country IS NULL OR s.CountryCode = @country)
              AND (@festival IS NULL OR (@festival = 'everyday' AND s.Festival IS NULL) OR s.Festival = @festival)";
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var args = new { country, festival, skip = (page - 1) * pageSize, take = pageSize };
        var items = (await conn.QueryAsync<FrameRow>(new CommandDefinition($@"
            SELECT s.PublicId, s.YourName, s.ParentName, s.CountryCode, s.StateName, s.City, s.Festival, s.FrameStyle,
                   s.ReviewedAtUtc AS ApprovedAtUtc, f.PublicId AS PhotoId,
                   IIF(src.Status = 'Approved', src.PublicId, NULL) AS SourcePublicId, src.Kind AS SourceKind,
                   (SELECT COUNT(*) FROM selfie.SubmissionLike AS l WHERE l.SubmissionId = s.SubmissionId) AS Likes
            FROM selfie.Submission AS s
            JOIN selfie.SubmissionFile AS f ON f.SubmissionId = s.SubmissionId AND f.Role = 'main'
            JOIN selfie.Submission AS src ON src.SubmissionId = s.SourceSubmissionId
            WHERE {where} AND {filters}
            ORDER BY s.ReviewedAtUtc DESC, s.SubmissionId DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;", args, cancellationToken: ct))).ToList();
        var total = await conn.QuerySingleAsync<int>(new CommandDefinition(
            $"SELECT COUNT(*) FROM selfie.Submission AS s WHERE {where} AND {filters};", args, cancellationToken: ct));
        // Each filter's choices count within the other filter (e.g. the festivals shared from the chosen country)
        var countries = (await conn.QueryAsync<FilterCount>(new CommandDefinition($@"
            SELECT s.CountryCode AS [Key], COUNT(*) AS Count FROM selfie.Submission AS s
            WHERE {where} AND (@festival IS NULL OR (@festival = 'everyday' AND s.Festival IS NULL) OR s.Festival = @festival)
            GROUP BY s.CountryCode ORDER BY Count DESC;", args, cancellationToken: ct))).ToList();
        var festivals = (await conn.QueryAsync<FilterCount>(new CommandDefinition($@"
            SELECT ISNULL(s.Festival, 'everyday') AS [Key], COUNT(*) AS Count FROM selfie.Submission AS s
            WHERE {where} AND (@country IS NULL OR s.CountryCode = @country)
            GROUP BY ISNULL(s.Festival, 'everyday') ORDER BY Count DESC;", args, cancellationToken: ct))).ToList();
        return (items, total, countries, festivals);
    }

    // ---------- Photo of the Week / festival contests ----------

    /// <summary>The kinds of photo that take part in contests (not frames, which repeat a selfie, nor Memory Wall tributes).</summary>
    private const string ContestKinds = "('real', 'ai', 'family', 'thennow')";

    public sealed record ContestRow(long ContestId, Guid PublicId, string Kind, string Title, DateTime StartsAtUtc, DateTime EndsAtUtc,
        DateTime? ClosedAtUtc, int? WinnerLikes, Guid? WinnerPublicId, string? WinnerReference, DateTime CreatedAtUtc);

    private const string ContestColumns = @"
            c.ContestId, c.PublicId, c.Kind, c.Title, c.StartsAtUtc, c.EndsAtUtc, c.ClosedAtUtc, c.WinnerLikes,
            w.PublicId AS WinnerPublicId, IIF(w.SubmissionId IS NULL, NULL, CONCAT('SWP-', RIGHT(CONCAT('000000', w.SubmissionId), 6))) AS WinnerReference,
            c.CreatedAtUtc";

    /// <summary>The contests running now (the weekly one first).</summary>
    public async Task<IReadOnlyList<ContestRow>> OpenContestsAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<ContestRow>(new CommandDefinition($@"
            SELECT {ContestColumns} FROM selfie.Contest AS c LEFT JOIN selfie.Submission AS w ON w.SubmissionId = c.WinnerSubmissionId
            WHERE c.StartsAtUtc <= SYSUTCDATETIME() AND c.EndsAtUtc > SYSUTCDATETIME()
            ORDER BY IIF(c.Kind = 'week', 0, 1), c.EndsAtUtc;", cancellationToken: ct))).ToList();
    }

    /// <summary>
    /// The leaders of a contest: approved photos approved during it, by votes (likes, not counting the owner's own) so far,
    /// a tie going to the one approved first. Only photos with at least one vote.
    /// </summary>
    public async Task<IReadOnlyList<(GalleryRow Row, int Votes)>> StandingsAsync(ContestRow c, int take, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var votes = (await conn.QueryAsync<(Guid PublicId, int Votes)>(new CommandDefinition($@"
            SELECT TOP (@take) s.PublicId, COUNT(l.UserId) AS Votes
            FROM selfie.Submission AS s
            JOIN selfie.SubmissionLike AS l ON l.SubmissionId = s.SubmissionId AND l.UserId <> s.UserId AND l.CreatedAtUtc < @end
            WHERE s.Status = 'Approved' AND s.Kind IN {ContestKinds} AND s.ReviewedAtUtc >= @start AND s.ReviewedAtUtc < @end
              AND EXISTS (SELECT 1 FROM selfie.SubmissionFile AS f WHERE f.SubmissionId = s.SubmissionId AND f.Role = 'main')
            GROUP BY s.SubmissionId, s.PublicId, s.ReviewedAtUtc
            ORDER BY COUNT(l.UserId) DESC, s.ReviewedAtUtc, s.SubmissionId;",
            new { take, start = c.StartsAtUtc, end = c.EndsAtUtc }, cancellationToken: ct))).ToList();
        if (votes.Count == 0) return [];
        var rows = (await conn.QueryAsync<GalleryRow>(new CommandDefinition($@"
            SELECT {GalleryColumns} FROM selfie.Submission AS s WHERE s.PublicId IN @ids;",
            new { ids = votes.Select(v => v.PublicId) }, cancellationToken: ct))).ToDictionary(r => r.PublicId);
        return votes.Where(v => rows.ContainsKey(v.PublicId)).Select(v => (rows[v.PublicId], v.Votes)).ToList();
    }

    /// <summary>Decided contests with a winner that is still in the gallery, newest first, and how many there are.</summary>
    public async Task<(IReadOnlyList<(ContestRow Contest, GalleryRow Winner)> Items, int Total)> WinnersAsync(int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        const string where = "c.ClosedAtUtc IS NOT NULL AND w.Status = 'Approved'";
        var contests = (await conn.QueryAsync<ContestRow>(new CommandDefinition($@"
            SELECT {ContestColumns} FROM selfie.Contest AS c JOIN selfie.Submission AS w ON w.SubmissionId = c.WinnerSubmissionId
            WHERE {where} ORDER BY c.EndsAtUtc DESC, c.ContestId DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;", new { skip = (page - 1) * pageSize, take = pageSize }, cancellationToken: ct))).ToList();
        var total = await conn.QuerySingleAsync<int>(new CommandDefinition(
            $"SELECT COUNT(*) FROM selfie.Contest AS c JOIN selfie.Submission AS w ON w.SubmissionId = c.WinnerSubmissionId WHERE {where};", cancellationToken: ct));
        if (contests.Count == 0) return ([], total);
        var rows = (await conn.QueryAsync<GalleryRow>(new CommandDefinition($@"
            SELECT {GalleryColumns} FROM selfie.Submission AS s WHERE s.PublicId IN @ids;",
            new { ids = contests.Select(c => c.WinnerPublicId!.Value).Distinct() }, cancellationToken: ct))).ToDictionary(r => r.PublicId);
        return (contests.Where(c => rows.ContainsKey(c.WinnerPublicId!.Value)).Select(c => (c, rows[c.WinnerPublicId!.Value])).ToList(), total);
    }

    /// <summary>The contests an approved submission has won (its badge, certificate and Winner frame).</summary>
    public async Task<IReadOnlyList<ContestRow>> WinsOfAsync(Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<ContestRow>(new CommandDefinition($@"
            SELECT {ContestColumns} FROM selfie.Contest AS c JOIN selfie.Submission AS w ON w.SubmissionId = c.WinnerSubmissionId
            WHERE w.PublicId = @publicId AND w.Status = 'Approved' ORDER BY c.EndsAtUtc DESC;", new { publicId }, cancellationToken: ct))).ToList();
    }

    /// <summary>All contests, newest first (admin).</summary>
    public async Task<IReadOnlyList<ContestRow>> AllContestsAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<ContestRow>(new CommandDefinition($@"
            SELECT TOP (200) {ContestColumns} FROM selfie.Contest AS c LEFT JOIN selfie.Submission AS w ON w.SubmissionId = c.WinnerSubmissionId
            ORDER BY c.StartsAtUtc DESC, c.ContestId DESC;", cancellationToken: ct))).ToList();
    }

    /// <summary>Adds (publicId null) or changes a festival contest through selfie.usp_SaveContest (the database checks the role).</summary>
    public async Task<(Guid? PublicId, ReviewError Error, string? Message)> SaveContestAsync(long userId, Guid? publicId, string title,
        DateTime startsAtUtc, DateTime endsAtUtc, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<Guid>(new CommandDefinition("selfie.usp_SaveContest",
                new { PublicId = publicId, Title = title, StartsAtUtc = startsAtUtc, EndsAtUtc = endsAtUtc },
                commandType: CommandType.StoredProcedure, cancellationToken: ct)), ReviewError.None, null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Number switch { 50034 => ReviewError.NotReviewer, 50031 => ReviewError.NotFound, _ => ReviewError.Invalid }, ex.Message);
        }
    }

    public async Task<(ReviewError Error, string? Message)> DeleteContestAsync(long userId, Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("selfie.usp_DeleteContest", new { PublicId = publicId },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return (ReviewError.None, null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (ex.Number switch { 50034 => ReviewError.NotReviewer, 50031 => ReviewError.NotFound, _ => ReviewError.Invalid }, ex.Message);
        }
    }

    // ---- The contest job (System scope) ----

    /// <summary>Makes this week's contest and decides ended ones (selfie.usp_RunContests).</summary>
    public async Task RunContestsAsync(DateTime? nowUtc, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        await conn.ExecuteAsync(new CommandDefinition("selfie.usp_RunContests", new { Now = nowUtc },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    public sealed record WinnerToTellRow(Guid ContestPublicId, string ContestKind, string ContestTitle, DateTime StartsAtUtc, DateTime EndsAtUtc,
        int WinnerLikes, Guid SubmissionPublicId, string ParentName, string Kind, Guid UserPublicId, string? Email, string? FullName);

    /// <summary>Winners not yet congratulated (still approved; accounts with an email).</summary>
    public async Task<IReadOnlyList<WinnerToTellRow>> WinnersToTellAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<WinnerToTellRow>(new CommandDefinition(@"
            SELECT c.PublicId AS ContestPublicId, c.Kind AS ContestKind, c.Title AS ContestTitle, c.StartsAtUtc, c.EndsAtUtc, c.WinnerLikes,
                   s.PublicId AS SubmissionPublicId, s.ParentName, s.Kind, u.PublicId AS UserPublicId, u.Email, u.FullName
            FROM selfie.Contest AS c
            JOIN selfie.Submission AS s ON s.SubmissionId = c.WinnerSubmissionId
            JOIN auth.[User] AS u ON u.UserId = s.UserId
            WHERE c.WinnerNotifiedAtUtc IS NULL AND s.Status = 'Approved' AND u.Status = 'Active' AND u.Email IS NOT NULL;", cancellationToken: ct))).ToList();
    }

    public async Task MarkWinnerToldAsync(Guid contestPublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        await conn.ExecuteAsync(new CommandDefinition("selfie.usp_MarkWinnerNotified", new { PublicId = contestPublicId },
            commandType: CommandType.StoredProcedure, cancellationToken: ct));
    }

    // ---------- Featured stories, Memory Wall candles ----------

    /// <summary>Feature / unfeature an approved submission through selfie.usp_SetFeatured (the database checks the role).</summary>
    public async Task<(ReviewError Error, string? Message)> SetFeaturedAsync(long reviewerUserId, Guid publicId, bool isFeatured, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(reviewerUserId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("selfie.usp_SetFeatured", new { PublicId = publicId, IsFeatured = isFeatured },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return (ReviewError.None, null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (ex.Number switch { 50034 => ReviewError.NotReviewer, 50031 => ReviewError.NotFound, _ => ReviewError.Invalid }, ex.Message);
        }
    }

    /// <summary>Likes / unlikes an approved selfie or photo frame. Its like count, or null + the message when refused.</summary>
    public async Task<(int? Likes, string? Problem)> SetLikeAsync(long userId, Guid publicId, bool liked, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<int>(new CommandDefinition("selfie.usp_SetLike", new { PublicId = publicId, Liked = liked },
                commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Message);
        }
    }

    /// <summary>The approved selfies / frames I like.</summary>
    public async Task<IReadOnlyList<Guid>> MyLikesAsync(long userId, CancellationToken ct)
    {
        // System scope (the liked selfies belong to other visitors, which the row rule would hide), limited to my likes by the query
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<Guid>(new CommandDefinition(@"
            SELECT s.PublicId FROM selfie.SubmissionLike AS l JOIN selfie.Submission AS s ON s.SubmissionId = l.SubmissionId
            WHERE l.UserId = @userId AND s.Status = 'Approved';", new { userId }, cancellationToken: ct))).ToList();
    }

    /// <summary>Lights / puts out my candle on a Memory Wall tribute. Returns its candle count, or null + the message when refused.</summary>
    public async Task<(int? Candles, string? Problem)> SetCandleAsync(long userId, Guid publicId, bool lit, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<int>(new CommandDefinition("selfie.usp_SetCandle", new { PublicId = publicId, Lit = lit },
                commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Message);
        }
    }

    /// <summary>
    /// The approved tributes I have lit a candle for. System scope (the tributes belong to other visitors, which the row rule
    /// would hide), limited to my own candles by the query.
    /// </summary>
    public async Task<IReadOnlyList<Guid>> MyCandlesAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<Guid>(new CommandDefinition(@"
            SELECT s.PublicId FROM selfie.Candle AS c JOIN selfie.Submission AS s ON s.SubmissionId = c.SubmissionId
            WHERE c.UserId = @userId AND s.Status = 'Approved';", new { userId }, cancellationToken: ct))).ToList();
    }

    /// <summary>A photo, video or voice note of an APPROVED submission (never the AI image's original photo), or null.</summary>
    public async Task<FileData?> GetPublicFileAsync(Guid filePublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<FileData>(new CommandDefinition(@"
            SELECT f.ContentType, f.Data FROM selfie.SubmissionFile AS f JOIN selfie.Submission AS s ON s.SubmissionId = f.SubmissionId
            WHERE f.PublicId = @filePublicId AND s.Status = 'Approved' AND f.Role IN ('main', 'video', 'voice', 'then');", new { filePublicId }, cancellationToken: ct));
    }

    public async Task<FileData?> GetFileAsync(Guid filePublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<FileData>(new CommandDefinition(
            "SELECT ContentType, Data FROM selfie.SubmissionFile WHERE PublicId = @filePublicId;", new { filePublicId }, cancellationToken: ct));
    }

    public enum ReviewError { None, NotReviewer, NotFound, Invalid }

    /// <summary>Approve / reject (or back to pending) through selfie.usp_ReviewSubmission. Returns the reference.</summary>
    public async Task<(string? Reference, ReviewError Error, string? Message)> ReviewAsync(long reviewerUserId, Guid publicId, string status, string? note, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(reviewerUserId), ct);
        try
        {
            var row = await conn.QuerySingleAsync<(long UserId, string Reference)>(new CommandDefinition("selfie.usp_ReviewSubmission",
                new { PublicId = publicId, Status = status, Note = note }, commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return (row.Reference, ReviewError.None, null);
        }
        catch (SqlException ex) when (ex.Number is >= 50030 and <= 50039)
        {
            return (null, ex.Number switch { 50034 => ReviewError.NotReviewer, 50031 => ReviewError.NotFound, _ => ReviewError.Invalid }, ex.Message);
        }
    }
}
