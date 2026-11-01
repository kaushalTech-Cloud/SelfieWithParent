using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>The signed-in visitor's own account. The database only ever returns or changes their own row.</summary>
[ApiController]
[Route("api/v1/me")]
[Authorize]
[Produces("application/json")]
public sealed class MeController(
    UserRepository users, TokenService tokens, OtpService otp, IOtpSender smsSender, ILogger<MeController> log) : ControllerBase
{
    /// <summary>Codes for adding / changing a number are kept apart from sign-in codes, per account.</summary>
    private static string MobileChangeIdentity(long userId, string countryCode, string digits) =>
        $"mobile-change|{userId}|{OtpService.MobileIdentity(countryCode, digits)}";

    /// <summary>Add or change my mobile number, step 1: send a 6-digit code to the new number by SMS or WhatsApp.</summary>
    [HttpPost("mobile/request")]
    [EnableRateLimiting(RateLimits.OtpRequest)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> RequestMobileCode(OtpRequest request, CancellationToken ct)
    {
        if (!PhoneNumber.TryNormalize(request.CountryCode, request.MobileNumber, out var digits))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.MobileNumber)] = ["Enter a valid mobile number."] }));

        var userId = User.GetUserId();
        var publicId = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var masked = PhoneNumber.Mask(request.CountryCode, digits);
        try
        {
            var (result, retryAfter) = await otp.SendAsync(MobileChangeIdentity(userId, request.CountryCode, digits),
                (code, token) => smsSender.SendAsync(request.CountryCode, digits, code, request.Channel, token), ct);
            if (result != OtpSendResult.Sent)
            {
                Response.Headers.RetryAfter = retryAfter.ToString();
                log.LogWarning("Mobile code refused ({Reason}) for user {PublicId}, number {Phone}", result, publicId, masked);
                return Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Please wait before asking for another code.");
            }
        }
        catch (InvalidOperationException ex)
        {
            log.LogError(ex, "Could not send a mobile code for user {PublicId} to {Phone}", publicId, masked);
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "We couldn't send a code right now. Please try again later.");
        }

        log.LogInformation("Mobile code sent for user {PublicId} to {Phone} via {Channel}", publicId, masked, request.Channel);
        return Accepted(new { message = "A code is on its way." });
    }

    /// <summary>Add or change my mobile number, step 2: check the code and save the number.</summary>
    /// <remarks>A number already used by another account is refused. The number can then be used to sign in.</remarks>
    [HttpPost("mobile/verify")]
    [EnableRateLimiting(RateLimits.OtpVerify)]
    [ProducesResponseType(typeof(ProfileResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> VerifyMobileCode(OtpVerifyRequest request, CancellationToken ct)
    {
        if (!PhoneNumber.TryNormalize(request.CountryCode, request.MobileNumber, out var digits))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code didn't work. Please try again.");

        var userId = User.GetUserId();
        var publicId = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var masked = PhoneNumber.Mask(request.CountryCode, digits);
        switch (await otp.VerifyAsync(MobileChangeIdentity(userId, request.CountryCode, digits), request.Code, ct))
        {
            case OtpVerifyResult.Invalid:
                log.LogWarning("Wrong mobile code for user {PublicId}, number {Phone}", publicId, masked);
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code didn't work. Please try again.");
            case OtpVerifyResult.ExpiredOrMissing:
                log.LogWarning("Expired or unknown mobile code for user {PublicId}, number {Phone}", publicId, masked);
                return Problem(statusCode: StatusCodes.Status400BadRequest, title: "That code has expired. Please ask for a new one.");
            case OtpVerifyResult.TooManyAttempts:
                log.LogWarning("Too many wrong mobile codes for user {PublicId}, number {Phone}; code cancelled", publicId, masked);
                return Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Too many wrong attempts. Please ask for a new code.");
        }

        switch (await users.SetMobileAsync(userId, request.CountryCode, digits, ct))
        {
            case UserRepository.SetMobileResult.NotFound:
                return Problem(statusCode: StatusCodes.Status404NotFound, title: "Account not found.");
            case UserRepository.SetMobileResult.TakenByAnotherAccount:
                log.LogWarning("Mobile number {Phone} refused for user {PublicId}: used by another account", masked, publicId);
                return Problem(statusCode: StatusCodes.Status409Conflict, title: "This number is already linked to another account.");
        }

        log.LogInformation("Mobile number saved for user {PublicId}: {Phone}", publicId, masked);
        return Ok(await users.GetProfileAsync(userId, ct));
    }

    /// <summary>My profile and roles.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ProfileResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var profile = await users.GetProfileAsync(User.GetUserId(), ct);
        return profile is null ? Problem(statusCode: StatusCodes.Status404NotFound, title: "Account not found.") : Ok(profile);
    }

    /// <summary>Complete (first time) or update my profile.</summary>
    /// <remarks>After the first completion, refresh the tokens so the access token reflects the completed profile.</remarks>
    [HttpPut("profile")]
    [ProducesResponseType(typeof(ProfileResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UpdateProfile(UpdateProfileRequest request, CancellationToken ct)
    {
        if (!request.IsAdultConfirmed)
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.IsAdultConfirmed)] = ["Accounts are for adults (18+). A parent or guardian can share for children."] }));

        var userId = User.GetUserId();
        if (!await users.UpdateProfileAsync(userId, request, ct))
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "Account not found.");

        log.LogInformation("Profile updated: user {PublicId}", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return Ok(await users.GetProfileAsync(userId, ct));
    }

    /// <summary>Add a password (email accounts), or change it.</summary>
    /// <remarks>
    /// Only accounts that sign in with email. Adding the first password needs only the signed-in session (the visitor
    /// has just proved the email with a code); changing it also needs the current password. The emailed code keeps working.
    /// </remarks>
    [HttpPut("password")]
    [EnableRateLimiting(RateLimits.Password)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SetPassword(SetPasswordRequest request, CancellationToken ct)
    {
        var userId = User.GetUserId();
        var publicId = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var state = await users.GetPasswordStateAsync(userId, ct);
        if (state is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Account not found.");

        if (state.SignUpMethod != "Email" || state.Email is null)
        {
            log.LogWarning("Password refused for user {PublicId}: account signs in with {Method}", publicId, state.SignUpMethod);
            return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Passwords are only for accounts that sign in with email.");
        }

        if (state.PasswordHash is not null)
        {
            if (string.IsNullOrEmpty(request.CurrentPassword) || !PasswordHasher.Verify(request.CurrentPassword, state.PasswordHash, out _))
            {
                log.LogWarning("Password change refused for user {PublicId}: current password wrong", publicId);
                return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                    { [nameof(request.CurrentPassword)] = ["Your current password isn't right."] }));
            }
        }

        if (PasswordPolicy.Check(request.NewPassword, state.Email) is { } problem)
        {
            log.LogWarning("Password refused for user {PublicId}: doesn't meet the rules", publicId);
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.NewPassword)] = [problem] }));
        }

        await users.SetPasswordAsync(userId, PasswordHasher.Hash(request.NewPassword), ct);
        log.LogInformation("Password {Action}: user {PublicId}", state.PasswordHash is null ? "added" : "changed", publicId);
        return NoContent();
    }

    /// <summary>Download everything we hold about me (JSON file).</summary>
    [HttpGet("export")]
    [Produces("application/json")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Export(CancellationToken ct)
    {
        var data = await users.ExportAsync(User.GetUserId(), ct);
        if (data is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Account not found.");
        log.LogInformation("Data export downloaded: user {PublicId}", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(data, new JsonSerializerOptions { WriteIndented = true });
        return File(bytes, "application/json", "my-selfie-with-parent-data.json");
    }

    // ---------- Profile photo (stored in the database) ----------

    /// <summary>My profile photo (404 when I haven't added one).</summary>
    [HttpGet("photo")]
    [Produces("image/png", "image/jpeg", "image/webp")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Photo(CancellationToken ct)
    {
        var photo = await users.GetPhotoAsync(User.GetUserId(), ct);
        return photo is null ? NotFound() : File(photo.Data, photo.ContentType);
    }

    /// <summary>Add or replace my profile photo: a PNG, JPEG or WebP up to 10 MB (multipart field "file").</summary>
    [HttpPut("photo")]
    [EnableRateLimiting(RateLimits.Upload)]
    [RequestSizeLimit(FileTypes.MaxPhotoBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = FileTypes.MaxPhotoBytes + 64 * 1024)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(ProfilePhotoResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SetPhoto(IFormFile file, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        byte[]? data = file.Length is > 0 and <= FileTypes.MaxPhotoBytes ? await FileTypes.ReadAsync(file, ct) : null;
        var type = data is null ? null : FileTypes.Image(data);
        if (type is null)
        {
            log.LogWarning("Profile photo refused for {Actor}: not a JPG / PNG / WebP up to 10 MB", actor);
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(file)] = ["Choose a JPG, PNG or WebP photo up to 10 MB."] }));
        }
        var photoId = await users.SetPhotoAsync(User.GetUserId(), type, data!, ct);
        log.LogInformation("Profile photo saved for {Actor} ({ContentType}, {Size} bytes)", actor, type, data!.Length);
        return Ok(new ProfilePhotoResponse(photoId));
    }

    /// <summary>Remove my profile photo.</summary>
    [HttpDelete("photo")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RemovePhoto(CancellationToken ct)
    {
        await users.RemovePhotoAsync(User.GetUserId(), ct);
        log.LogInformation("Profile photo removed for {Actor}", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return NoContent();
    }

    /// <summary>Delete my account. Personal data, my profile photo and everything I shared are removed, and every session is signed out.</summary>
    [HttpDelete]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (!await users.DeleteAccountAsync(userId, ct))
            return Problem(statusCode: StatusCodes.Status404NotFound, title: "Account not found.");

        await tokens.RevokeAllForUserAsync(userId, ct);
        log.LogInformation("Account deleted: user {PublicId}", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return NoContent();
    }
}
