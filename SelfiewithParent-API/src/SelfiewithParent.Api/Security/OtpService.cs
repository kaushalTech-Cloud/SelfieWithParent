using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;
using SelfiewithParent.Api.Options;

namespace SelfiewithParent.Api.Security;

public enum OtpSendResult { Sent, TooSoon, TooManyForNumber }
public enum OtpVerifyResult { Valid, Invalid, ExpiredOrMissing, TooManyAttempts }

/// <summary>
/// 6-digit one-time codes for any sign-in address (a mobile number or an email).
/// Codes come from a cryptographic RNG, are stored only as keyed hashes (HMAC-SHA256),
/// expire quickly, allow a few attempts, are single-use, and are compared in constant time.
/// The address itself is also only used as a keyed hash in cache keys.
/// </summary>
public sealed class OtpService(IOptions<OtpOptions> options, IDistributedCache cache, TimeProvider clock)
{
    private readonly OtpOptions _o = options.Value;
    private readonly byte[] _key = Convert.FromBase64String(options.Value.HashKey);

    private sealed record Challenge(string CodeHash, DateTimeOffset ExpiresAt, DateTimeOffset SentAt, int Attempts);

    /// <summary>The sign-in address for a mobile number.</summary>
    public static string MobileIdentity(string countryCode, string digits) => $"mobile|{countryCode}|{digits}";

    /// <summary>The sign-in address for an email (pass the normalised, lower-case address).</summary>
    public static string EmailIdentity(string normalisedEmail) => $"email|{normalisedEmail}";

    /// <summary>Creates a code for the address and hands it to <paramref name="deliver"/> (SMS, WhatsApp or email).</summary>
    public async Task<(OtpSendResult Result, int RetryAfterSeconds)> SendAsync(
        string identity, Func<string, CancellationToken, Task> deliver, CancellationToken ct)
    {
        var id = IdentityKey(identity);
        var now = clock.GetUtcNow();

        var existing = await GetAsync(id, ct);
        if (existing is not null && (now - existing.SentAt).TotalSeconds < _o.ResendCooldownSeconds)
            return (OtpSendResult.TooSoon, _o.ResendCooldownSeconds - (int)(now - existing.SentAt).TotalSeconds);

        // Hourly cap per address (stops message bombing a victim and messaging-cost abuse)
        var countKey = $"swp:otp-count:{id}";
        var count = int.TryParse(await cache.GetStringAsync(countKey, ct), out var c) ? c : 0;
        if (count >= _o.MaxCodesPerNumberPerHour) return (OtpSendResult.TooManyForNumber, 3600);
        await cache.SetStringAsync(countKey, (count + 1).ToString(),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1) }, ct);

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var challenge = new Challenge(CodeHash(id, code), now.AddMinutes(_o.CodeLifetimeMinutes), now, 0);
        await cache.SetStringAsync($"swp:otp:{id}", JsonSerializer.Serialize(challenge),
            new DistributedCacheEntryOptions { AbsoluteExpiration = challenge.ExpiresAt }, ct);

        await deliver(code, ct);
        return (OtpSendResult.Sent, 0);
    }

    public async Task<OtpVerifyResult> VerifyAsync(string identity, string code, CancellationToken ct)
    {
        var id = IdentityKey(identity);
        var challenge = await GetAsync(id, ct);
        if (challenge is null || challenge.ExpiresAt <= clock.GetUtcNow()) return OtpVerifyResult.ExpiredOrMissing;

        if (challenge.Attempts >= _o.MaxVerifyAttempts)
        {
            await cache.RemoveAsync($"swp:otp:{id}", ct);
            return OtpVerifyResult.TooManyAttempts;
        }

        var ok = CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(challenge.CodeHash), Convert.FromHexString(CodeHash(id, code)));

        if (ok)
        {
            await cache.RemoveAsync($"swp:otp:{id}", ct);    // single use
            return OtpVerifyResult.Valid;
        }

        var updated = challenge with { Attempts = challenge.Attempts + 1 };
        if (updated.Attempts >= _o.MaxVerifyAttempts)
        {
            await cache.RemoveAsync($"swp:otp:{id}", ct);
            return OtpVerifyResult.TooManyAttempts;
        }
        await cache.SetStringAsync($"swp:otp:{id}", JsonSerializer.Serialize(updated),
            new DistributedCacheEntryOptions { AbsoluteExpiration = challenge.ExpiresAt }, ct);
        return OtpVerifyResult.Invalid;
    }

    private async Task<Challenge?> GetAsync(string id, CancellationToken ct)
    {
        var json = await cache.GetStringAsync($"swp:otp:{id}", ct);
        return json is null ? null : JsonSerializer.Deserialize<Challenge>(json);
    }

    private string IdentityKey(string identity) =>
        Convert.ToHexString(HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"id|{identity}")));

    private string CodeHash(string identityKey, string code) =>
        Convert.ToHexString(HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"code|{identityKey}|{code}")));
}

/// <summary>Sends the code by SMS or WhatsApp.</summary>
public interface IOtpSender
{
    Task SendAsync(string countryCode, string digits, string code, string channel, CancellationToken ct);
}

/// <summary>Sends the code by email.</summary>
public interface IEmailCodeSender
{
    Task SendAsync(string email, string code, CancellationToken ct);
}

/// <summary>
/// DEVELOPMENT ONLY: no SMS / email is sent; the code is written to this API's console so it can be tested locally.
/// Registered only when the environment is Development.
/// </summary>
public sealed class DevelopmentOtpSender(ILogger<DevelopmentOtpSender> log) : IOtpSender, IEmailCodeSender
{
    public Task SendAsync(string countryCode, string digits, string code, string channel, CancellationToken ct)
    {
        log.LogWarning("DEV ONLY - one-time code for {Phone} via {Channel}: {Code}", PhoneNumber.Mask(countryCode, digits), channel, code);
        return Task.CompletedTask;
    }

    public Task SendAsync(string email, string code, CancellationToken ct)
    {
        log.LogWarning("DEV ONLY - one-time code for {Email} via email: {Code}", EmailAddress.Mask(email), code);
        return Task.CompletedTask;
    }
}

/// <summary>Used outside Development until real SMS / WhatsApp / email providers are connected: refuses to send.</summary>
public sealed class NotConfiguredOtpSender : IOtpSender, IEmailCodeSender
{
    public Task SendAsync(string countryCode, string digits, string code, string channel, CancellationToken ct) =>
        throw new InvalidOperationException("No SMS / WhatsApp provider is configured.");

    public Task SendAsync(string email, string code, CancellationToken ct) =>
        throw new InvalidOperationException("No email provider is configured.");
}
