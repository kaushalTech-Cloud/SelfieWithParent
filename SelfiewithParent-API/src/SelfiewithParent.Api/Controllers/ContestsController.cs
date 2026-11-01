using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Reminders;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// Photo of the Week and festival contests: the most-liked photo approved during the contest wins (likes count until it
/// ends; the owner's own like doesn't count). Public: what's running now and its leaders, and past winners.
/// Admin: festival contests (super admins and admins), and deciding contests by hand (super admins).
/// </summary>
[ApiController]
[Produces("application/json")]
public sealed class ContestsController(SelfieRepository selfies, ContestJob job, ILogger<ContestsController> log) : ControllerBase
{
    private const int Leaders = 10;

    private static ContestResponse ToContest(SelfieRepository.ContestRow c) =>
        new(c.PublicId, c.Kind, c.Title, c.StartsAtUtc, c.EndsAtUtc, c.ClosedAtUtc is not null);

    /// <summary>The contests running now, each with its top 10 so far.</summary>
    [HttpGet("api/v1/contests/current")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(CurrentContestsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Current(CancellationToken ct)
    {
        var list = new List<OpenContestResponse>();
        foreach (var c in await selfies.OpenContestsAsync(ct))
        {
            var leaders = await selfies.StandingsAsync(c, Leaders, ct);
            list.Add(new OpenContestResponse(ToContest(c), leaders.Select((l, i) => new ContestEntryResponse(i + 1, l.Votes, SelfiesController.ToPublic(l.Row))).ToList()));
        }
        return Ok(new CurrentContestsResponse(list));
    }

    /// <summary>Past winners, newest first.</summary>
    [HttpGet("api/v1/contests/winners")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Gallery)]
    [ProducesResponseType(typeof(ContestWinnersPageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Winners([FromQuery] int page = 1, [FromQuery] int pageSize = 12, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 48);
        var (items, total) = await selfies.WinnersAsync(page, pageSize, ct);
        return Ok(new ContestWinnersPageResponse(
            items.Select(i => new ContestWinnerResponse(ToContest(i.Contest), i.Contest.WinnerLikes ?? 0, SelfiesController.ToPublic(i.Winner))).ToList(),
            total, page, pageSize));
    }

    // ---------- Admin ----------

    /// <summary>All contests (weekly and festival), newest first.</summary>
    [HttpGet("api/v1/admin/contests")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(typeof(IReadOnlyList<AdminContestResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken ct) =>
        Ok((await selfies.AllContestsAsync(ct)).Select(c => new AdminContestResponse(c.PublicId, c.Kind, c.Title, c.StartsAtUtc, c.EndsAtUtc,
            c.ClosedAtUtc, c.WinnerLikes, c.WinnerPublicId, c.WinnerReference)).ToList());

    /// <summary>Add a festival contest, e.g. "Diwali 2026" from 1 to 7 November (up to 31 days).</summary>
    [HttpPost("api/v1/admin/contests")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public Task<IActionResult> Add(SaveContestRequest r, CancellationToken ct) => Save(null, r, ct);

    /// <summary>Change a festival contest that hasn't been decided yet.</summary>
    [HttpPut("api/v1/admin/contests/{publicId:guid}")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public Task<IActionResult> Change(Guid publicId, SaveContestRequest r, CancellationToken ct) => Save(publicId, r, ct);

    private async Task<IActionResult> Save(Guid? publicId, SaveContestRequest r, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var title = r.Title.Trim();
        if (title.Contains('<') || title.Contains('>'))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Text can't contain < or >.");
        var (id, error, message) = await selfies.SaveContestAsync(User.GetUserId(), publicId, title,
            r.StartsOn!.Value.ToDateTime(TimeOnly.MinValue), r.EndsOn!.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), ct);
        if (id is null)
        {
            log.LogWarning("Contest {PublicId} refused for {Actor}: {Problem}", publicId, actor, message);
            return Problem(title: message, statusCode: error switch
            {
                SelfieRepository.ReviewError.NotReviewer => StatusCodes.Status403Forbidden,
                SelfieRepository.ReviewError.NotFound => StatusCodes.Status404NotFound,
                _ => StatusCodes.Status400BadRequest
            });
        }
        log.LogInformation("Festival contest {PublicId} ({Title}) {Action} by {Actor}", id, title, publicId is null ? "added" : "changed", actor);
        return publicId is null ? StatusCode(StatusCodes.Status201Created, new { publicId = id }) : NoContent();
    }

    /// <summary>Remove a festival contest that hasn't been decided yet.</summary>
    [HttpDelete("api/v1/admin/contests/{publicId:guid}")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Delete(Guid publicId, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var (error, message) = await selfies.DeleteContestAsync(User.GetUserId(), publicId, ct);
        if (error != SelfieRepository.ReviewError.None)
        {
            log.LogWarning("Removing contest {PublicId} refused for {Actor}: {Problem}", publicId, actor, message);
            return Problem(title: message, statusCode: error == SelfieRepository.ReviewError.NotFound ? StatusCodes.Status404NotFound : StatusCodes.Status400BadRequest);
        }
        log.LogInformation("Festival contest {PublicId} removed by {Actor}", publicId, actor);
        return NoContent();
    }

    /// <summary>Make this week's contest and decide ended ones now (super admins; the job also does it every 30 minutes).</summary>
    [HttpPost("api/v1/admin/contests/run")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(typeof(int), StatusCodes.Status200OK)]
    public async Task<IActionResult> RunNow([FromQuery] DateTime? nowUtc, CancellationToken ct)
    {
        var told = await job.RunAsync(nowUtc, ct);
        log.LogInformation("Contests run by {Actor} (as of {Now}): {Count} winner(s) told", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, nowUtc, told);
        return Ok(told);
    }
}
