using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// The review queue: super admins, admins and moderators see visitors' selfies, family photos and videos and approve or
/// reject them. The database checks the reviewer's role again and records every decision in the audit log.
/// Contact details are shown masked.
/// </summary>
[ApiController]
[Route("api/v1/admin/selfies")]
[Authorize(Policy = Policies.Reviewer)]
[Produces("application/json")]
public sealed class SelfieReviewController(SelfieRepository selfies, ILogger<SelfieReviewController> log) : ControllerBase
{
    private static readonly string[] Statuses = ["Pending", "Approved", "Rejected"];

    /// <summary>Submissions with a status: Pending (oldest first), Approved or Rejected (latest decision first).</summary>
    [HttpGet]
    [ProducesResponseType(typeof(SubmissionPageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 12, CancellationToken ct = default)
    {
        var s = Statuses.FirstOrDefault(x => string.Equals(x, status, StringComparison.OrdinalIgnoreCase)) ?? "Pending";
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var (items, total, counts) = await selfies.ListAsync(s, page, pageSize, ct);
        return Ok(ToPage(items, total, page, pageSize, counts));
    }

    /// <summary>What happened: uploads and review decisions, newest first, plus a count per day.</summary>
    /// <param name="filter">all, shared (uploads) or reviewed (approve / reject decisions).</param>
    /// <param name="days">7, 30 or 90 (default 30).</param>
    /// <param name="page">From 1.</param>
    /// <param name="pageSize">1 to 100 (default 25).</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet("activity")]
    [ProducesResponseType(typeof(ActivityPageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Activity([FromQuery] string? filter, [FromQuery] int days = 30, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        var f = filter is "shared" or "reviewed" ? filter : "all";
        days = days is 7 or 90 ? days : 30;
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var (items, total, perDay) = await selfies.ActivityAsync(f, days, page, pageSize, ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var byDay = perDay.ToDictionary(d => DateOnly.FromDateTime(d.Day));
        return Ok(new ActivityPageResponse(items.Select(i => new ActivityItem(i.Type, i.AtUtc, i.PublicId, $"SWP-{i.SubmissionId:000000}", i.Kind,
                i.Kind == "family" ? i.ParentName.Trim() : $"{i.YourName.Trim().Split(' ')[0]} with {i.ParentName.Trim()}",
                i.Reviewer, i.Note, i.HasPhoto, i.HasVideo, i.HasVoice)).ToList(),
            total, page, pageSize, days,
            Enumerable.Range(0, days).Select(n => today.AddDays(n - days + 1))
                .Select(d => byDay.TryGetValue(d, out var x) ? new ActivityDayResponse(d, x.Shared, x.Approved, x.Rejected) : new ActivityDayResponse(d, 0, 0, 0))
                .ToList()));
    }

    /// <summary>Visitors who have shared something — what and how many — latest sharer first. Contact details masked.</summary>
    /// <param name="search">Name, email, or the last digits of the mobile number.</param>
    /// <param name="page">From 1.</param>
    /// <param name="pageSize">1 to 50 (default 20).</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet("by-visitor")]
    [ProducesResponseType(typeof(UploaderPageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Uploaders([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var (items, total) = await selfies.UploadersAsync(search, page, pageSize, ct);
        return Ok(new UploaderPageResponse(items.Select(u => new UploaderResponse(u.PublicId, u.FullName,
            u.Email is null ? null : EmailAddress.Mask(u.Email),
            u.MobileNumber is null ? null : PhoneNumber.Mask(u.MobileCountryCode ?? "", u.MobileNumber),
            u.Status, u.Submissions, u.Pending, u.Approved, u.Rejected, u.Photos, u.Videos, u.VoiceNotes, u.FirstAtUtc, u.LastAtUtc)).ToList(),
            total, page, pageSize));
    }

    /// <summary>Everything one visitor shared (all statuses, newest first), with the files.</summary>
    [HttpGet("by-visitor/{visitorPublicId:guid}")]
    [ProducesResponseType(typeof(SubmissionPageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> OfVisitor(Guid visitorPublicId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var (items, total, counts) = await selfies.ListAsync(null, visitorPublicId, page, pageSize, ct);
        return Ok(ToPage(items, total, page, pageSize, counts));
    }

    private static SubmissionPageResponse ToPage(IReadOnlyList<SelfieRepository.SubmissionRow> items, int total, int page, int pageSize,
        SelfieRepository.Counts counts) =>
        new(items.Select(i => new SubmissionResponse(
            i.PublicId, i.Reference, i.Kind, i.YourName, i.ParentName, i.Relation, i.FamilySize, i.Generations, i.MemoryYear,
            i.CountryCode, i.StateName, i.City, i.IsAdult, i.GuardianName,
            i.GuardianMobile is { Length: > 4 } m ? "••••••" + m[^4..] : null,
            i.Message, i.Status, i.ReviewNote, i.ReviewedBy, i.ReviewedAtUtc, i.CreatedAtUtc,
            i.OwnerEmail is null ? null : EmailAddress.Mask(i.OwnerEmail),
            i.Files.Select(f => new SubmissionFileResponse(f.PublicId, f.Role, f.ContentType, f.SizeBytes, f.FileName)).ToList(),
            i.ThenYear, i.NowYear, i.IsFeatured, i.Candles, i.FrameStyle, i.Festival, i.SourceReference)).ToList(),
            total, page, pageSize, counts.Pending, counts.Approved, counts.Rejected);

    /// <summary>A submission's photo or video (videos can be played from any point).</summary>
    [HttpGet("files/{filePublicId:guid}")]
    [Produces("image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetFile(Guid filePublicId, CancellationToken ct)
    {
        var file = await selfies.GetFileAsync(filePublicId, ct);
        if (file is null) return NotFound();
        return File(file.Data, file.ContentType, enableRangeProcessing: true);
    }

    /// <summary>Feature (or unfeature) an approved submission for Featured Stories on the home page.</summary>
    [HttpPut("{publicId:guid}/featured")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Featured(Guid publicId, SetFeaturedRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var (error, message) = await selfies.SetFeaturedAsync(User.GetUserId(), publicId, request.IsFeatured!.Value, ct);
        if (error != SelfieRepository.ReviewError.None)
        {
            log.LogWarning("Feature of {PublicId} refused for {Actor}: {Error}", publicId, actor, error);
            return Problem(title: message, statusCode: error switch
            {
                SelfieRepository.ReviewError.NotReviewer => StatusCodes.Status403Forbidden,
                SelfieRepository.ReviewError.NotFound => StatusCodes.Status404NotFound,
                _ => StatusCodes.Status400BadRequest
            });
        }
        log.LogInformation("Selfie {PublicId} {State} by {Actor}", publicId, request.IsFeatured.Value ? "featured" : "unfeatured", actor);
        return NoContent();
    }

    /// <summary>Whether visitors' photo frames go straight to the Photo Frames gallery (no review first).</summary>
    [HttpGet("frame-settings")]
    [ProducesResponseType(typeof(FrameSettingsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> FrameSettings(CancellationToken ct) => Ok(new FrameSettingsResponse(await selfies.FramesAutoApproveAsync(ct)));

    /// <summary>Switch auto-approve for photo frames on or off. Super admins and admins only (checked again by the database).</summary>
    [HttpPut("frame-settings")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(typeof(FrameSettingsResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SetFrameSettings(FrameSettingsRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var problem = await selfies.SetFramesAutoApproveAsync(User.GetUserId(), request.AutoApprove!.Value, ct);
        if (problem is not null)
        {
            log.LogWarning("Frame auto-approve change refused for {Actor}: {Problem}", actor, problem);
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: problem);
        }
        log.LogInformation("Frame auto-approve switched {State} by {Actor}", request.AutoApprove.Value ? "on" : "off", actor);
        return Ok(new FrameSettingsResponse(request.AutoApprove.Value));
    }

    /// <summary>Approve or reject a submission (a reason is needed to reject), or put it back in the queue.</summary>
    [HttpPut("{publicId:guid}/review")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Review(Guid publicId, ReviewSubmissionRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note is not null && (note.Contains('<') || note.Contains('>')))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "The reason can't contain < or >.");

        var (reference, error, message) = await selfies.ReviewAsync(User.GetUserId(), publicId, request.Status, note, ct);
        if (error != SelfieRepository.ReviewError.None)
        {
            log.LogWarning("Review of {PublicId} as {Status} refused for {Actor}: {Error}", publicId, request.Status, actor, error);
            return Problem(title: message, statusCode: error switch
            {
                SelfieRepository.ReviewError.NotReviewer => StatusCodes.Status403Forbidden,
                SelfieRepository.ReviewError.NotFound => StatusCodes.Status404NotFound,
                _ => StatusCodes.Status400BadRequest
            });
        }

        log.LogInformation("Selfie {Reference} set to {Status} by {Actor}", reference, request.Status, actor);
        return NoContent();
    }
}
