using SelfiewithParent.Api.Data;

namespace SelfiewithParent.Api.Reminders;

/// <summary>
/// Every 30 minutes: makes sure this week's Photo of the Week exists, decides contests that have ended (most likes wins),
/// and emails each new winner once (their badge, certificate and Winner frame are on their selfie's page).
/// </summary>
public sealed class ContestJob(SelfieRepository selfies, ReminderEmails emails, TimeProvider clock, ILogger<ContestJob> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(30), clock);
        do
        {
            try { await RunAsync(null, stoppingToken); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Contest job run failed; it will try again in 30 minutes");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>Runs the contests (as of <paramref name="nowUtc"/>, for tests; now when null). Returns how many winners were told.</summary>
    public async Task<int> RunAsync(DateTime? nowUtc, CancellationToken ct)
    {
        await selfies.RunContestsAsync(nowUtc, ct);
        var told = 0;
        foreach (var w in await selfies.WinnersToTellAsync(ct))
        {
            if (!await emails.SendWinnerAsync(w, ct)) continue;   // tried again on the next run
            await selfies.MarkWinnerToldAsync(w.ContestPublicId, ct);
            told++;
            log.LogInformation("Contest {Contest} ({Title}) winner {Selfie} told", w.ContestPublicId, w.ContestTitle, w.SubmissionPublicId);
        }
        return told;
    }
}
