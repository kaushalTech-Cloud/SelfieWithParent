using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// Staff-only endpoints. Roles can only be given through one database procedure (auth.usp_CreateStaffUser), which
/// checks in the database that the caller is an active super admin and never hands out SuperAdmin.
/// The website's database login can't write roles any other way, so a compromised API alone can't create admins.
/// </summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize(Policy = Policies.Staff)]
[Produces("application/json")]
public sealed class AdminController(UserRepository users, TokenService tokens, AccountNoticeSender notices, ILogger<AdminController> log) : ControllerBase
{
    /// <summary>All active roles. Staff only.</summary>
    [HttpGet("roles")]
    [ProducesResponseType(typeof(IReadOnlyList<RoleResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Roles(CancellationToken ct) => Ok(await users.ListRolesAsync(ct));

    /// <summary>A user's current roles. Super admins only.</summary>
    [HttpGet("users/{publicId:guid}/roles")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(typeof(UserRolesResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UserRoles(Guid publicId, CancellationToken ct)
    {
        var result = await users.GetUserRolesAsync(publicId, ct);
        return result is null ? Problem(statusCode: StatusCodes.Status404NotFound, title: "User not found.") : Ok(result);
    }

    /// <summary>Everyone with a staff role. Super admins only.</summary>
    [HttpGet("staff")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(typeof(IReadOnlyList<StaffMemberResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Staff(CancellationToken ct) => Ok(await users.ListStaffAsync(ct));

    /// <summary>Create an Admin, Moderator, Support or Privacy officer account. Super admins only.</summary>
    /// <remarks>
    /// If an account with this (verified) email already exists, it gets the role; its own password and name are kept.
    /// The password is optional: without one, the person signs in with a code sent to the email.
    /// </remarks>
    [HttpPost("staff")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [EnableRateLimiting(RateLimits.Password)]
    [ProducesResponseType(typeof(CreateStaffResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(CreateStaffResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> CreateStaff(CreateStaffRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (!EmailAddress.TryNormalize(request.Email, out var email))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.Email)] = ["Enter a valid email address."] }));

        string? hash = null;
        if (!string.IsNullOrEmpty(request.Password))
        {
            if (PasswordPolicy.Check(request.Password, email) is { } problem)
            {
                log.LogWarning("Staff account refused by super admin {Actor}: password doesn't meet the rules", actor);
                return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                    { [nameof(request.Password)] = [problem] }));
            }
            hash = PasswordHasher.Hash(request.Password);
        }

        var (result, error) = await users.CreateStaffAsync(User.GetUserId(), email, request.FullName.Trim(), hash, request.RoleCode, ct);
        switch (error)
        {
            case UserRepository.CreateStaffError.NotSuperAdmin:
                log.LogWarning("Staff account refused for {Actor}: the database says they aren't an active super admin", actor);
                return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only a super admin can create staff accounts.");
            case UserRepository.CreateStaffError.RoleNotAllowed:
                log.LogWarning("Staff account refused for {Actor}: role {Role} can't be given", actor, request.RoleCode);
                return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                    { [nameof(request.RoleCode)] = ["That role can't be given here."] }));
            case UserRepository.CreateStaffError.BadEmail:
                return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                    { [nameof(request.Email)] = ["Enter a valid email address."] }));
        }

        log.LogInformation("Staff {Outcome} by super admin {Actor}: user {PublicId} as {Role}",
            result!.Outcome, actor, result.PublicId, request.RoleCode);
        return result.Outcome == "Created" ? StatusCode(StatusCodes.Status201Created, result) : Ok(result);
    }

    /// <summary>Edit a staff member: name, sign-in email, role and (optionally) a new password. Super admins only.</summary>
    /// <remarks>Not yourself and not other super admins. If the role changes, the person is signed out so it applies at once.</remarks>
    [HttpPut("staff/{publicId:guid}")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [EnableRateLimiting(RateLimits.Password)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateStaff(Guid publicId, UpdateStaffRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (!EmailAddress.TryNormalize(request.Email, out var email))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.Email)] = ["Enter a valid email address."] }));

        string? hash = null;
        if (!string.IsNullOrEmpty(request.NewPassword))
        {
            if (PasswordPolicy.Check(request.NewPassword, email) is { } problem)
            {
                log.LogWarning("Staff edit refused for {Actor}: new password doesn't meet the rules", actor);
                return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                    { [nameof(request.NewPassword)] = [problem] }));
            }
            hash = PasswordHasher.Hash(request.NewPassword);
        }

        var (userId, roleChanged, error) = await users.UpdateStaffAsync(User.GetUserId(), publicId, email, request.FullName.Trim(), request.RoleCode, hash, ct);
        if (error != UserRepository.StaffError.None) return StaffProblem(error, actor, publicId, "edit");

        if (roleChanged) await tokens.RevokeAllForUserAsync(userId!.Value, ct);   // new role applies at once
        log.LogInformation("Staff {PublicId} edited by super admin {Actor} (role {Role}{Changed}{Password})", publicId, actor,
            request.RoleCode, roleChanged ? ", changed — signed out" : "", hash is null ? "" : ", new password");
        return NoContent();
    }

    /// <summary>Make a staff member active or inactive. Super admins only.</summary>
    /// <remarks>Inactive staff can't sign in at all (and are signed out at once) until made active again. Nothing is deleted.</remarks>
    [HttpPut("staff/{publicId:guid}/status")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetStaffStatus(Guid publicId, SetStaffActiveRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var isActive = request.IsActive!.Value;
        var (userId, error) = await users.SetStaffActiveAsync(User.GetUserId(), publicId, isActive, ct);
        if (error != UserRepository.StaffError.None) return StaffProblem(error, actor, publicId, "status change");

        if (!isActive) await tokens.RevokeAllForUserAsync(userId!.Value, ct);   // signed out everywhere, straight away
        log.LogInformation("Staff {PublicId} made {Status} by super admin {Actor}", publicId, isActive ? "active" : "inactive", actor);
        return NoContent();
    }

    // ---------- Visitors ----------

    /// <summary>Visitors (accounts without a staff role), newest first. Super admins only.</summary>
    /// <param name="search">Name, email, or the last digits of a mobile number (optional).</param>
    /// <param name="status">active, inactive or empty for both.</param>
    /// <param name="page">From 1.</param>
    /// <param name="pageSize">10 to 100 (default 25).</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet("visitors")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(typeof(VisitorPageResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Visitors([FromQuery] string? search, [FromQuery] string? status,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        if (search is { Length: > 100 }) search = search[..100];
        bool? isActive = status?.ToLowerInvariant() switch { "active" => true, "inactive" => false, _ => null };
        var result = await users.ListVisitorsAsync(search, isActive, Math.Max(1, page), Math.Clamp(pageSize, 10, 100), ct);
        log.LogInformation("Visitor list viewed by super admin {Actor} (page {Page}, {Count} of {Total}{Search})",
            User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value, result.Page, result.Items.Count, result.Total, search is null ? "" : ", searched");
        return Ok(result);
    }

    /// <summary>Make a visitor active or inactive, with a reason that is kept and emailed to them. Super admins only.</summary>
    /// <remarks>
    /// Inactive visitors are signed out at once and can't sign in until made active again; nothing is deleted.
    /// The email is best-effort: the status change stands even if it can't be sent (the response says what happened).
    /// </remarks>
    [HttpPut("visitors/{publicId:guid}/status")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(typeof(SetVisitorStatusResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetVisitorStatus(Guid publicId, SetVisitorStatusRequest request, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var isActive = request.IsActive!.Value;
        var reason = request.Reason.Trim();
        if (reason.Length < 10)
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                { [nameof(request.Reason)] = ["Give a reason of 10 to 500 characters."] }));

        var (contact, error) = await users.SetVisitorActiveAsync(User.GetUserId(), publicId, isActive, reason, ct);
        switch (error)
        {
            case UserRepository.StaffError.None:
                break;
            case UserRepository.StaffError.NotFound:
                log.LogWarning("Visitor status change by {Actor}: {PublicId} not found or is staff", actor, publicId);
                return Problem(statusCode: StatusCodes.Status404NotFound, title: "That visitor wasn't found.");
            case UserRepository.StaffError.NoChange:
                return Problem(statusCode: StatusCodes.Status409Conflict, title: isActive ? "That visitor is already active." : "That visitor is already inactive.");
            case UserRepository.StaffError.ReasonMissing:
                return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]>
                    { [nameof(request.Reason)] = ["Give a reason of 10 to 500 characters."] }));
            default:
                return StaffProblem(error, actor, publicId, "visitor status change");
        }

        if (!isActive) await tokens.RevokeAllForUserAsync(contact!.UserId, ct);   // signed out everywhere, straight away
        var mail = await notices.SendStatusChangeAsync(contact!.EmailVerifiedAtUtc is null ? null : contact.Email, contact.FullName, isActive, reason, ct);
        log.LogInformation("Visitor {PublicId} made {Status} by super admin {Actor}; notice email: {Mail}",
            publicId, isActive ? "active" : "inactive", actor, mail);
        return Ok(new SetVisitorStatusResponse(isActive, mail.ToString()));
    }

    /// <summary>One place that turns a refusal from the staff procedures into a response (and a log line).</summary>
    private ObjectResult StaffProblem(UserRepository.StaffError error, string? actor, Guid publicId, string action)
    {
        log.LogWarning("Staff {Action} refused for {Actor} on {PublicId}: {Reason}", action, actor, publicId, error);
        return error switch
        {
            UserRepository.StaffError.NotSuperAdmin => Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only a super admin can manage staff accounts."),
            UserRepository.StaffError.NotFound => Problem(statusCode: StatusCodes.Status404NotFound, title: "That staff member wasn't found."),
            UserRepository.StaffError.Self => Problem(statusCode: StatusCodes.Status409Conflict, title: "You can't change your own account here."),
            UserRepository.StaffError.SuperAdmin => Problem(statusCode: StatusCodes.Status409Conflict, title: "A super admin can't be changed here."),
            UserRepository.StaffError.EmailTaken => Problem(statusCode: StatusCodes.Status409Conflict, title: "That email is already used by another account."),
            UserRepository.StaffError.RoleNotAllowed => Problem(statusCode: StatusCodes.Status400BadRequest, title: "That role can't be given here."),
            _ => Problem(statusCode: StatusCodes.Status400BadRequest, title: "Enter a valid email address.")
        };
    }

    /// <summary>Delete a staff member's account. Super admins only.</summary>
    /// <remarks>
    /// Like a visitor deleting their own account: personal data is cleared, the password and roles are removed and the
    /// person is signed out everywhere. A super admin can't delete themselves or another super admin.
    /// </remarks>
    [HttpDelete("staff/{publicId:guid}")]
    [Authorize(Policy = Policies.SuperAdmin)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> DeleteStaff(Guid publicId, CancellationToken ct)
    {
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var (userId, error) = await users.DeleteStaffAsync(User.GetUserId(), publicId, ct);
        switch (error)
        {
            case UserRepository.DeleteStaffError.NotSuperAdmin:
                log.LogWarning("Staff delete refused for {Actor}: the database says they aren't an active super admin", actor);
                return Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only a super admin can delete staff accounts.");
            case UserRepository.DeleteStaffError.NotFound:
                log.LogWarning("Staff delete by {Actor}: user {PublicId} not found or not staff", actor, publicId);
                return Problem(statusCode: StatusCodes.Status404NotFound, title: "That staff member wasn't found.");
            case UserRepository.DeleteStaffError.Self:
                log.LogWarning("Staff delete refused for {Actor}: tried to delete their own account", actor);
                return Problem(statusCode: StatusCodes.Status409Conflict, title: "You can't delete your own account here.");
            case UserRepository.DeleteStaffError.SuperAdmin:
                log.LogWarning("Staff delete refused for {Actor}: user {PublicId} is a super admin", actor, publicId);
                return Problem(statusCode: StatusCodes.Status409Conflict, title: "A super admin can't be deleted here.");
        }

        await tokens.RevokeAllForUserAsync(userId!.Value, ct);   // signed out everywhere, straight away
        log.LogInformation("Staff account {PublicId} deleted by super admin {Actor}", publicId, actor);
        return NoContent();
    }
}
