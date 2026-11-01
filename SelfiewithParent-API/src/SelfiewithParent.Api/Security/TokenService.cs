using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Options;

namespace SelfiewithParent.Api.Security;

/// <summary>
/// Issues short-lived access tokens (JWT) and rotating refresh tokens.
/// Refresh tokens are random, stored only as SHA-256 hashes, single-use, and grouped in a "family":
/// if a used refresh token is presented again (a sign of theft), the whole family is revoked.
/// Store: IDistributedCache (in-memory for development; use Redis in production so it survives restarts and scales).
/// </summary>
public sealed class TokenService(IOptions<JwtOptions> options, IDistributedCache cache, TimeProvider clock)
{
    private readonly JwtOptions _o = options.Value;
    private readonly JsonWebTokenHandler _handler = new();

    private sealed record RefreshEntry(long UserId, string Family, DateTimeOffset ExpiresAt);

    public static SymmetricSecurityKey CreateSigningKey(JwtOptions o) => new(Convert.FromBase64String(o.SigningKey));

    public async Task<TokenResponse> IssueAsync(UserRepository.SignInUser user, string? family, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var accessExpires = now.AddMinutes(_o.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.PublicId.ToString()),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(AppClaims.UserId, user.UserId.ToString()),
            new(AppClaims.ProfileComplete, user.ProfileComplete ? "1" : "0")
        };
        claims.AddRange(user.Roles.Select(r => new Claim("role", r)));

        var accessToken = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = _o.Issuer,
            Audience = _o.Audience,
            Subject = new ClaimsIdentity(claims),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = accessExpires.UtcDateTime,
            SigningCredentials = new SigningCredentials(CreateSigningKey(_o), SecurityAlgorithms.HmacSha256)
        });

        var refreshToken = Base64Url(RandomNumberGenerator.GetBytes(32));
        var refreshExpires = now.AddDays(_o.RefreshTokenDays);
        var entry = new RefreshEntry(user.UserId, family ?? Guid.NewGuid().ToString("N"), refreshExpires);
        await cache.SetStringAsync(Key("rt", Hash(refreshToken)), JsonSerializer.Serialize(entry),
            new DistributedCacheEntryOptions { AbsoluteExpiration = refreshExpires }, ct);

        return new TokenResponse(accessToken, accessExpires, refreshToken, refreshExpires, user.ProfileComplete);
    }

    /// <summary>Uses up a refresh token. Returns the user id + family, or null if invalid, expired, reused or revoked.</summary>
    public async Task<(long UserId, string Family)?> RedeemRefreshTokenAsync(string refreshToken, CancellationToken ct)
    {
        var hash = Hash(refreshToken);
        var json = await cache.GetStringAsync(Key("rt", hash), ct);

        if (json is null)
        {
            // Reuse of an already-used token → assume it was stolen and shut the whole family down
            var usedFamily = await cache.GetStringAsync(Key("rt-used", hash), ct);
            if (usedFamily is not null) await RevokeFamilyAsync(usedFamily, ct);
            return null;
        }

        var entry = JsonSerializer.Deserialize<RefreshEntry>(json)!;
        await cache.RemoveAsync(Key("rt", hash), ct);
        await cache.SetStringAsync(Key("rt-used", hash), entry.Family,
            new DistributedCacheEntryOptions { AbsoluteExpiration = entry.ExpiresAt }, ct);

        if (entry.ExpiresAt <= clock.GetUtcNow()) return null;
        if (await cache.GetStringAsync(Key("rtf-revoked", entry.Family), ct) is not null) return null;
        return (entry.UserId, entry.Family);
    }

    /// <summary>Sign out: the refresh token's family stops working, and the current access token is blocked until it expires.</summary>
    public async Task RevokeAsync(string? refreshToken, string? accessTokenId, DateTimeOffset? accessTokenExpires, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(refreshToken))
        {
            var json = await cache.GetStringAsync(Key("rt", Hash(refreshToken)), ct);
            if (json is not null)
            {
                await RevokeFamilyAsync(JsonSerializer.Deserialize<RefreshEntry>(json)!.Family, ct);
                await cache.RemoveAsync(Key("rt", Hash(refreshToken)), ct);
            }
        }
        if (!string.IsNullOrEmpty(accessTokenId) && accessTokenExpires is { } exp && exp > clock.GetUtcNow())
        {
            await cache.SetStringAsync(Key("jti-revoked", accessTokenId), "1",
                new DistributedCacheEntryOptions { AbsoluteExpiration = exp }, ct);
        }
    }

    /// <summary>Signs a user out everywhere (e.g. after deleting their account): blocks every refresh token issued before now.</summary>
    public Task RevokeAllForUserAsync(long userId, CancellationToken ct) =>
        cache.SetStringAsync(Key("user-revoked-before", userId.ToString()), clock.GetUtcNow().ToUnixTimeSeconds().ToString(),
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(_o.RefreshTokenDays + 1) }, ct);

    public async Task<bool> IsUserRevokedSinceAsync(long userId, DateTimeOffset issuedAt, CancellationToken ct)
    {
        var v = await cache.GetStringAsync(Key("user-revoked-before", userId.ToString()), ct);
        return v is not null && long.TryParse(v, out var cutoff) && issuedAt.ToUnixTimeSeconds() <= cutoff;
    }

    public async Task<bool> IsAccessTokenRevokedAsync(string jti, CancellationToken ct) =>
        await cache.GetStringAsync(Key("jti-revoked", jti), ct) is not null;

    private Task RevokeFamilyAsync(string family, CancellationToken ct) =>
        cache.SetStringAsync(Key("rtf-revoked", family), "1",
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(_o.RefreshTokenDays + 1) }, ct);

    private static string Key(string kind, string id) => $"swp:{kind}:{id}";
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
