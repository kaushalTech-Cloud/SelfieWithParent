using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>Admin site: review Parents' Voices stories (approve, reject with a reason, take down, feature).</summary>
[ApiController]
[Route("api/v1/admin/parent-stories")]
[Authorize(Policy = Policies.Reviewer)]
[Produces("application/json")]
public sealed class ParentStoryReviewController(ParentStoryRepository stories, ILogger<ParentStoryReviewController> log) : ControllerBase
{
    /// <summary>One page of stories with a status (Pending: oldest first), with their files and the counts.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ParentStoryReviewPage), StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 12, CancellationToken ct = default)
    {
        status = status is "Approved" or "Rejected" ? status : "Pending";
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 48);
        var (items, total, pending, approved, rejected) = await stories.ReviewListAsync(status, page, pageSize, ct);
        return Ok(new ParentStoryReviewPage(items.Select(i => new ParentStoryReviewItem(i.PublicId, i.Reference, i.WrittenBy, i.ParentRole,
            i.ShownName, i.Age, i.CountryCode, i.StateName, i.City, i.Title, i.Story, i.Wish, i.Status, i.ReviewNote, i.ReviewedBy,
            i.ReviewedAtUtc, i.CreatedAtUtc, i.IsFeatured, i.Loves, i.OwnerEmail,
            i.Files.Select(f => new ParentStoryFileResponse(f.PublicId, f.Role, f.ContentType, f.SizeBytes)).ToList())).ToList(),
            total, page, pageSize, pending, approved, rejected));
    }

    /// <summary>A story's photo, video or voice note (pending ones too; videos can be played from any point).</summary>
    [HttpGet("files/{filePublicId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetFile(Guid filePublicId, CancellationToken ct)
    {
        var file = await stories.GetFileAsync(filePublicId, ct);
        return file is null ? NotFound() : File(file.Data, file.ContentType, enableRangeProcessing: true);
    }

    /// <summary>Approve or reject a story (a reason is needed to reject), put it back in the queue, or feature it.</summary>
    [HttpPut("{publicId:guid}/review")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Review(Guid publicId, ReviewParentStoryRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note is not null && (note.Contains('<') || note.Contains('>')))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "The reason can't contain < or >.");

        var (reference, error, message) = await stories.ReviewAsync(User.GetUserId(), publicId, request.Status, note, request.Featured, ct);
        if (error != SelfieRepository.ReviewError.None)
        {
            log.LogWarning("Review of story {PublicId} as {Status} refused for {Actor}: {Error}", publicId, request.Status, actor, error);
            return Problem(title: message, statusCode: error switch
            {
                SelfieRepository.ReviewError.NotReviewer => StatusCodes.Status403Forbidden,
                SelfieRepository.ReviewError.NotFound => StatusCodes.Status404NotFound,
                _ => StatusCodes.Status400BadRequest
            });
        }
        log.LogInformation("Parent story {Reference} set to {Status} (featured: {Featured}) by {Actor}", reference, request.Status, request.Featured, actor);
        return NoContent();
    }
}
