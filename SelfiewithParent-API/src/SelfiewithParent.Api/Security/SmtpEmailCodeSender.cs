using System.Net;
using Microsoft.Extensions.Options;
using MimeKit;
using SelfiewithParent.Api.Options;

namespace SelfiewithParent.Api.Security;

/// <summary>
/// Sends sign-in codes by email through <see cref="SmtpMailer"/>. The code itself is never logged.
/// Any failure becomes an <see cref="InvalidOperationException"/>, which the API turns into
/// "We couldn't send a code right now".
/// </summary>
public sealed class SmtpEmailCodeSender(SmtpMailer mailer, IOptions<OtpOptions> otp, ILogger<SmtpEmailCodeSender> log) : IEmailCodeSender
{
    public async Task SendAsync(string email, string code, CancellationToken ct)
    {
        MimeMessage message;
        try { message = mailer.NewMessage(email, $"{code} is your Selfie with Parent sign-in code"); }
        catch (InvalidOperationException)
        {
            log.LogWarning("Email address {Email} could not be used for sending", EmailAddress.Mask(email));
            throw;
        }

        var minutes = otp.Value.CodeLifetimeMinutes;
        var text = $"""
            Your Selfie with Parent sign-in code is: {code}

            It works once and expires in {minutes} minutes.
            If you didn't ask for this code, you can ignore this email — nobody can sign in without it.

            Selfie with Parent
            """;

        // Only fixed text and the 6 digits go into the HTML; the address is not echoed back
        var html = $"""
            <!doctype html>
            <html><body style="margin:0;padding:24px;background:#faf6f0;font-family:Arial,Helvetica,sans-serif;color:#1f2a2e">
              <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
                <tr><td>
                  <p style="margin:0 0 8px;font-size:15px;color:#e8664a;font-weight:bold">Selfie with Parent</p>
                  <h1 style="margin:0 0 16px;font-size:20px">Your sign-in code</h1>
                  <p style="margin:0 0 20px;font-size:34px;letter-spacing:8px;font-weight:bold">{WebUtility.HtmlEncode(code)}</p>
                  <p style="margin:0 0 8px;font-size:14px">It works once and expires in {minutes} minutes.</p>
                  <p style="margin:0;font-size:13px;color:#6b7478">If you didn't ask for this code, you can ignore this email — nobody can sign in without it.</p>
                </td></tr>
              </table>
            </body></html>
            """;

        message.Body = new BodyBuilder { TextBody = text, HtmlBody = html }.ToMessageBody();
        await mailer.SendAsync(message, "sign-in code", ct);
    }
}
