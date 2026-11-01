using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using SelfiewithParent.Api.Options;

namespace SelfiewithParent.Api.Security;

/// <summary>
/// Sends one email through the configured SMTP server (Zoho / Gmail). The connection is always encrypted
/// (STARTTLS on 587, TLS on 465) and the server certificate is checked. Message contents are never logged.
/// Any failure becomes an <see cref="InvalidOperationException"/> so callers can decide what to tell the user.
/// </summary>
public sealed class SmtpMailer(IOptions<SmtpOptions> options, ILogger<SmtpMailer> log)
{
    private readonly SmtpOptions _o = options.Value;

    public bool IsConfigured => _o.IsConfigured;
    public string Host => _o.Host;

    /// <summary>A message from the site's address to <paramref name="to"/>; throws if the address can't be used.</summary>
    public MimeMessage NewMessage(string to, string subject)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_o.FromName, string.IsNullOrWhiteSpace(_o.FromAddress) ? _o.Username : _o.FromAddress));
        try { message.To.Add(MailboxAddress.Parse(to)); }
        catch (ParseException ex) { throw new InvalidOperationException("The email address could not be used.", ex); }
        message.Subject = subject;
        return message;
    }

    public async Task SendAsync(MimeMessage message, string purpose, CancellationToken ct)
    {
        var to = EmailAddress.Mask(message.To.Mailboxes.FirstOrDefault()?.Address ?? "");
        using var client = new SmtpClient { Timeout = _o.TimeoutSeconds * 1000 };
        try
        {
            var security = _o.Port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;
            await client.ConnectAsync(_o.Host, _o.Port, security, ct);
            await client.AuthenticateAsync(_o.Username, _o.Password, ct);
            await client.SendAsync(message, ct);
            await client.DisconnectAsync(quit: true, ct);
            log.LogInformation("Email ({Purpose}) sent to {Email} via {Host}", purpose, to, _o.Host);
        }
        catch (AuthenticationException ex)
        {
            log.LogError(ex, "SMTP sign-in to {Host} was refused: check Email:Smtp:Username and the app password", _o.Host);
            throw new InvalidOperationException("The email server refused the sign-in.", ex);
        }
        catch (Exception ex) when (ex is SmtpCommandException or SmtpProtocolException or IOException
                                      or System.Net.Sockets.SocketException or SslHandshakeException or TimeoutException)
        {
            log.LogError(ex, "Could not send email ({Purpose}) to {Email} via {Host}", purpose, to, _o.Host);
            throw new InvalidOperationException("The email could not be sent.", ex);
        }
    }
}
