using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// The admin dashboard's numbers: the review queue, approvals, uploads (photos, videos, voice notes), visitors, and the last
/// seven days. Counts only — every staff member can see them. The queue preview (first names) is for reviewers only.
/// </summary>
[ApiController]
[Route("api/v1/admin/dashboard")]
[Authorize(Policy = Policies.Staff)]
[Produces("application/json")]
public sealed class DashboardController(SelfieRepository selfies) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(DashboardResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var (n, days, kinds, latest) = await selfies.DashboardAsync(ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var byDay = days.ToDictionary(d => DateOnly.FromDateTime(d.Day), d => d.Count);
        var last7 = Enumerable.Range(0, 7).Select(i => today.AddDays(i - 6)).Select(d => new DashboardDay(d, byDay.GetValueOrDefault(d))).ToList();
        var isReviewer = AppRoles.Reviewers.Any(User.IsInRole);

        return Ok(new DashboardResponse(
            n.Pending, n.OldestPendingAtUtc,
            new WeekNumber(n.ApprovedThisWeek, n.ApprovedLastWeek), new WeekNumber(n.SharedThisWeek, n.SharedLastWeek),
            new WeekNumber(n.VideosThisWeek, n.VideosLastWeek), new WeekNumber(n.NewVisitorsThisWeek, n.NewVisitorsLastWeek),
            n.Total, n.Approved, n.Rejected, n.Uploaders, n.Photos, n.Videos, n.VoiceNotes, n.Visitors,
            last7,
            new[] { "real", "ai", "memory", "family", "thennow", "frame", "reel" }.ToDictionary(k => k, k => kinds.FirstOrDefault(x => x.Kind == k)?.Count ?? 0),
            isReviewer
                ? latest.Select(l => new DashboardQueueItem(l.PublicId, $"SWP-{l.SubmissionId:000000}", l.Kind,
                    l.Kind == "family" ? l.ParentName : $"{l.YourName.Trim().Split(' ')[0]} with {l.ParentName.Trim()}",
                    l.CreatedAtUtc, l.HasPhoto, l.HasVideo, l.HasVoice)).ToList()
                : null));
    }
}
