namespace SelfiewithParent.Api.Security;

/// <summary>Normalises and validates mobile numbers, and masks them for logs.</summary>
public static class PhoneNumber
{
    /// <summary>Digits only; Indian (+91) numbers must be 10 digits starting 6–9.</summary>
    public static bool TryNormalize(string countryCode, string number, out string digits)
    {
        digits = new string(number.Where(char.IsAsciiDigit).ToArray());
        if (countryCode == "+91")
            return digits.Length == 10 && digits[0] is >= '6' and <= '9';
        return digits.Length is >= 6 and <= 15;
    }

    /// <summary>"+91 ••••••3210" — the only form that may appear in logs.</summary>
    public static string Mask(string countryCode, string digits) =>
        digits.Length <= 4 ? $"{countryCode} ••••" : $"{countryCode} ••••••{digits[^4..]}";
}
