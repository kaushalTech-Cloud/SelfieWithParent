using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using SelfiewithParent.Api.Options;

namespace SelfiewithParent.Api.Security;

/// <summary>
/// The "switch off reminders" link in every reminder email: the account's public id plus a signature, so it works
/// without signing in but nobody can switch off someone else's reminders. The key is derived from the JWT signing key
/// with its own purpose, so a link can't be used as a token or the other way round.
/// </summary>
public sealed class ReminderLinks(IOptions<JwtOptions> jwt)
{
    private readonly byte[] _key = HMACSHA256.HashData(Convert.FromBase64String(jwt.Value.SigningKey), "reminders-off-link-v1"u8);

    public string Sign(Guid userPublicId) =>
        Convert.ToBase64String(HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes(userPublicId.ToString("D")))).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public bool IsValid(Guid userPublicId, string? signature) =>
        signature is { Length: > 0 and < 100 } && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Sign(userPublicId)), Encoding.ASCII.GetBytes(signature));
}
