using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

public sealed record StartAlbumRequest { [Required] public Guid? SelfieId { get; init; } }
public sealed record JoinAlbumRequest
{
    [Required, RegularExpression("^[a-zA-Z0-9]{10}$", ErrorMessage = "This invite link doesn't work any more. Ask for a new one.")] public string Code { get; init; } = "";
    [Required] public Guid? SelfieId { get; init; }
}
public sealed record StartedAlbumResponse(Guid PublicId, string InviteCode);
public sealed record JoinedAlbumResponse(Guid PublicId);
/// <summary>A family album: who it's for (the parent's name from the first approved selfie), how many joined, the approved selfies.</summary>
public sealed record AlbumResponse(Guid PublicId, string? ParentName, string? Relation, int Members, int Selfies, DateTime CreatedAtUtc, IReadOnlyList<GalleryItemResponse> Items);
public sealed record AlbumCandidateResponse(Guid SelfieId, string Kind, string ParentName, string? Relation, bool Approved, DateTime CreatedAtUtc);
public sealed record MyAlbumResponse(Guid PublicId, string InviteCode, string ParentName, IReadOnlyList<Guid> MySelfies, bool Approved);

/// <summary>Family albums ("tag your sibling"): start one from your selfie, invite brothers, sisters and cousins with a link.</summary>
[ApiController]
[Produces("application/json")]
public sealed class AlbumsController(AlbumRepository albums, FeatureRepository features, ILogger<AlbumsController> log) : ControllerBase
{
    private string? Actor => User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

    private ObjectResult Off() => Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Family albums aren't available right now.");

    /// <summary>Starts a family album from my selfie (or returns the one it's in), with the invite code to send.</summary>
    [HttpPost("api/v1/albums")]
    [Authorize]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(StartedAlbumResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Start(StartAlbumRequest r, CancellationToken ct)
    {
        if (!await features.IsOnAsync("albums", ct)) return Off();
        var (album, problem) = await albums.StartAsync(User.GetUserId(), r.SelfieId!.Value, ct);
        if (album is null) { log.LogWarning("Family album refused for {Actor}: {Problem}", Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Family album {Album} ready for selfie {Selfie} by {Actor}", album.PublicId, r.SelfieId, Actor);
        return Ok(new StartedAlbumResponse(album.PublicId, album.InviteCode));
    }

    /// <summary>Adds my selfie to the album of an invite link (a sibling's or cousin's). It shows once approved.</summary>
    [HttpPost("api/v1/albums/join")]
    [Authorize]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(JoinedAlbumResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Join(JoinAlbumRequest r, CancellationToken ct)
    {
        if (!await features.IsOnAsync("albums", ct)) return Off();
        var (album, problem) = await albums.JoinAsync(User.GetUserId(), r.Code.ToLowerInvariant(), r.SelfieId!.Value, ct);
        if (album is null) { log.LogWarning("Joining a family album refused for {Actor}: {Problem}", Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Selfie {Selfie} added to family album {Album} by {Actor}", r.SelfieId, album, Actor);
        return Ok(new JoinedAlbumResponse(album.Value));
    }

    /// <summary>Takes my selfie out of its family album.</summary>
    [HttpDelete("api/v1/albums/mine/{selfieId:guid}")]
    [Authorize]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<IActionResult> Leave(Guid selfieId, CancellationToken ct)
    {
        var problem = await albums.LeaveAsync(User.GetUserId(), selfieId, ct);
        if (problem is not null) { log.LogWarning("Leaving a family album refused for {Actor}: {Problem}", Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Selfie {Selfie} taken out of its family album by {Actor}", selfieId, Actor);
        return NoContent();
    }

    /// <summary>My family albums, with their invite codes.</summary>
    [HttpGet("api/v1/me/albums")]
    [Authorize]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        if (!await features.IsOnAsync("albums", ct)) return Ok(Array.Empty<MyAlbumResponse>());
        var rows = await albums.MineAsync(User.GetUserId(), ct);
        return Ok(rows.GroupBy(x => x.PublicId).Select(g => new MyAlbumResponse(g.Key, g.First().InviteCode, g.First().ParentName.Trim(),
            g.Select(x => x.SelfieId).ToList(), g.Any(x => x.Status == "Approved"))).ToList());
    }

    /// <summary>My selfies with a parent that aren't in a family album yet (to start one from).</summary>
    [HttpGet("api/v1/me/albums/candidates")]
    [Authorize]
    public async Task<IActionResult> Candidates(CancellationToken ct)
    {
        if (!await features.IsOnAsync("albums", ct)) return Ok(Array.Empty<AlbumCandidateResponse>());
        return Ok((await albums.CandidatesAsync(User.GetUserId(), ct))
            .Select(c => new AlbumCandidateResponse(c.SelfieId, c.Kind, c.ParentName.Trim(), c.Relation, c.Status == "Approved", c.CreatedAtUtc)).ToList());
    }

    /// <summary>A family album page: its approved selfies.</summary>
    [HttpGet("api/v1/albums/{publicId:guid}")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(AlbumResponse), StatusCodes.Status200OK)]
    public Task<IActionResult> Get(Guid publicId, CancellationToken ct) => Show(publicId, null, ct);

    /// <summary>The album behind an invite link (the "join" page).</summary>
    [HttpGet("api/v1/albums/invite/{code}")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(AlbumResponse), StatusCodes.Status200OK)]
    public Task<IActionResult> Invite(string code, CancellationToken ct) =>
        code.Length == 10 && code.All(char.IsAsciiLetterOrDigit) ? Show(null, code.ToLowerInvariant(), ct)
            : Task.FromResult<IActionResult>(Problem(statusCode: 404, title: "Family album not found."));

    private async Task<IActionResult> Show(Guid? publicId, string? code, CancellationToken ct)
    {
        var found = await features.IsOnAsync("albums", ct) ? await albums.GetAsync(publicId, code, ct) : null;
        if (found is not { } f) return Problem(statusCode: 404, title: "Family album not found.");
        var lead = f.Items.FirstOrDefault();
        return Ok(new AlbumResponse(f.Album.PublicId, lead?.ParentName.Trim(), lead?.Relation, f.Album.Members, f.Album.Selfies, f.Album.CreatedAtUtc,
            f.Items.Select(SelfiesController.ToPublic).ToList()));
    }
}
