using Google.Apis.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Options;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>Sign in with a one-time code sent to a mobile number or an email, with email and password, or with Google; refresh tokens; sign out.</summary>
[ApiController]
[Route("api/v1/auth")]
[Produces("application/json")]
public sealed class AuthController(
    OtpService otp, IOtpSender smsSender, IEmailCodeSender emailSender, TokenService tokens, UserRepository users,
    IOptions<GoogleAuthOptions> google, ILogger<AuthController> log) : ControllerBase
{
    /// <summary>Send a 6-digit sign-in code by SMS or WhatsApp.</summary>
    /// <remarks>The same response is returned whether or not the number has an account, so numbers can't be probed.</remarks>
    [HttpPost("otp/request")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.OtpRequest)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> RequestCode(OtpRequest request, CancellationToken ct)
    {
        if (!PhoneNumber.TryNormalize(request.CountryCode, request.MobileNumber, out var digits))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.MobileNumber)] = ["Enter a valid mobile number."] }));

        try
        {
            var (result, retryAfter) = await otp.SendAsync(OtpService.MobileIdentity(request.CountryCode, digits),
                (code, token) => smsSender.SendAsync(request.CountryCode, digits, code, request.Channel, token), ct);
            if (result != OtpSendResult.Sent)
            {
                Response.Headers.RetryAfter = retryAfter.ToString();
                log.LogWarning("Code request refused ({Reason}) for {Phone}", result, PhoneNumber.Mask(request.CountryCode, digits));
                return Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Please wait before asking for another code.");
            }
        }
        catch (InvalidOperationException ex)
        {
            log.LogError(ex, "Could not send a code to {Phone}", PhoneNumber.Mask(request.CountryCode, digits));
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "We couldn't send a code right now. Please try again later.");
        }

        log.LogInformation("Code sent to {Phone} via {Channel}", PhoneNumber.Mask(request.CountryCode, digits), request.Channel);
        return Accepted(new { message = "If the number is valid, a code is on its way." });
    }

    /// <summary>Check the code. Creates the account on first sign-in and returns tokens.</summary>
    [HttpPost("otp/verify")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.OtpVerify)]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> VerifyCode(OtpVerifyRequest request, CancellationToken ct)
    {
        if (!PhoneNumber.TryNormalize(request.CountryCode, request.MobileNumber, out var digits))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code didn't work. Please try again.");

        var masked = PhoneNumber.Mask(request.CountryCode, digits);
        switch (await otp.VerifyAsync(OtpService.MobileIdentity(request.CountryCode, digits), request.Code, ct))
        {
            case OtpVerifyResult.Invalid:
                log.LogWarning("Wrong code entered for {Phone}", masked);
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code didn't work. Please try again.");
            case OtpVerifyResult.ExpiredOrMissing:
                log.LogWarning("Expired or unknown code for {Phone}", masked);
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code has expired. Please ask for a new one.");
            case OtpVerifyResult.TooManyAttempts:
                log.LogWarning("Too many wrong codes for {Phone}; code cancelled", masked);
                return Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Too many wrong attempts. Please ask for a new code.");
        }

        var user = await users.FindOrCreateByMobileAsync(request.CountryCode, digits, ct);
        if (user.Status != "Active")
        {
            log.LogWarning("Sign-in refused for {Phone}: account {Status}", masked, user.Status);
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "This account can't sign in. Please contact support.");
        }

        log.LogInformation("Signed in with mobile: user {PublicId}", user.PublicId);
        return Ok(await tokens.IssueAsync(user, family: null, ct));
    }

    /// <summary>Send a 6-digit sign-in code by email.</summary>
    /// <remarks>The same response is returned whether or not the email has an account, so addresses can't be probed.</remarks>
    [HttpPost("email/request")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.OtpRequest)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> RequestEmailCode(EmailOtpRequest request, CancellationToken ct)
    {
        if (!EmailAddress.TryNormalize(request.Email, out var email))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.Email)] = ["Enter a valid email address."] }));

        try
        {
            var (result, retryAfter) = await otp.SendAsync(OtpService.EmailIdentity(email),
                (code, token) => emailSender.SendAsync(email, code, token), ct);
            if (result != OtpSendResult.Sent)
            {
                Response.Headers.RetryAfter = retryAfter.ToString();
                log.LogWarning("Code request refused ({Reason}) for {Email}", result, EmailAddress.Mask(email));
                return Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Please wait before asking for another code.");
            }
        }
        catch (InvalidOperationException ex)
        {
            log.LogError(ex, "Could not send a code to {Email}", EmailAddress.Mask(email));
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "We couldn't send a code right now. Please try again later.");
        }

        log.LogInformation("Code sent to {Email} via email", EmailAddress.Mask(email));
        return Accepted(new { message = "If the email is valid, a code is on its way." });
    }

    /// <summary>Check the emailed code. Creates the account on first sign-in and returns tokens.</summary>
    [HttpPost("email/verify")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.OtpVerify)]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> VerifyEmailCode(EmailOtpVerifyRequest request, CancellationToken ct)
    {
        if (!EmailAddress.TryNormalize(request.Email, out var email))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code didn't work. Please try again.");

        var masked = EmailAddress.Mask(email);
        switch (await otp.VerifyAsync(OtpService.EmailIdentity(email), request.Code, ct))
        {
            case OtpVerifyResult.Invalid:
                log.LogWarning("Wrong code entered for {Email}", masked);
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code didn't work. Please try again.");
            case OtpVerifyResult.ExpiredOrMissing:
                log.LogWarning("Expired or unknown code for {Email}", masked);
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code has expired. Please ask for a new one.");
            case OtpVerifyResult.TooManyAttempts:
                log.LogWarning("Too many wrong codes for {Email}; code cancelled", masked);
                return Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Too many wrong attempts. Please ask for a new code.");
        }

        var user = await users.FindOrCreateByEmailAsync(email, ct);
        if (user.Status != "Active")
        {
            log.LogWarning("Sign-in refused for {Email}: account {Status}", masked, user.Status);
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "This account can't sign in. Please contact support.");
        }

        log.LogInformation("Signed in with email: user {PublicId}", user.PublicId);
        return Ok(await tokens.IssueAsync(user, family: null, ct));
    }

    /// <summary>Sign in with email and password (for email accounts that have added a password).</summary>
    /// <remarks>
    /// One answer for every failure (no account, no password, wrong password, paused), so emails can't be probed.
    /// 5 wrong passwords in a row pause password sign-in for 15 minutes; the emailed code keeps working.
    /// </remarks>
    [HttpPost("email/password")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Password)]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> SignInWithPassword(EmailPasswordSignInRequest request, CancellationToken ct)
    {
        const string failed = "Email or password is incorrect. You can also sign in with a code.";
        if (!EmailAddress.TryNormalize(request.Email, out var email))
        {
            PasswordHasher.VerifyNothing(request.Password);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: failed);
        }

        var masked = EmailAddress.Mask(email);
        var account = await users.FindForPasswordSignInAsync(email, ct);
        if (account is null)
        {
            PasswordHasher.VerifyNothing(request.Password);   // same time as a real check
            log.LogWarning("Password sign-in failed for {Email}: no account with a password", masked);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: failed);
        }

        if (account.Locked)
        {
            PasswordHasher.VerifyNothing(request.Password);
            log.LogWarning("Password sign-in refused for user {PublicId}: paused after too many wrong passwords", account.User.PublicId);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: failed);
        }

        if (!PasswordHasher.Verify(request.Password, account.PasswordHash, out var needsUpgrade))
        {
            var nowLocked = await users.RecordPasswordFailureAsync(account.User.UserId, ct);
            log.LogWarning("Wrong password for user {PublicId}{Locked}", account.User.PublicId, nowLocked ? "; password sign-in paused" : "");
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: failed);
        }

        if (account.User.Status != "Active")
        {
            log.LogWarning("Sign-in refused for user {PublicId}: account {Status}", account.User.PublicId, account.User.Status);
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "This account can't sign in. Please contact support.");
        }

        await users.RecordPasswordSuccessAsync(account.User.UserId, needsUpgrade ? PasswordHasher.Hash(request.Password) : null, ct);
        log.LogInformation("Signed in with email and password: user {PublicId}", account.User.PublicId);
        return Ok(await tokens.IssueAsync(account.User, family: null, ct));
    }

    /// <summary>Sign in with a Google ID token.</summary>
    [HttpPost("google")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Google(GoogleSignInRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(google.Value.ClientId))
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Google sign-in isn't available yet.");

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(request.IdToken,
                new GoogleJsonWebSignature.ValidationSettings { Audience = [google.Value.ClientId] });
        }
        catch (InvalidJwtException ex)
        {
            log.LogWarning("Rejected Google token: {Reason}", ex.Message);
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Google sign-in failed. Please try again.");
        }

        var name = payload.Name is { Length: > 0 } n ? n[..Math.Min(n.Length, 60)] : null;
        var user = await users.FindOrCreateByGoogleAsync(payload.Subject, payload.EmailVerified ? payload.Email : null, name, ct);
        if (user.Status != "Active")
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "This account can't sign in. Please contact support.");

        log.LogInformation("Signed in with Google: user {PublicId}", user.PublicId);
        return Ok(await tokens.IssueAsync(user, family: null, ct));
    }

    /// <summary>Swap a refresh token for new tokens. Each refresh token works once.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(typeof(TokenResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Refresh(RefreshRequest request, CancellationToken ct)
    {
        var redeemed = await tokens.RedeemRefreshTokenAsync(request.RefreshToken, ct);
        if (redeemed is null)
        {
            log.LogWarning("Refresh token rejected (invalid, expired, reused or revoked)");
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Please sign in again.");
        }

        var user = await users.GetForTokenRefreshAsync(redeemed.Value.UserId, ct);
        if (user is null || user.Status != "Active")
            return Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Please sign in again.");

        return Ok(await tokens.IssueAsync(user, redeemed.Value.Family, ct));
    }

    /// <summary>Sign out: the refresh token and the current access token stop working.</summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout([FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] LogoutRequest? request, CancellationToken ct)
    {
        var exp = long.TryParse(User.FindFirst(JwtRegisteredClaimNames.Exp)?.Value, out var e) ? DateTimeOffset.FromUnixTimeSeconds(e) : (DateTimeOffset?)null;
        await tokens.RevokeAsync(request?.RefreshToken, User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value, exp, ct);
        log.LogInformation("Signed out: user {PublicId}", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return NoContent();
    }
}
