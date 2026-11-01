using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Parents' Voices: stories of parents whose children left them, with an optional photo, video and voice note.
/// Visitors create them through selfie.usp_CreateParentStory (always 'Pending'); staff review them through
/// selfie.usp_ReviewParentStory, which checks the reviewer's role again in the database.
/// </summary>
public sealed class ParentStoryRepository(SqlConnectionFactory db)
{
    public sealed record NewStory(string WrittenBy, string ParentRole, string? ShownName, byte? Age, string CountryCode, string? StateName,
        string? City, string Title, string Story, string? Wish, SelfieRepository.NewFile? Photo, SelfieRepository.NewFile? Video, SelfieRepository.NewFile? Voice);

    public sealed record Created(Guid PublicId, string Reference);

    /// <summary>Saves a story and its files together. Returns null + the database's message when refused.</summary>
    public async Task<(Created? Result, string? Problem)> CreateAsync(long userId, NewStory s, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var p = new DynamicParameters();
        p.Add("WrittenBy", s.WrittenBy); p.Add("ParentRole", s.ParentRole); p.Add("ShownName", s.ShownName); p.Add("Age", s.Age);
        p.Add("CountryCode", s.CountryCode); p.Add("StateName", s.StateName); p.Add("City", s.City);
        p.Add("Title", s.Title); p.Add("Story", s.Story); p.Add("Wish", s.Wish);
        foreach (var (prefix, f) in new[] { ("Photo", s.Photo), ("Video", s.Video), ("Voice", s.Voice) })
        {
            p.Add(prefix + "Type", f?.ContentType);
            p.Add(prefix + "Data", f?.Data, DbType.Binary, size: -1);
            p.Add(prefix + "Name", f?.FileName);
        }
        try
        {
            return (await conn.QuerySingleAsync<Created>(new CommandDefinition("selfie.usp_CreateParentStory", p,
                commandType: CommandType.StoredProcedure, commandTimeout: 120, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50050 and <= 50059)
        {
            return (null, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            return (null, "Some of the details aren't valid. Please check them and try again.");
        }
    }

    // ---------- Public (System scope, approved only) ----------

    public sealed record StoryRow(Guid PublicId, string WrittenBy, string ParentRole, string? ShownName, byte? Age, string CountryCode,
        string? StateName, string? City, string Title, string Story, string? Wish, DateTime ApprovedAtUtc, Guid? PhotoId, Guid? VideoId,
        Guid? VoiceId, bool IsFeatured, int Loves);

    private const string PublicColumns = @"
        s.PublicId, s.WrittenBy, s.ParentRole, s.ShownName, s.Age, s.CountryCode, s.StateName, s.City, s.Title, s.Story, s.Wish,
        s.ReviewedAtUtc AS ApprovedAtUtc,
        (SELECT f.PublicId FROM selfie.ParentStoryFile AS f WHERE f.StoryId = s.StoryId AND f.Role = 'main') AS PhotoId,
        (SELECT f.PublicId FROM selfie.ParentStoryFile AS f WHERE f.StoryId = s.StoryId AND f.Role = 'video') AS VideoId,
        (SELECT f.PublicId FROM selfie.ParentStoryFile AS f WHERE f.StoryId = s.StoryId AND f.Role = 'voice') AS VoiceId,
        s.IsFeatured, (SELECT COUNT(*) FROM selfie.ParentStoryLove AS l WHERE l.StoryId = s.StoryId) AS Loves";

    /// <summary>Approved stories: featured first, then newest.</summary>
    public async Task<(IReadOnlyList<StoryRow> Items, int Total)> ListAsync(int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        using var multi = await conn.QueryMultipleAsync(new CommandDefinition($@"
            SELECT {PublicColumns} FROM selfie.ParentStory AS s WHERE s.Status = 'Approved'
            ORDER BY s.IsFeatured DESC, s.ReviewedAtUtc DESC, s.StoryId DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
            SELECT COUNT(*) FROM selfie.ParentStory WHERE Status = 'Approved';",
            new { skip = (page - 1) * pageSize, take = pageSize }, cancellationToken: ct));
        var items = (await multi.ReadAsync<StoryRow>()).ToList();
        return (items, await multi.ReadSingleAsync<int>());
    }

    public async Task<StoryRow?> GetApprovedAsync(Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<StoryRow>(new CommandDefinition(
            $"SELECT {PublicColumns} FROM selfie.ParentStory AS s WHERE s.PublicId = @publicId AND s.Status = 'Approved';", new { publicId }, cancellationToken: ct));
    }

    /// <summary>A file of an approved story (it stops working once the story is taken down).</summary>
    public async Task<SelfieRepository.FileData?> GetPublicFileAsync(Guid filePublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<SelfieRepository.FileData>(new CommandDefinition(@"
            SELECT f.ContentType, f.Data FROM selfie.ParentStoryFile AS f JOIN selfie.ParentStory AS s ON s.StoryId = f.StoryId
            WHERE f.PublicId = @filePublicId AND s.Status = 'Approved';", new { filePublicId }, cancellationToken: ct));
    }

    public async Task<(int? Loves, string? Problem)> SetLoveAsync(long userId, Guid publicId, bool loved, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<int>(new CommandDefinition("selfie.usp_SetParentStoryLove", new { PublicId = publicId, Loved = loved },
                commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50050 and <= 50059)
        {
            return (null, ex.Message);
        }
    }

    /// <summary>The approved stories I sent love to.</summary>
    public async Task<IReadOnlyList<Guid>> MyLovesAsync(long userId, CancellationToken ct)
    {
        // System scope (the stories belong to other visitors), limited to my love by the query
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<Guid>(new CommandDefinition(@"
            SELECT s.PublicId FROM selfie.ParentStoryLove AS l JOIN selfie.ParentStory AS s ON s.StoryId = l.StoryId
            WHERE l.UserId = @userId AND s.Status = 'Approved';", new { userId }, cancellationToken: ct))).ToList();
    }

    // ---------- Review (System scope; the controller has already checked the reviewer's role) ----------

    public sealed record ReviewRow(Guid PublicId, string Reference, string WrittenBy, string ParentRole, string? ShownName, byte? Age,
        string CountryCode, string? StateName, string? City, string Title, string Story, string? Wish, string Status, string? ReviewNote,
        string? ReviewedBy, DateTime? ReviewedAtUtc, DateTime CreatedAtUtc, bool IsFeatured, int Loves, string? OwnerEmail)
    {
        public IReadOnlyList<FileRow> Files { get; set; } = [];
    }

    public sealed record FileRow(Guid StoryPublicId, Guid PublicId, string Role, string ContentType, int SizeBytes);

    /// <summary>One page of stories with a status (pending: oldest first; reviewed: newest review first), and the counts.</summary>
    public async Task<(IReadOnlyList<ReviewRow> Items, int Total, int Pending, int Approved, int Rejected)> ReviewListAsync(
        string status, int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        using var multi = await conn.QueryMultipleAsync(new CommandDefinition(@"
            SELECT s.StoryId, s.PublicId, CONCAT('PV-', RIGHT(CONCAT('000000', s.StoryId), 6)) AS Reference, s.WrittenBy, s.ParentRole, s.ShownName,
                   s.Age, s.CountryCode, s.StateName, s.City, s.Title, s.Story, s.Wish, s.Status, s.ReviewNote,
                   r.FullName AS ReviewedBy, s.ReviewedAtUtc, s.CreatedAtUtc, s.IsFeatured,
                   (SELECT COUNT(*) FROM selfie.ParentStoryLove AS l WHERE l.StoryId = s.StoryId) AS Loves, u.Email AS OwnerEmail
            INTO #page
            FROM selfie.ParentStory AS s
            JOIN auth.[User] AS u ON u.UserId = s.UserId
            LEFT JOIN auth.[User] AS r ON r.UserId = s.ReviewedByUserId
            WHERE s.Status = @status
            ORDER BY IIF(@status = 'Pending', 0, 1), IIF(@status = 'Pending', s.CreatedAtUtc, NULL) ASC, s.ReviewedAtUtc DESC, s.StoryId DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
            SELECT PublicId, Reference, WrittenBy, ParentRole, ShownName, Age, CountryCode, StateName, City, Title, Story, Wish, Status, ReviewNote,
                   ReviewedBy, ReviewedAtUtc, CreatedAtUtc, IsFeatured, Loves, OwnerEmail FROM #page
            ORDER BY IIF(@status = 'Pending', 0, 1), IIF(@status = 'Pending', CreatedAtUtc, NULL) ASC, ReviewedAtUtc DESC;
            SELECT p.PublicId AS StoryPublicId, f.PublicId, f.Role, f.ContentType, f.SizeBytes
            FROM #page AS p JOIN selfie.ParentStoryFile AS f ON f.StoryId = p.StoryId;
            SELECT COUNT(*) FROM selfie.ParentStory WHERE Status = @status;
            SELECT SUM(IIF(Status = 'Pending', 1, 0)), SUM(IIF(Status = 'Approved', 1, 0)), SUM(IIF(Status = 'Rejected', 1, 0)) FROM selfie.ParentStory;",
            new { status, skip = (page - 1) * pageSize, take = pageSize }, cancellationToken: ct));
        var items = (await multi.ReadAsync<ReviewRow>()).ToList();
        var files = (await multi.ReadAsync<FileRow>()).ToLookup(f => f.StoryPublicId);
        foreach (var i in items) i.Files = files[i.PublicId].ToList();
        var total = await multi.ReadSingleAsync<int>();
        var (pending, approved, rejected) = await multi.ReadSingleAsync<(int?, int?, int?)>();
        return (items, total, pending ?? 0, approved ?? 0, rejected ?? 0);
    }

    /// <summary>Any file (staff only: pending stories too).</summary>
    public async Task<SelfieRepository.FileData?> GetFileAsync(Guid filePublicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<SelfieRepository.FileData>(new CommandDefinition(
            "SELECT ContentType, Data FROM selfie.ParentStoryFile WHERE PublicId = @filePublicId;", new { filePublicId }, cancellationToken: ct));
    }

    /// <summary>Approve / reject / back to pending, and feature, through selfie.usp_ReviewParentStory. Returns the reference.</summary>
    public async Task<(string? Reference, SelfieRepository.ReviewError Error, string? Message)> ReviewAsync(long reviewerUserId, Guid publicId,
        string status, string? note, bool? featured, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(reviewerUserId), ct);
        try
        {
            var r = await conn.QuerySingleAsync<(long UserId, string Reference)>(new CommandDefinition("selfie.usp_ReviewParentStory",
                new { PublicId = publicId, Status = status, Note = note, Featured = featured }, commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return (r.Reference, SelfieRepository.ReviewError.None, null);
        }
        catch (SqlException ex) when (ex.Number is >= 50050 and <= 50059)
        {
            return (null, ex.Number switch
            {
                50054 => SelfieRepository.ReviewError.NotReviewer,
                50051 => SelfieRepository.ReviewError.NotFound,
                _ => SelfieRepository.ReviewError.Invalid
            }, ex.Message);
        }
    }
}
