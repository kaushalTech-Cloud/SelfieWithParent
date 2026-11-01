using System.Security.Claims;

namespace SelfiewithParent.Api.Security;

/// <summary>Role codes (match auth.Role.RoleCode) and authorisation policy names.</summary>
public static class AppRoles
{
    public const string SuperAdmin = "SuperAdmin";
    public const string Admin = "Admin";
    public const string Moderator = "Moderator";
    public const string Support = "Support";
    public const string PrivacyOfficer = "PrivacyOfficer";
    public const string Visitor = "Visitor";

    public static readonly string[] Staff = [SuperAdmin, Admin, Moderator, Support, PrivacyOfficer];

    /// <summary>Who can edit content pages, public menus and images (the database checks this again).</summary>
    public static readonly string[] ContentEditors = [SuperAdmin, Admin];

    /// <summary>Who can review visitors' selfies and videos (the database checks this again).</summary>
    public static readonly string[] Reviewers = [SuperAdmin, Admin, Moderator];
}

public static class Policies
{
    public const string Staff = "Staff";
    public const string SuperAdmin = "SuperAdmin";
    public const string ContentEditor = "ContentEditor";
    public const string Reviewer = "Reviewer";
}

/// <summary>Claim names used in access tokens.</summary>
public static class AppClaims
{
    public const string UserId = "uid";          // internal id, needed for the database session context
    public const string ProfileComplete = "pc";
}

public static class ClaimsPrincipalExtensions
{
    /// <summary>The signed-in user's internal id. Only callable on authenticated requests.</summary>
    public static long GetUserId(this ClaimsPrincipal user) =>
        long.TryParse(user.FindFirstValue(AppClaims.UserId), out var id)
            ? id
            : throw new UnauthorizedAccessException("Access token has no user id.");
}
