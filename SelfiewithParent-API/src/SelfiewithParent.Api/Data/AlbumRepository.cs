using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Family albums ("tag your sibling"): a visitor starts an album from their selfie and sends the invite link to a brother,
/// sister or cousin, who adds their own selfie with the same parent. Writes go through selfie.usp_StartAlbum / usp_JoinAlbum /
/// usp_LeaveAlbum (the visitor's own selfies); the public album page shows only approved selfies.
/// </summary>
public sealed class AlbumRepository(SqlConnectionFactory db)
{
    public sealed record Started(Guid PublicId, string InviteCode);

    /// <summary>Starts an album from the visitor's selfie (or returns the one it is in). The album, or the message.</summary>
    public async Task<(Started? Album, string? Problem)> StartAsync(long userId, Guid selfieId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<Started>(new CommandDefinition("selfie.usp_StartAlbum", new { SelfiePublicId = selfieId },
                commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50080 and <= 50089) { return (null, ex.Message); }
    }

    /// <summary>Adds the visitor's selfie to the album of an invite code. The album's id, or the message.</summary>
    public async Task<(Guid? Album, string? Problem)> JoinAsync(long userId, string code, Guid selfieId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            return (await conn.QuerySingleAsync<Guid>(new CommandDefinition("selfie.usp_JoinAlbum", new { InviteCode = code, SelfiePublicId = selfieId },
                commandType: CommandType.StoredProcedure, cancellationToken: ct)), null);
        }
        catch (SqlException ex) when (ex.Number is >= 50080 and <= 50089) { return (null, ex.Message); }
    }

    public async Task<string?> LeaveAsync(long userId, Guid selfieId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("selfie.usp_LeaveAlbum", new { SelfiePublicId = selfieId },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (ex.Number is >= 50080 and <= 50089) { return ex.Message; }
    }

    public sealed record AlbumRow(long AlbumId, Guid PublicId, DateTime CreatedAtUtc, int Members, int Selfies);

    /// <summary>An album by its id or invite code, with its approved selfies (oldest first: the one that started it leads).</summary>
    public async Task<(AlbumRow Album, IReadOnlyList<SelfieRepository.GalleryRow> Items)?> GetAsync(Guid? publicId, string? code, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var album = await conn.QuerySingleOrDefaultAsync<AlbumRow>(new CommandDefinition(@"
            SELECT a.AlbumId, a.PublicId, a.CreatedAtUtc,
                   (SELECT COUNT(DISTINCT s.UserId) FROM selfie.AlbumSubmission AS x JOIN selfie.Submission AS s ON s.SubmissionId = x.SubmissionId
                     WHERE x.AlbumId = a.AlbumId AND s.Status <> 'Rejected') AS Members,
                   (SELECT COUNT(*) FROM selfie.AlbumSubmission AS x JOIN selfie.Submission AS s ON s.SubmissionId = x.SubmissionId
                     WHERE x.AlbumId = a.AlbumId AND s.Status <> 'Rejected') AS Selfies
            FROM selfie.FamilyAlbum AS a
            WHERE (@publicId IS NOT NULL AND a.PublicId = @publicId) OR (@code IS NOT NULL AND a.InviteCode = @code);",
            new { publicId, code }, cancellationToken: ct));
        if (album is null) return null;
        var items = (await conn.QueryAsync<SelfieRepository.GalleryRow>(new CommandDefinition($@"
            SELECT {SelfieRepository.GalleryColumns}
            FROM selfie.AlbumSubmission AS x JOIN selfie.Submission AS s ON s.SubmissionId = x.SubmissionId
            WHERE x.AlbumId = @id AND s.Status = 'Approved'
            ORDER BY x.AddedAtUtc, s.SubmissionId;", new { id = album.AlbumId }, cancellationToken: ct))).ToList();
        return (album, items);
    }

    public sealed record CandidateRow(Guid SelfieId, string Kind, string ParentName, string? Relation, string Status, DateTime CreatedAtUtc);

    /// <summary>The visitor's selfies with a parent that aren't in a family album yet (newest first): ones they can start an album from.</summary>
    public async Task<IReadOnlyList<CandidateRow>> CandidatesAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return (await conn.QueryAsync<CandidateRow>(new CommandDefinition(@"
            SELECT TOP (20) s.PublicId AS SelfieId, s.Kind, s.ParentName, s.Relation, s.Status, s.CreatedAtUtc
            FROM selfie.Submission AS s
            WHERE s.UserId = @userId AND s.Status <> 'Rejected' AND s.Kind IN ('real', 'ai', 'thennow', 'memory')
              AND NOT EXISTS (SELECT 1 FROM selfie.AlbumSubmission AS x WHERE x.SubmissionId = s.SubmissionId)
            ORDER BY s.CreatedAtUtc DESC;", new { userId }, cancellationToken: ct))).ToList();
    }

    public sealed record MyAlbumRow(Guid PublicId, string InviteCode, Guid SelfieId, string ParentName, string Status);

    /// <summary>The visitor's selfies that are in family albums (row-level security: their own), with each album's invite code.</summary>
    public async Task<IReadOnlyList<MyAlbumRow>> MineAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return (await conn.QueryAsync<MyAlbumRow>(new CommandDefinition(@"
            SELECT a.PublicId, a.InviteCode, s.PublicId AS SelfieId, s.ParentName, s.Status
            FROM selfie.Submission AS s
            JOIN selfie.AlbumSubmission AS x ON x.SubmissionId = s.SubmissionId
            JOIN selfie.FamilyAlbum AS a ON a.AlbumId = x.AlbumId
            WHERE s.UserId = @userId AND s.Status <> 'Rejected'
            ORDER BY x.AddedAtUtc DESC;", new { userId }, cancellationToken: ct))).ToList();
    }
}
