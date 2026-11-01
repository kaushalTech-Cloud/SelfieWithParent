using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

public sealed record StreakResponse(int Current, int Best, int Total, bool ThisWeek, string? ThisWeekKind, IReadOnlyList<string> Badges,
    IReadOnlyList<DateOnly> RecentWeeks, DateOnly WeekStart, bool Reminders);
public sealed record CheckInRequest
{
    [Required, RegularExpression("^(call|visit|selfie|message)$", ErrorMessage = "Choose how you stayed in touch.")] public string Kind { get; init; } = "";
    [StringLength(140)] public string? Note { get; init; }
}
public sealed record StreakRemindersRequest { [Required] public bool? On { get; init; } }

public sealed record MyProfileResponse(string? Handle, bool IsPublic, string DisplayName, string? Bio, bool ShowStreak, bool Exists);
public sealed record SaveProfileRequest
{
    [Required, RegularExpression("^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$", ErrorMessage = "The address can have 3 to 30 small letters, numbers and dashes.")]
    public string Handle { get; init; } = "";
    public bool IsPublic { get; init; }
    [Required(ErrorMessage = "Add the name to show."), StringLength(60, MinimumLength = 2)] public string DisplayName { get; init; } = "";
    [StringLength(160)] public string? Bio { get; init; }
    public bool ShowStreak { get; init; } = true;
}
public sealed record ProfileItemResponse(Guid PublicId, string Kind, string ParentName, string? Relation, Guid? PhotoId, Guid? VideoId, int Likes, bool IsWinner, DateTime ApprovedAtUtc);
public sealed record ProfileStreakResponse(int Current, int Best, IReadOnlyList<string> Badges);
public sealed record PublicProfileResponse(string Handle, string DisplayName, string? Bio, DateTime MemberSinceUtc, bool HasPhoto,
    ProfileStreakResponse? Streak, int Shared, int Likes, int Wins, IReadOnlyList<ProfileItemResponse> Items);

/// <summary>Gratitude streaks (signed in) and visitors' public profile pages (/p/{handle}).</summary>
[ApiController]
[Produces("application/json")]
public sealed class GratitudeController(GratitudeRepository repo, FeatureRepository features, TimeProvider clock, ILogger<GratitudeController> log) : ControllerBase
{
    private string? Actor => User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

    // ---------- Streak ----------

    /// <summary>My gratitude streak: weeks in a row, best run, badges, whether this week is marked.</summary>
    [HttpGet("api/v1/me/streak")]
    [Authorize]
    public async Task<IActionResult> MyStreak(CancellationToken ct)
    {
        var today = GratitudeRepository.Today(clock.GetUtcNow());
        var s = GratitudeRepository.Compute(await repo.CheckInsAsync(User.GetUserId(), ct), today);
        return Ok(new StreakResponse(s.Current, s.Best, s.Total, s.ThisWeek, s.ThisWeekKind, s.Badges, s.RecentWeeks,
            GratitudeRepository.MondayOf(today), await repo.NudgesOnAsync(User.GetUserId(), ct)));
    }

    /// <summary>"This week I called / visited / took a selfie / sent a message." Once a week (a second time changes it).</summary>
    [HttpPost("api/v1/me/streak/check-in")]
    [Authorize]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<IActionResult> CheckIn(CheckInRequest r, CancellationToken ct)
    {
        if (!await features.IsOnAsync("streaks", ct)) return Problem(statusCode: 503, title: "Gratitude streaks aren't available right now.");
        if (r.Note is not null && (r.Note.Contains('<') || r.Note.Contains('>'))) return Problem(statusCode: 400, title: "Text can't contain < or >.");
        var monday = GratitudeRepository.MondayOf(GratitudeRepository.Today(clock.GetUtcNow()));
        var problem = await repo.CheckInAsync(User.GetUserId(), monday, r.Kind, r.Note?.Trim(), ct);
        if (problem is not null) { log.LogWarning("Check-in refused for {Actor}: {Problem}", Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Gratitude check-in ({Kind}) for week {Week} by {Actor}", r.Kind, monday, Actor);
        return await MyStreak(ct);
    }

    /// <summary>The Sunday "keep your streak" email on / off.</summary>
    [HttpPut("api/v1/me/streak/reminders")]
    [Authorize]
    public async Task<IActionResult> Reminders(StreakRemindersRequest r, CancellationToken ct)
    {
        await repo.SetNudgesAsync(User.GetUserId(), r.On!.Value, ct);
        log.LogInformation("Streak reminders switched {State} by {Actor}", r.On.Value ? "on" : "off", Actor);
        return NoContent();
    }

    // ---------- My profile ----------

    [HttpGet("api/v1/me/public-profile")]
    [Authorize]
    public async Task<IActionResult> MyProfile(CancellationToken ct)
    {
        var p = await repo.MyProfileAsync(User.GetUserId(), ct);
        return Ok(p is null ? new MyProfileResponse(null, false, "", null, true, false) : new MyProfileResponse(p.Handle, p.IsPublic, p.DisplayName, p.Bio, p.ShowStreak, true));
    }

    [HttpPut("api/v1/me/public-profile")]
    [Authorize]
    [EnableRateLimiting(RateLimits.Auth)]
    public async Task<IActionResult> SaveProfile(SaveProfileRequest r, CancellationToken ct)
    {
        foreach (var v in new[] { r.DisplayName, r.Bio })
            if (v is not null && (v.Contains('<') || v.Contains('>'))) return Problem(statusCode: 400, title: "Text can't contain < or >.");
        var problem = await repo.SaveProfileAsync(User.GetUserId(), new GratitudeRepository.MyProfile(r.Handle.Trim().ToLowerInvariant(), r.IsPublic,
            r.DisplayName.Trim(), string.IsNullOrWhiteSpace(r.Bio) ? null : r.Bio.Trim(), r.ShowStreak), ct);
        if (problem is not null) { log.LogWarning("Profile refused for {Actor}: {Problem}", Actor, problem); return Problem(statusCode: 400, title: problem); }
        log.LogInformation("Profile /p/{Handle} saved ({State}) by {Actor}", r.Handle, r.IsPublic ? "public" : "private", Actor);
        return NoContent();
    }

    // ---------- Public profile ----------

    /// <summary>A visitor's public profile: name, bio, badges, their approved selfies / frames / reels and wins. 404 unless they made it public.</summary>
    [HttpGet("api/v1/profiles/{handle}")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(PublicProfileResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Profile(string handle, CancellationToken ct)
    {
        handle = handle.ToLowerInvariant();
        var state = await features.GetAsync(ct);
        var p = state.Features.GetValueOrDefault("profiles", true) ? await repo.PublicProfileAsync(handle, ct) : null;
        if (p is null) return Problem(statusCode: 404, title: "Profile not found.");
        var (items, wins) = await repo.ProfileItemsAsync(p.UserId, ct);
        ProfileStreakResponse? streak = null;
        if (p.ShowStreak && state.Features.GetValueOrDefault("streaks", true))
        {
            var s = GratitudeRepository.Compute(await repo.CheckInsSystemAsync(p.UserId, ct), GratitudeRepository.Today(clock.GetUtcNow()));
            if (s.Total > 0) streak = new ProfileStreakResponse(s.Current, s.Best, s.Badges);
        }
        return Ok(new PublicProfileResponse(p.Handle, p.DisplayName, p.Bio, p.MemberSinceUtc, p.HasPhoto, streak, items.Count, items.Sum(i => i.Likes), wins,
            items.Select(i => new ProfileItemResponse(i.PublicId, i.Kind, i.ParentName, i.Relation, i.PhotoId, i.VideoId, i.Likes, i.IsWinner, i.ApprovedAtUtc)).ToList()));
    }

    /// <summary>The profile photo of a public profile.</summary>
    [HttpGet("api/v1/profiles/{handle}/photo")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.GalleryFiles)]
    public async Task<IActionResult> Photo(string handle, CancellationToken ct)
    {
        if (!await features.IsOnAsync("profiles", ct)) return NotFound();
        var f = await repo.ProfilePhotoAsync(handle.ToLowerInvariant(), ct);
        if (f is null) return NotFound();
        Response.Headers.CacheControl = "public, max-age=3600";
        return File(f.Data, f.ContentType);
    }
}
