using System.Security.Cryptography;
using System.Text;

namespace SelfiewithParent.Api.Security;

/// <summary>
/// Salted, slow password hashes: PBKDF2-HMAC-SHA512, 210,000 iterations (OWASP guidance), 16-byte random salt,
/// 32-byte hash. Stored as "pbkdf2-sha512$&lt;iterations&gt;$&lt;salt&gt;$&lt;hash&gt;" so the cost can be raised later
/// (older hashes are upgraded at the next successful sign-in). The password itself is never stored or logged.
/// </summary>
public static class PasswordHasher
{
    private const string Scheme = "pbkdf2-sha512";
    private const int Iterations = 210_000;
    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    /// <summary>Checked when the email has no password, so a wrong email takes as long as a wrong password.</summary>
    private static readonly string DummyHash = Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)));

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Derive(password, salt, Iterations);
        return $"{Scheme}${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    /// <summary>True when the password matches. <paramref name="needsUpgrade"/> is set when the stored hash uses an older cost.</summary>
    public static bool Verify(string password, string? stored, out bool needsUpgrade)
    {
        needsUpgrade = false;
        var parts = (stored ?? DummyHash).Split('$');
        if (parts.Length != 4 || parts[0] != Scheme || !int.TryParse(parts[1], out var iterations) || iterations < 100_000)
            return false;

        byte[] salt, expected;
        try { salt = Convert.FromBase64String(parts[2]); expected = Convert.FromBase64String(parts[3]); }
        catch (FormatException) { return false; }

        var actual = Derive(password, salt, iterations);
        var ok = stored is not null && CryptographicOperations.FixedTimeEquals(actual, expected);
        needsUpgrade = ok && iterations < Iterations;
        return ok;
    }

    /// <summary>Spends the same time as a real check (used when there is no account / no password).</summary>
    public static void VerifyNothing(string password) => Verify(password, null, out _);

    private static byte[] Derive(string password, byte[] salt, int iterations) =>
        Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, iterations, HashAlgorithmName.SHA512, HashBytes);
}

/// <summary>Password rules (NIST SP 800-63B): long enough, not the email, not a well-known password. No forced symbols.</summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MaxLength = 128;

    private static readonly HashSet<string> Common = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "password1", "password123", "passw0rd", "12345678", "123456789", "1234567890", "11111111",
        "00000000", "87654321", "qwertyui", "qwerty123", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "abc12345", "abcd1234",
        "iloveyou", "sunshine", "princess", "football", "baseball", "welcome1", "letmein1", "admin123", "monkey123",
        "dragon123", "trustno1", "selfiewithparent", "selfie123", "mother123", "father123", "india123", "iloveyoumom"
    };

    /// <summary>Null when the password is fine, otherwise a message for the visitor.</summary>
    public static string? Check(string password, string email)
    {
        if (password.Length < MinLength) return $"Use at least {MinLength} characters.";
        if (password.Length > MaxLength) return $"Use at most {MaxLength} characters.";
        if (string.IsNullOrWhiteSpace(password) || password.Distinct().Count() < 3) return "That password is too easy to guess.";
        if (Common.Contains(password)) return "That password is too common. Please choose another.";

        var local = email.Split('@')[0];
        if (password.Equals(email, StringComparison.OrdinalIgnoreCase)
            || (local.Length >= 4 && password.Contains(local, StringComparison.OrdinalIgnoreCase)))
            return "Don't use your email address in your password.";
        return null;
    }
}
