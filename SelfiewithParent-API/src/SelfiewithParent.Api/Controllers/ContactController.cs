using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// "Get in touch": the contact details (public; super admins / admins change them) and the contact form (anyone sends;
/// super admins / admins read the messages in the admin site, with a notification while any are new).
/// </summary>
[ApiController]
[Produces("application/json")]
public sealed class ContactController(ContactRepository contact, FeatureRepository features, ILogger<ContactController> log) : ControllerBase
{
    private string? Actor => User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

    /// <summary>The website's contact details (email, phone, address; empty = not shown).</summary>
    [HttpGet("api/v1/site/contact")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Content)]
    [ProducesResponseType(typeof(ContactDetailsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Details(CancellationToken ct)
    {
        var d = await contact.DetailsAsync(ct);
        var show = (await features.GetAsync(ct)).Show;   // a line staff switched off is sent empty, so the website doesn't show it
        return Ok(new ContactDetailsResponse(show["contact-email"] ? d.Email : "", show["contact-phone"] ? d.Phone : "", show["contact-address"] ? d.Address : ""));
    }

    /// <summary>Send a message with the contact form. No sign-in needed (a signed-in sender's account is noted).</summary>
    [HttpPost("api/v1/contact")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.Auth)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Send(ContactMessageRequest r, CancellationToken ct)
    {
        string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
        var name = Clean(r.Name) ?? "";
        var subject = Clean(r.Subject);
        if (name.Contains('<') || name.Contains('>') || (subject?.Contains('<') ?? false) || (subject?.Contains('>') ?? false))
            return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]> { ["Name"] = ["Text can't contain < or >."] }));
        long? userId = User.Identity?.IsAuthenticated == true ? User.GetUserId() : null;
        var (id, problem) = await contact.SendAsync(userId, name, r.Email.Trim(), subject, r.Message.Trim(), ct);
        if (id is null)
        {
            log.LogWarning("Contact message refused: {Problem}", problem);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: problem);
        }
        log.LogInformation("Contact message {PublicId} received{From}", id, userId is null ? "" : " from a signed-in visitor");
        return Accepted();
    }

    // ---------- Admin ----------

    [HttpGet("api/v1/admin/contact")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(typeof(ContactDetailsResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> AdminDetails(CancellationToken ct)
    {
        var d = await contact.DetailsAsync(ct);
        return Ok(new ContactDetailsResponse(d.Email, d.Phone, d.Address));
    }

    /// <summary>Change the contact details shown on the website (empty = not shown).</summary>
    [HttpPut("api/v1/admin/contact")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(typeof(ContactDetailsResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SaveDetails(ContactDetailsRequest r, CancellationToken ct)
    {
        var d = new ContactRepository.ContactDetails((r.Email ?? "").Trim(), (r.Phone ?? "").Trim(), (r.Address ?? "").Trim());
        var problem = await contact.SaveDetailsAsync(User.GetUserId(), d, ct);
        if (problem is not null)
        {
            log.LogWarning("Contact details refused for {Actor}: {Problem}", Actor, problem);
            return Problem(statusCode: problem.StartsWith("Only", StringComparison.Ordinal) ? StatusCodes.Status403Forbidden : StatusCodes.Status400BadRequest, title: problem);
        }
        log.LogInformation("Contact details changed by {Actor}", Actor);
        return Ok(new ContactDetailsResponse(d.Email, d.Phone, d.Address));
    }

    /// <summary>Contact-form messages: status New, Read or Archived (empty: New and Read), new ones first.</summary>
    [HttpGet("api/v1/admin/contact-messages")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(typeof(ContactMessagePageResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Messages([FromQuery] string? status, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        var s = status is "New" or "Read" or "Archived" ? status : null;
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);
        var (items, total, counts) = await contact.MessagesAsync(s, page, pageSize, ct);
        return Ok(new ContactMessagePageResponse(items.Select(m => new ContactMessageResponse(m.PublicId, m.Name, m.Email, m.Subject, m.Message,
            m.Status, m.CreatedAtUtc, m.ReadAtUtc, m.ReadBy, m.FromAccount)).ToList(), total, page, pageSize, counts.New, counts.Read, counts.Archived));
    }

    /// <summary>How many messages are new (the admin site checks this every minute for its notification).</summary>
    [HttpGet("api/v1/admin/contact-messages/unread")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(typeof(UnreadMessagesResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Unread(CancellationToken ct)
    {
        var (count, latest, from) = await contact.UnreadAsync(ct);
        return Ok(new UnreadMessagesResponse(count, latest, from));
    }

    /// <summary>Mark a message Read, back to New, or Archived.</summary>
    [HttpPut("api/v1/admin/contact-messages/{publicId:guid}/status")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetStatus(Guid publicId, ContactMessageStatusRequest r, CancellationToken ct)
    {
        var (notFound, problem) = await contact.SetStatusAsync(User.GetUserId(), publicId, r.Status, ct);
        if (problem is not null)
        {
            log.LogWarning("Message {PublicId} status refused for {Actor}: {Problem}", publicId, Actor, problem);
            return Problem(statusCode: notFound ? StatusCodes.Status404NotFound : StatusCodes.Status403Forbidden, title: problem);
        }
        log.LogInformation("Message {PublicId} marked {Status} by {Actor}", publicId, r.Status, Actor);
        return NoContent();
    }
}
