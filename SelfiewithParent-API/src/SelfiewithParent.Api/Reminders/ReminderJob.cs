using Microsoft.Extensions.Options;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Options;

namespace SelfiewithParent.Api.Reminders;

/// <summary>
/// Once a day (from Reminders:SendHourUtc), emails family date reminders — 3 days before and on the day — and the yearly
/// "take it again" Then &amp; Now nudge, and on Sundays the "keep your gratitude streak" email. Each email is claimed in selfie.ReminderLog first, so it goes out once even if the
/// job runs again or on more than one server; a failed send is given back and tried again on the next run.
/// </summary>
public sealed class ReminderJob(EngagementRepository repo, GratitudeRepository gratitude, FeatureRepository features, ReminderEmails emails,
    IOptions<RemindersOptions> options, TimeProvider clock,
    ILogger<ReminderJob> log) : BackgroundService
{
    public const int DaysBefore = 3;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            log.LogInformation("Reminder job is switched off (Reminders:Enabled)");
            return;
        }
        // Check every 30 minutes; each run only sends what hasn't been sent yet today
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(30), clock);
        do
        {
            try
            {
                var now = clock.GetUtcNow();
                if (now.Hour >= options.Value.SendHourUtc) await RunAsync(DateOnly.FromDateTime(now.UtcDateTime), stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Reminder job run failed; it will try again in 30 minutes");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>Sends today's reminders. Returns how many emails went out.</summary>
    public async Task<int> RunAsync(DateOnly today, CancellationToken ct)
    {
        var sent = 0;
        foreach (var (kind, daysAway) in new[] { ("today", 0), ("soon", DaysBefore) })
        {
            var day = today.AddDays(daysAway);
            // 29 February dates are remembered on 28 February in other years
            var keys = new List<(int, int)> { (day.Month, day.Day) };
            if (day is { Month: 2, Day: 28 } && !DateTime.IsLeapYear(day.Year)) keys.Add((2, 29));
            foreach (var d in await repo.DueDatesAsync(keys, ct))
            {
                if (!await repo.ClaimReminderAsync(d.UserId, kind, d.FamilyDateId, day, release: false, ct)) continue;
                if (await emails.SendFamilyDateAsync(d, d.UserPublicId, daysAway, day, ct)) sent++;
                else await repo.ClaimReminderAsync(d.UserId, kind, d.FamilyDateId, day, release: true, ct);
            }
        }
        foreach (var s in await repo.DueThenNowAsync(today, ct))
        {
            if (!await repo.ClaimReminderAsync(s.UserId, "thennow", s.SubmissionId, today, release: false, ct)) continue;
            if (await emails.SendThenNowAsync(s, s.UserPublicId, today, ct)) sent++;
            else await repo.ClaimReminderAsync(s.UserId, "thennow", s.SubmissionId, today, release: true, ct);
        }
        // Sunday (India time): "keep your gratitude streak" to visitors who marked last week but not this week yet
        var indiaToday = GratitudeRepository.Today(clock.GetUtcNow());
        if (indiaToday.DayOfWeek == DayOfWeek.Sunday && await features.IsOnAsync("streaks", ct))
            foreach (var s in await gratitude.DueNudgesAsync(GratitudeRepository.MondayOf(indiaToday), ct))
            {
                if (!await repo.ClaimReminderAsync(s.UserId, "streak", s.UserId, indiaToday, release: false, ct)) continue;
                if (await emails.SendStreakAsync(s, ct)) sent++;
                else await repo.ClaimReminderAsync(s.UserId, "streak", s.UserId, indiaToday, release: true, ct);
            }
        if (sent > 0) log.LogInformation("Reminder job sent {Count} reminder email(s) for {Day}", sent, today);
        return sent;
    }
}
