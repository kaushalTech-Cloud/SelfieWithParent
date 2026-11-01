using System.ComponentModel.DataAnnotations;

namespace SelfiewithParent.Api.Models;

// ---------- Sign-in ----------

/// <summary>Ask for a 6-digit code by SMS or WhatsApp.</summary>
public sealed record OtpRequest
{
    /// <example>+91</example>
    [Required, RegularExpression(@"^\+[1-9]\d{0,3}$", ErrorMessage = "Country code must look like +91.")]
    public string CountryCode { get; init; } = "";

    /// <example>9876543210</example>
    [Required, RegularExpression(@"^[0-9 ]{6,18}$", ErrorMessage = "Mobile number must be 6–15 digits.")]
    public string MobileNumber { get; init; } = "";

    /// <example>sms</example>
    [Required, RegularExpression("^(sms|whatsapp)$", ErrorMessage = "Channel must be 'sms' or 'whatsapp'.")]
    public string Channel { get; init; } = "sms";
}

/// <summary>Check the code the visitor typed in.</summary>
public sealed record OtpVerifyRequest
{
    /// <example>+91</example>
    [Required, RegularExpression(@"^\+[1-9]\d{0,3}$")]
    public string CountryCode { get; init; } = "";

    /// <example>9876543210</example>
    [Required, RegularExpression(@"^[0-9 ]{6,18}$")]
    public string MobileNumber { get; init; } = "";

    /// <example>482913</example>
    [Required, RegularExpression(@"^\d{6}$", ErrorMessage = "Code must be 6 digits.")]
    public string Code { get; init; } = "";
}

/// <summary>Ask for a 6-digit code by email.</summary>
public sealed record EmailOtpRequest
{
    /// <example>visitor@example.com</example>
    [Required, StringLength(254, MinimumLength = 6)]
    public string Email { get; init; } = "";
}

/// <summary>Check the code sent by email.</summary>
public sealed record EmailOtpVerifyRequest
{
    /// <example>visitor@example.com</example>
    [Required, StringLength(254, MinimumLength = 6)]
    public string Email { get; init; } = "";

    /// <example>482913</example>
    [Required, RegularExpression(@"^\d{6}$", ErrorMessage = "Code must be 6 digits.")]
    public string Code { get; init; } = "";
}

/// <summary>Sign in with email and password (only for email accounts that have added a password).</summary>
public sealed record EmailPasswordSignInRequest
{
    /// <example>visitor@example.com</example>
    [Required, StringLength(254, MinimumLength = 6)]
    public string Email { get; init; } = "";

    [Required, StringLength(128, MinimumLength = 1)]
    public string Password { get; init; } = "";
}

/// <summary>Google sign-in: the ID token returned by Google's sign-in button.</summary>
public sealed record GoogleSignInRequest
{
    [Required, MinLength(100), MaxLength(4096)]
    public string IdToken { get; init; } = "";
}

public sealed record RefreshRequest
{
    [Required, MinLength(40), MaxLength(100)]
    public string RefreshToken { get; init; } = "";
}

/// <summary>Sign out. Include the refresh token so it stops working too (optional).</summary>
public sealed record LogoutRequest
{
    [MaxLength(100)]
    public string? RefreshToken { get; init; }
}

/// <summary>Tokens returned after a successful sign-in or refresh.</summary>
public sealed record TokenResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    bool ProfileComplete,
    string TokenType = "Bearer");

// ---------- My account ----------

public sealed record ProfileResponse(
    Guid PublicId,
    string SignUpMethod,
    string? MobileMasked,
    string? Email,
    string? FullName,
    string? CountryCode,
    string? StateName,
    string? City,
    string PreferredLanguage,
    bool IsAdultConfirmed,
    bool WhatsAppOptIn,
    bool ProfileComplete,
    IReadOnlyList<string> Roles,
    DateTime CreatedAtUtc,
    bool HasPassword,
    Guid? PhotoId = null);   // the profile photo (GET /api/v1/me/photo); a new id with every new photo

/// <summary>Add a password (email accounts), or change it — changing needs the current password.</summary>
public sealed record SetPasswordRequest
{
    [Required, StringLength(128, MinimumLength = 8, ErrorMessage = "Use 8 to 128 characters.")]
    public string NewPassword { get; init; } = "";

    /// <summary>Required only when the account already has a password.</summary>
    [StringLength(128)]
    public string? CurrentPassword { get; init; }
}

/// <summary>Complete or update the profile.</summary>
public sealed record UpdateProfileRequest
{
    /// <example>Kaushal Singh</example>
    [Required, StringLength(60, MinimumLength = 2)]
    [RegularExpression(@"^[\p{L}\p{M} .'\-]+$", ErrorMessage = "Name can contain letters, spaces, dots, apostrophes and hyphens only.")]
    public string FullName { get; init; } = "";

    /// <example>visitor@example.com</example>
    [EmailAddress, StringLength(254)]
    public string? Email { get; init; }

    /// <example>IN</example>
    [Required, RegularExpression("^[A-Z]{2}$", ErrorMessage = "Country must be a 2-letter code such as IN.")]
    public string CountryCode { get; init; } = "";

    /// <example>Haryana</example>
    [StringLength(60), RegularExpression(@"^[\p{L}\p{M} .'\-&()]*$")]
    public string? StateName { get; init; }

    /// <example>Jind</example>
    [StringLength(60), RegularExpression(@"^[\p{L}\p{M} .'\-()]*$")]
    public string? City { get; init; }

    /// <example>en</example>
    [Required, RegularExpression("^(en|hi|bn|ar|es|fr)$")]
    public string PreferredLanguage { get; init; } = "en";

    /// <summary>Must be true: accounts are for adults only.</summary>
    [Required]
    public bool IsAdultConfirmed { get; init; }

    public bool WhatsAppOptIn { get; init; }
}

// ---------- Admin ----------

public sealed record RoleResponse(short RoleId, string RoleCode, string Name, string? Description);

public sealed record UserRolesResponse(Guid PublicId, IReadOnlyList<string> Roles);

/// <summary>A staff member, for the super admin's Staff page.</summary>
public sealed record StaffMemberResponse(Guid PublicId, string? Email, string? MobileMasked, string? FullName,
    IReadOnlyList<string> Roles, DateTime CreatedAtUtc, DateTime? LastSignInAtUtc, bool IsActive);

/// <summary>Edit a staff member. Super admins only; not themselves and not other super admins.</summary>
public sealed record UpdateStaffRequest
{
    /// <example>moderator@example.com</example>
    [Required, StringLength(254, MinimumLength = 6)]
    public string Email { get; init; } = "";

    /// <example>Priya Sharma</example>
    [Required, StringLength(60, MinimumLength = 2)]
    [RegularExpression(@"^[\p{L}\p{M} .'\-]+$", ErrorMessage = "Name can contain letters, spaces, dots, apostrophes and hyphens only.")]
    public string FullName { get; init; } = "";

    /// <summary>Admin, Moderator, Support or PrivacyOfficer.</summary>
    [Required, RegularExpression("^(Admin|Moderator|Support|PrivacyOfficer)$", ErrorMessage = "Choose Admin, Moderator, Support or Privacy officer.")]
    public string RoleCode { get; init; } = "";

    /// <summary>Optional new password (8–128 characters). Leave empty to keep the current one.</summary>
    [StringLength(128)]
    public string? NewPassword { get; init; }
}

/// <summary>A visitor, for the super admin's Visitors page.</summary>
public sealed record VisitorResponse(Guid PublicId, string? FullName, string? Email, string? MobileMasked, string SignUpMethod,
    string? CountryCode, DateTime CreatedAtUtc, DateTime? LastSignInAtUtc, bool IsActive,
    string? LastReason, DateTime? LastStatusChangeAtUtc);

/// <summary>One page of visitors.</summary>
public sealed record VisitorPageResponse(IReadOnlyList<VisitorResponse> Items, int Total, int Page, int PageSize);

/// <summary>Make a visitor active or inactive. The reason is kept and emailed to the visitor.</summary>
public sealed record SetVisitorStatusRequest
{
    [Required]
    public bool? IsActive { get; init; }

    /// <example>Shared photos of other people without their consent.</example>
    [Required, StringLength(500, MinimumLength = 10, ErrorMessage = "Give a reason of 10 to 500 characters.")]
    public string Reason { get; init; } = "";
}

/// <summary>Result of a visitor status change. Email: Sent, WrittenToConsole, NoEmailOnFile, NotConfigured or Failed.</summary>
public sealed record SetVisitorStatusResponse(bool IsActive, string Email);

/// <summary>Make a staff member active (can sign in) or inactive (every sign-in refused).</summary>
public sealed record SetStaffActiveRequest
{
    [Required]
    public bool? IsActive { get; init; }
}

/// <summary>Create a staff account (or give the role to the existing account with this email). Super admins only.</summary>
public sealed record CreateStaffRequest
{
    /// <example>moderator@example.com</example>
    [Required, StringLength(254, MinimumLength = 6)]
    public string Email { get; init; } = "";

    /// <example>Priya Sharma</example>
    [Required, StringLength(60, MinimumLength = 2)]
    [RegularExpression(@"^[\p{L}\p{M} .'\-]+$", ErrorMessage = "Name can contain letters, spaces, dots, apostrophes and hyphens only.")]
    public string FullName { get; init; } = "";

    /// <summary>Admin, Moderator, Support or PrivacyOfficer.</summary>
    /// <example>Moderator</example>
    [Required, RegularExpression("^(Admin|Moderator|Support|PrivacyOfficer)$", ErrorMessage = "Choose Admin, Moderator, Support or Privacy officer.")]
    public string RoleCode { get; init; } = "";

    /// <summary>Optional first password (8–128 characters). Without one they sign in with a code sent to the email.</summary>
    [StringLength(128)]
    public string? Password { get; init; }
}

/// <summary>Created = new account; RoleAdded = existing account got the role; AlreadyHadRole = nothing changed.</summary>
public sealed record CreateStaffResponse(Guid PublicId, string Outcome);
