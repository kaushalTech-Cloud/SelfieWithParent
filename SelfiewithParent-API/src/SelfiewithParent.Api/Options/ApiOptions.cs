using System.ComponentModel.DataAnnotations;

namespace SelfiewithParent.Api.Options;

/// <summary>Access / refresh token settings. The signing key comes from user-secrets or a key vault — never appsettings.</summary>
public sealed class JwtOptions
{
    public const string Section = "Jwt";

    [Required] public string Issuer { get; init; } = "";
    [Required] public string Audience { get; init; } = "";

    /// <summary>Base64 HMAC-SHA256 key, at least 256 bits.</summary>
    [Required, MinLength(44)] public string SigningKey { get; init; } = "";

    [Range(5, 60)] public int AccessTokenMinutes { get; init; } = 15;
    [Range(1, 60)] public int RefreshTokenDays { get; init; } = 14;
}

/// <summary>One-time code (OTP) rules.</summary>
public sealed class OtpOptions
{
    public const string Section = "Otp";

    /// <summary>Base64 secret used to hash codes and phone numbers before they are stored.</summary>
    [Required, MinLength(44)] public string HashKey { get; init; } = "";

    [Range(1, 15)] public int CodeLifetimeMinutes { get; init; } = 5;
    [Range(1, 10)] public int MaxVerifyAttempts { get; init; } = 5;
    [Range(10, 300)] public int ResendCooldownSeconds { get; init; } = 30;
    [Range(1, 20)] public int MaxCodesPerNumberPerHour { get; init; } = 5;
}

public sealed class CorsOptions
{
    public const string Section = "Cors";
    public string[] AllowedOrigins { get; init; } = [];
}

/// <summary>
/// Outgoing email (sign-in codes) through an SMTP server — set up for Zoho Mail (India: smtp.zoho.in).
/// Username and Password come from user-secrets or a key vault — never appsettings. With two-factor sign-in on,
/// Zoho needs an *app-specific password* (accounts.zoho.in → Security → App Passwords), not the normal password.
/// Email is switched off while Username / Password are empty.
/// </summary>
/// <summary>The daily reminder emails (family dates, yearly Then &amp; Now nudge).</summary>
public sealed class RemindersOptions
{
    public const string Section = "Reminders";

    /// <summary>Run the daily reminder job.</summary>
    public bool Enabled { get; init; } = true;

    /// <summary>The hour (UTC) from which the day's reminders go out; 3 = 8:30 in India.</summary>
    [Range(0, 23)] public int SendHourUtc { get; init; } = 3;

    /// <summary>The public website, for the links in the emails (default: localhost:4400 in Development, the live site elsewhere).</summary>
    public string? SiteUrl { get; init; }

    /// <summary>In Development the emails are only written to the log, unless this is true.</summary>
    public bool SendInDevelopment { get; init; }
}

public sealed class SmtpOptions
{
    public const string Section = "Email:Smtp";

    [Required] public string Host { get; init; } = "smtp.zoho.in";
    [Range(1, 65535)] public int Port { get; init; } = 587;          // 587 = STARTTLS, 465 = TLS (encryption is required, never sent in plain text)
    public string Username { get; init; } = "";                      // the mailbox address, e.g. selfiewithparent@zohomail.in
    public string Password { get; init; } = "";                      // its app-specific password
    public string FromAddress { get; init; } = "";                   // empty = the mailbox address (Zoho refuses other senders)
    [Required] public string FromName { get; init; } = "Selfie with Parent";
    [Range(5, 120)] public int TimeoutSeconds { get; init; } = 20;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Username) && !string.IsNullOrWhiteSpace(Password);
}

public sealed class GoogleAuthOptions
{
    public const string Section = "GoogleAuth";

    /// <summary>OAuth client id from Google Cloud. Empty = Google sign-in switched off.</summary>
    public string ClientId { get; init; } = "";
}
