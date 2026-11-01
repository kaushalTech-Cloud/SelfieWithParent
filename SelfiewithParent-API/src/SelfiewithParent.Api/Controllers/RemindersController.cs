using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Reminders;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// Family dates (parents' / grandparents' birthdays, anniversaries, remembrance days) and reminder choices for the signed-in
/// visitor; the notice of what's coming up; and the one-click "switch off reminders" link from the emails.
/// </summary>
[ApiController]
[Authorize]
[Produces("application/json")]
public sealed class RemindersController(EngagementRepository repo, GratitudeRepository gratitude, ReminderLinks links, ReminderJob job, TimeProvider clock,
    ILogger<RemindersController> log) : ControllerBase
{
    private const int UpcomingDays = 14;

    private DateOnly Today => DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
    private string? Actor => User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

    /// <summary>My family dates, with how many days until each.</summary>
    [HttpGet("api/v1/me/family-dates")]
    [ProducesResponseType(typeof(IReadOnlyList<FamilyDateResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var today = Today;
        return Ok((await repo.MyDatesAsync(User.GetUserId(), ct))
            .Select(d => new FamilyDateResponse(d.PublicId, d.Name, d.Relation, d.Occasion, d.DateMonth, d.DateDay, d.DateYear,
                Anniversary.DaysUntil(today, d.DateMonth, d.DateDay)))
            .OrderBy(d => d.DaysUntil).ToList());
    }

    /// <summary>Add a family date (up to 20).</summary>
    [HttpPost("api/v1/me/family-dates")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(FamilyDateResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public Task<IActionResult> Add(SaveFamilyDateRequest request, CancellationToken ct) => Save(null, request, ct);

    /// <summary>Change one of my family dates.</summary>
    [HttpPut("api/v1/me/family-dates/{publicId:guid}")]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(FamilyDateResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public Task<IActionResult> Change(Guid publicId, SaveFamilyDateRequest request, CancellationToken ct) => Save(publicId, request, ct);

    private async Task<IActionResult> Save(Guid? publicId, SaveFamilyDateRequest r, CancellationToken ct)
    {
        var name = r.Name.Trim();
        if (name.Contains('<') || name.Contains('>'))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]> { [nameof(r.Name)] = ["Text can't contain < or >."] }));
        var (id, problem) = await repo.SaveDateAsync(User.GetUserId(), publicId,
            new EngagementRepository.NewFamilyDate(name, r.Relation, r.Occasion, (byte)r.Month!.Value, (byte)r.Day!.Value, (short?)r.Year), ct);
        if (id is null)
        {
            log.LogWarning("Family date refused for {Actor}: {Problem}", Actor, problem);
            return problem == "That date wasn't found." ? Problem(statusCode: StatusCodes.Status404NotFound, title: problem)
                : Problem(statusCode: StatusCodes.Status400BadRequest, title: problem);
        }
        log.LogInformation("Family date {PublicId} ({Occasion}) {Action} by {Actor}", id, r.Occasion, publicId is null ? "added" : "changed", Actor);
        var saved = new FamilyDateResponse(id.Value, name, r.Relation, r.Occasion, r.Month.Value, r.Day.Value, r.Year,
            Anniversary.DaysUntil(Today, r.Month.Value, r.Day.Value));
        return publicId is null ? StatusCode(StatusCodes.Status201Created, saved) : Ok(saved);
    }

    /// <summary>Remove one of my family dates.</summary>
    [HttpDelete("api/v1/me/family-dates/{publicId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid publicId, CancellationToken ct)
    {
        if (!await repo.DeleteDateAsync(User.GetUserId(), publicId, ct))
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "That date wasn't found.");
        log.LogInformation("Family date {PublicId} removed by {Actor}", publicId, Actor);
        return NoContent();
    }

    /// <summary>My reminder choices: family date emails, and the yearly "take it again" Then &amp; Now email.</summary>
    [HttpGet("api/v1/me/reminders")]
    [ProducesResponseType(typeof(ReminderSettingsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Settings(CancellationToken ct)
    {
        var s = await repo.MySettingsAsync(User.GetUserId(), ct);
        return Ok(new ReminderSettingsResponse(s.EmailReminders, s.ThenNowNudges));
    }

    [HttpPut("api/v1/me/reminders")]
    [ProducesResponseType(typeof(ReminderSettingsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> SetSettings(ReminderSettingsRequest r, CancellationToken ct)
    {
        await repo.SetSettingsAsync(User.GetUserId(), r.EmailReminders!.Value, r.ThenNowNudges!.Value, ct);
        log.LogInformation("Reminder choices of {Actor}: dates {Dates}, then & now {ThenNow}", Actor, r.EmailReminders, r.ThenNowNudges);
        return Ok(new ReminderSettingsResponse(r.EmailReminders.Value, r.ThenNowNudges.Value));
    }

    /// <summary>What's coming up for me: family dates in the next two weeks, and selfies I shared about a year ago.</summary>
    [HttpGet("api/v1/me/reminders/upcoming")]
    [ProducesResponseType(typeof(UpcomingResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Upcoming(CancellationToken ct)
    {
        var today = Today;
        var userId = User.GetUserId();
        var dates = (await repo.MyDatesAsync(userId, ct))
            .Select(d => (d, days: Anniversary.DaysUntil(today, d.DateMonth, d.DateDay)))
            .Where(x => x.days <= UpcomingDays)
            .OrderBy(x => x.days)
            .Select(x =>
            {
                var date = today.AddDays(x.days);
                int? turning = x.d.DateYear is { } y && x.d.Occasion != "Remembrance" && date.Year > y ? date.Year - y : null;
                return new UpcomingDateResponse(x.d.PublicId, x.d.Name, x.d.Relation, x.d.Occasion, date, x.days, turning);
            }).ToList();
        var anniversaries = (await repo.MySelfieAnniversariesAsync(userId, today, 7, ct))
            .Select(s => new SelfieAnniversaryResponse(s.PublicId, s.ParentName.Trim(),
                Math.Max(1, (int)Math.Round((today.DayNumber - DateOnly.FromDateTime(s.ApprovedAtUtc).DayNumber) / 365.25)), s.PhotoId))
            .ToList();
        return Ok(new UpcomingResponse(dates, anniversaries));
    }

    /// <summary>The "switch off all reminder emails" link from a reminder email (no sign-in needed; the link is signed).</summary>
    [HttpPost("api/v1/reminders/off")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Off(RemindersOffRequest r, CancellationToken ct)
    {
        var userId = links.IsValid(r.User!.Value, r.Token) ? await repo.ActiveUserIdAsync(r.User.Value, ct) : null;
        if (userId is null)
        {
            log.LogWarning("Reminders-off link refused for {User}", r.User);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "This link doesn't work any more. Sign in and change reminders in My account.");
        }
        await repo.SetSettingsAsync(userId.Value, false, false, ct);
        await gratitude.SetNudgesAsync(userId.Value, false, ct);
        log.LogInformation("Reminder emails switched off from an email link for {User}", r.User);
        return NoContent();
    }

    /// <summary>Send today's reminders now (super admins; the job also runs by itself every day). Returns how many went out.</summary>
    [HttpPost("api/v1/admin/reminders/run")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(typeof(int), StatusCodes.Status200OK)]
    public async Task<IActionResult> RunNow([FromQuery] DateOnly? day, CancellationToken ct)
    {
        var sent = await job.RunAsync(day ?? Today, ct);
        log.LogInformation("Reminders run by {Actor} for {Day}: {Count} sent", Actor, day ?? Today, sent);
        return Ok(sent);
    }
}
