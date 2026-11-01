using System.Net.Mail;
using System.Text.RegularExpressions;

namespace SelfiewithParent.Api.Security;

/// <summary>Normalises and validates email addresses used for sign-in, and masks them for logs.</summary>
public static partial class EmailAddress
{
    /// <summary>Trimmed, lower-case, plain address (no display names like "Name &lt;a@b.c&gt;"), with a dotted domain.</summary>
    public static bool TryNormalize(string? input, out string email)
    {
        email = (input ?? "").Trim().ToLowerInvariant();
        if (email.Length is < 6 or > 254 || !SimpleShape().IsMatch(email)) return false;
        try
        {
            var parsed = new MailAddress(email);
            return parsed.Address == email && string.IsNullOrEmpty(parsed.DisplayName);
        }
        catch (FormatException)
        {
            return false;
        }
    }

    /// <summary>"k•••@gmail.com" — the only form that may appear in logs.</summary>
    public static string Mask(string email)
    {
        var at = email.IndexOf('@');
        return at <= 0 ? "•••" : $"{email[0]}•••{email[at..]}";
    }

    // local@domain.tld — no spaces, quotes or angle brackets
    [GeneratedRegex(@"^[a-z0-9._%+\-]{1,64}@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$")]
    private static partial Regex SimpleShape();
}
