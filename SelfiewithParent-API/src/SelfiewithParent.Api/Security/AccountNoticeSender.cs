using System.Net;

namespace SelfiewithParent.Api.Security;

/// <summary>What happened to the email telling a visitor their account was made inactive / active.</summary>
public enum NoticeResult { Sent, WrittenToConsole, NoEmailOnFile, NotConfigured, Failed }

/// <summary>
/// Emails a visitor when a super admin makes their account inactive or active again, with the reason.
/// Never throws: the status change has already been saved, so a mail problem is reported, not fatal.
/// </summary>
public sealed class AccountNoticeSender(SmtpMailer mailer, IWebHostEnvironment env, ILogger<AccountNoticeSender> log)
{
    private const string ContactAddress = "hello@selfiewithparent.org";

    public async Task<NoticeResult> SendStatusChangeAsync(string? email, string? fullName, bool isActive, string reason, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(email)) return NoticeResult.NoEmailOnFile;

        if (!mailer.IsConfigured)
        {
            if (!env.IsDevelopment())
            {
                log.LogWarning("Account notice for {Email} not sent: no email provider is configured", EmailAddress.Mask(email));
                return NoticeResult.NotConfigured;
            }
            log.LogWarning("DEV ONLY - account notice for {Email}: account {Status}. Reason: {Reason}",
                EmailAddress.Mask(email), isActive ? "active again" : "inactive", reason);
            return NoticeResult.WrittenToConsole;
        }

        try
        {
            var greeting = string.IsNullOrWhiteSpace(fullName) ? "Hello," : $"Hello {fullName.Trim().Split(' ')[0]},";
            var subject = isActive ? "Your Selfie with Parent account is active again" : "Your Selfie with Parent account has been paused";
            var message = mailer.NewMessage(email, subject);
            var what = isActive
                ? "Good news: your Selfie with Parent account is active again. You can sign in and share as before."
                : "We've paused your Selfie with Parent account. While it's paused you can't sign in or share.";
            var next = isActive
                ? "Thank you for being part of the campaign."
                : $"If you think this is a mistake, or once you've sorted it out, reply to this email or write to {ContactAddress}.";

            var text = $"""
                {greeting}

                {what}

                Reason: {reason}

                {next}

                Selfie with Parent
                """;

            // The reason is typed by a super admin: always HTML-encoded before it goes into the HTML part
            var html = $"""
                <!doctype html>
                <html><body style="margin:0;padding:24px;background:#faf6f0;font-family:Arial,Helvetica,sans-serif;color:#1f2a2e">
                  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
                    <tr><td>
                      <p style="margin:0 0 8px;font-size:15px;color:#e8664a;font-weight:bold">Selfie with Parent</p>
                      <h1 style="margin:0 0 16px;font-size:20px">{WebUtility.HtmlEncode(subject)}</h1>
                      <p style="margin:0 0 12px;font-size:14px">{WebUtility.HtmlEncode(greeting)}</p>
                      <p style="margin:0 0 16px;font-size:14px">{WebUtility.HtmlEncode(what)}</p>
                      <p style="margin:0 0 6px;font-size:13px;color:#6b7478;font-weight:bold">Reason</p>
                      <p style="margin:0 0 16px;font-size:14px;background:#faf6f0;border-radius:10px;padding:12px 14px">{WebUtility.HtmlEncode(reason)}</p>
                      <p style="margin:0;font-size:13px;color:#6b7478">{WebUtility.HtmlEncode(next)}</p>
                    </td></tr>
                  </table>
                </body></html>
                """;

            message.Body = new MimeKit.BodyBuilder { TextBody = text, HtmlBody = html }.ToMessageBody();
            await mailer.SendAsync(message, isActive ? "account active again" : "account paused", ct);
            return NoticeResult.Sent;
        }
        catch (InvalidOperationException ex)
        {
            log.LogWarning(ex, "Account notice for {Email} could not be sent", EmailAddress.Mask(email));
            return NoticeResult.Failed;
        }
    }
}
