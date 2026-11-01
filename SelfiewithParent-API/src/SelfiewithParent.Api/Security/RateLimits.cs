namespace SelfiewithParent.Api.Security;

/// <summary>Rate-limit policy names (limits are set in Program.cs).</summary>
public static class RateLimits
{
    public const string OtpRequest = "otp-request";   // asking for a code
    public const string OtpVerify = "otp-verify";     // typing a code
    public const string Auth = "auth";                 // Google sign-in, token refresh
    public const string Password = "password";         // signing in with a password, adding / changing one
    public const string PublicContent = "public-content"; // menus, content pages, images: read by every page view
    public const string Upload = "upload";              // sharing a selfie / video, changing a profile photo
}
