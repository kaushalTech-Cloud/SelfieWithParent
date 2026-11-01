using System.Net;
using Microsoft.Extensions.Options;
using MimeKit;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Options;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Reminders;

/// <summary>
/// The reminder emails: a family date coming up (3 days before / on the day) and "a year ago you shared this — take it
/// again". Names typed by visitors are always HTML-encoded. Every email has a one-click "switch off reminders" link.
/// In Development nothing is sent unless Reminders:SendInDevelopment is true (the email is written to the log instead).
/// </summary>
public sealed class ReminderEmails(SmtpMailer mailer, ReminderLinks links, IOptions<RemindersOptions> options, IWebHostEnvironment env,
    ILogger<ReminderEmails> log)
{
    private readonly RemindersOptions _o = options.Value;

    public string SiteUrl => (_o.SiteUrl ?? (env.IsDevelopment() ? "http://localhost:4400" : "https://www.selfiewithparent.org")).TrimEnd('/');

    /// <summary>"Papa's birthday" / "Maa and Papa's anniversary" / "Remembering Nani".</summary>
    public static string OccasionTitle(string name, string occasion) => occasion switch
    {
        "Anniversary" => $"{name}'s anniversary",
        "Remembrance" => $"Remembering {name}",
        _ => $"{name}'s birthday"
    };

    /// <summary>" — turning 66" / " — 35 years" when the year is known (on the date's day in <paramref name="year"/>).</summary>
    public static string Milestone(string occasion, short? dateYear, int year) =>
        dateYear is not { } y || year - y <= 0 ? ""
        : occasion switch { "Birthday" => $" — turning {year - y}", "Anniversary" => $" — {year - y} years", _ => "" };

    public async Task<bool> SendFamilyDateAsync(EngagementRepository.DueDateRow d, Guid userPublicId, int daysAway, DateOnly onDay, CancellationToken ct)
    {
        var title = OccasionTitle(d.Name.Trim(), d.Occasion);
        var remembrance = d.Occasion == "Remembrance";
        var subject = daysAway == 0
            ? (remembrance ? $"Today: {title}" : $"Today is {title}{Milestone(d.Occasion, d.DateYear, onDay.Year)}")
            : $"{title} is in {daysAway} days";
        var intro = daysAway == 0
            ? (remembrance ? $"Today you're remembering {d.Name.Trim()}." : $"Today is {title}{Milestone(d.Occasion, d.DateYear, onDay.Year)}.")
            : $"{title} is on {onDay:d MMMM} — {daysAway} days from now{Milestone(d.Occasion, d.DateYear, onDay.Year)}.";
        var ideas = remembrance
            ? new[] { ("Light a candle on the Memory Wall", "/memories"), ("Share a favourite photo in loving memory", "/upload?kind=memory") }
            : new[] { ("Take a selfie together and share it", "/upload"), ("Put it in a photo frame for WhatsApp and Instagram", "/selfies"),
                      ("Recreate an old photo: Then & Now", "/then-now") };
        return await SendAsync(d.Email!, d.FullName, userPublicId, subject, intro,
            remembrance ? "A small moment of remembrance:" : "A few ideas to make it special:", ideas, "family date", ct);
    }

    public async Task<bool> SendThenNowAsync(EngagementRepository.DueThenNowRow s, Guid userPublicId, DateOnly today, CancellationToken ct)
    {
        var years = today.Year - s.ApprovedAtUtc.Year;
        var ago = years == 1 ? "A year ago" : $"{years} years ago";
        var subject = $"{ago} you shared a selfie with {s.ParentName.Trim()}";
        var intro = $"{ago} today, your selfie with {s.ParentName.Trim()} went up on Selfie with Parent. "
                  + "Take the same photo again today and see how the years look side by side.";
        var ideas = new[] { ("Take it again: Then & Now (last year's photo is ready)", $"/then-now?again={s.PublicId}"),
                            ("See last year's selfie", $"/selfies/{s.PublicId}") };
        return await SendAsync(s.Email!, s.FullName, userPublicId, subject, intro, "", ideas, "then & now nudge", ct);
    }

    /// <summary>Sunday: "Have you called Maa this week? Keep your 5-week gratitude streak going."</summary>
    public async Task<bool> SendStreakAsync(GratitudeRepository.StreakNudgeRow s, CancellationToken ct)
    {
        var subject = s.Weeks >= 2 ? $"Keep your {s.Weeks}-week gratitude streak going" : "Have you called your parents this week?";
        var intro = "It's Sunday — a perfect day to call, visit or send a message to the people who raised you. "
                  + (s.Weeks >= 2 ? $"You've stayed in touch {s.Weeks} weeks so far. " : "") + "When you have, mark it on your account to keep your streak.";
        var ideas = new[] { ("Mark this week: I called / visited / sent a message", "/account#streak"), ("Take a selfie together and share it", "/upload") };
        return await SendAsync(s.Email, s.FullName, s.UserPublicId, subject, intro, "", ideas, "gratitude streak nudge", ct);
    }

    /// <summary>"Your selfie with Meena is the Photo of the Week!" — with links to the badge / certificate and the Winner frame.</summary>
    public async Task<bool> SendWinnerAsync(SelfieRepository.WinnerToTellRow w, CancellationToken ct)
    {
        var with = w.Kind == "family" ? w.ParentName.Trim() : $"your selfie with {w.ParentName.Trim()}";
        var title = w.ContestKind == "week" ? "the Photo of the Week" : $"the winner of {w.ContestTitle}";
        var subject = w.Kind == "family" ? $"{with} is {title}!" : $"{char.ToUpper(with[0])}{with[1..]} is {title}!";
        var days = $"{w.StartsAtUtc:d MMM} – {w.EndsAtUtc.AddDays(-1):d MMM yyyy}";
        var intro = $"Congratulations! With {w.WinnerLikes} {(w.WinnerLikes == 1 ? "like" : "likes")}, {with} won {title} ({days}). "
                  + "It now has a winner's badge on Selfie with Parent, and a winner's certificate and photo frame are waiting for you.";
        var ideas = new[] { ("See your winning selfie and certificate", $"/selfies/{w.SubmissionPublicId}"),
                            ("Download your Winner photo frame", $"/selfies/{w.SubmissionPublicId}/frame"),
                            ("See all winners", "/contest") };
        return await SendAsync(w.Email!, w.FullName, w.UserPublicId, subject, intro, "Share the good news:", ideas, "contest winner", ct);
    }

    private async Task<bool> SendAsync(string email, string? fullName, Guid userPublicId, string subject, string intro, string ideasTitle,
        IReadOnlyList<(string Text, string Path)> ideas, string purpose, CancellationToken ct)
    {
        var greeting = string.IsNullOrWhiteSpace(fullName) ? "Hello," : $"Hello {fullName.Trim().Split(' ')[0]},";
        var off = $"{SiteUrl}/reminders/off?u={userPublicId:D}&t={links.Sign(userPublicId)}";
        var manage = $"{SiteUrl}/account#reminders";

        if ((env.IsDevelopment() && !_o.SendInDevelopment) || !mailer.IsConfigured)
        {
            log.LogInformation("Reminder email ({Purpose}) to {Email} not sent ({Why}): {Subject}", purpose, EmailAddress.Mask(email),
                mailer.IsConfigured ? "Development" : "no email provider", subject);
            return env.IsDevelopment();   // counted as done in Development; tried again tomorrow elsewhere
        }

        var text = $"""
            {greeting}

            {intro}

            {ideasTitle}
            {string.Join("\n", ideas.Select(i => $"- {i.Text}: {SiteUrl}{i.Path}"))}

            Selfie with Parent

            You get this because you saved family dates or shared a selfie. Change reminders: {manage}
            Switch off all reminder emails: {off}
            """;
        static string e(string s) => WebUtility.HtmlEncode(s);
        var html = $"""
            <!doctype html>
            <html><body style="margin:0;padding:24px;background:#faf6f0;font-family:Arial,Helvetica,sans-serif;color:#1f2a2e">
              <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
                <tr><td>
                  <p style="margin:0 0 8px;font-size:15px;color:#e8664a;font-weight:bold">Selfie with Parent</p>
                  <h1 style="margin:0 0 16px;font-size:20px">{e(subject)}</h1>
                  <p style="margin:0 0 12px;font-size:14px">{e(greeting)}</p>
                  <p style="margin:0 0 16px;font-size:14px">{e(intro)}</p>
                  {(ideasTitle.Length > 0 ? $"<p style=\"margin:0 0 8px;font-size:14px;font-weight:bold\">{e(ideasTitle)}</p>" : "")}
                  {string.Join("", ideas.Select(i => $"<p style=\"margin:0 0 10px\"><a href=\"{e(SiteUrl + i.Path)}\" style=\"display:inline-block;background:#0f5b5c;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-size:14px\">{e(i.Text)}</a></p>"))}
                  <p style="margin:20px 0 0;font-size:12px;color:#6b7478">You get this because you saved family dates or shared a selfie.
                    <a href="{e(manage)}" style="color:#6b7478">Change reminders</a> · <a href="{e(off)}" style="color:#6b7478">Switch off all reminder emails</a></p>
                </td></tr>
              </table>
            </body></html>
            """;
        try
        {
            var message = mailer.NewMessage(email, subject);
            message.Headers.Add("List-Unsubscribe", $"<{off}>");
            message.Body = new BodyBuilder { TextBody = text, HtmlBody = html }.ToMessageBody();
            await mailer.SendAsync(message, purpose, ct);
            return true;
        }
        catch (InvalidOperationException ex)
        {
            log.LogWarning(ex, "Reminder email ({Purpose}) to {Email} could not be sent", purpose, EmailAddress.Mask(email));
            return false;
        }
    }
}
