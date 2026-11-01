using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Content;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>The home page's content (top slider, tiles, founder's message, numbers, questions, themes, priorities, pledge, app).</summary>
public sealed record HomeNumbersResponse(int Selfies, int Towns, int Countries, int Families, int Visitors);

/// <summary>English (the base) and, for another language, its own content; and the live numbers. Not set = the website's defaults.</summary>
public sealed record HomeResponse(HomeContent? En, HomeContent? Local, HomeNumbersResponse Numbers);

public sealed record AdminHomeResponse(string Language, HomeContent? Content, DateTime? UpdatedAtUtc, HomeNumbersResponse Numbers);

[ApiController]
[Produces("application/json")]
public sealed class HomeController(HomeRepository home, ILogger<HomeController> log) : ControllerBase
{
    private static readonly string[] Languages = ["en", "hi", "bn", "ar", "es", "fr"];
    private static string Lang(string? lang) => lang is not null && Languages.Contains(lang) ? lang : "en";

    private async Task<HomeNumbersResponse> NumbersAsync(CancellationToken ct)
    {
        var n = await home.NumbersAsync(ct);
        return new HomeNumbersResponse(n.Selfies, n.Towns, n.Countries, n.Families, n.Visitors);
    }

    /// <summary>The home page's content for a language (English as the base), and the live numbers.</summary>
    [HttpGet("api/v1/site/home")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Content)]
    [ProducesResponseType(typeof(HomeResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get([FromQuery] string? lang, CancellationToken ct)
    {
        var l = Lang(lang);
        var en = (await home.GetAsync("en", ct)).Content;
        var local = l == "en" ? null : (await home.GetAsync(l, ct)).Content;
        return Ok(new HomeResponse(en, local, await NumbersAsync(ct)));
    }

    // ---------- Admin ----------

    [HttpGet("api/v1/admin/home")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(typeof(AdminHomeResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> AdminGet([FromQuery] string? lang, CancellationToken ct)
    {
        var l = Lang(lang);
        var (content, updated) = await home.GetAsync(l, ct);
        return Ok(new AdminHomeResponse(l, content, updated, await NumbersAsync(ct)));
    }

    /// <summary>Save a language's home page content (what's left empty shows the defaults / English).</summary>
    [HttpPut("api/v1/admin/home")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Save([FromQuery] string? lang, [FromBody] HomeContent content, CancellationToken ct)
    {
        var l = Lang(lang);
        var actor = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var (clean, error) = HomeContentRules.Validate(content);
        if (clean is null)
        {
            log.LogWarning("Home page ({Lang}) refused for {Actor}: {Error}", l, actor, error);
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: error);
        }
        var problem = await home.SaveAsync(User.GetUserId(), l, clean, ct);
        if (problem is not null)
        {
            log.LogWarning("Home page ({Lang}) refused by the database for {Actor}: {Problem}", l, actor, problem);
            return Problem(statusCode: problem.StartsWith("Only", StringComparison.Ordinal) ? StatusCodes.Status403Forbidden : StatusCodes.Status400BadRequest, title: problem);
        }
        log.LogInformation("Home page ({Lang}) saved by {Actor}", l, actor);
        return NoContent();
    }

    /// <summary>Reset a language's home page to the website's defaults (English) / to English (other languages).</summary>
    [HttpDelete("api/v1/admin/home")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Reset([FromQuery] string? lang, CancellationToken ct)
    {
        var l = Lang(lang);
        var problem = await home.SaveAsync(User.GetUserId(), l, null, ct);
        if (problem is not null) return Problem(statusCode: StatusCodes.Status403Forbidden, title: problem);
        log.LogInformation("Home page ({Lang}) reset to the defaults by {Actor}", l, User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return NoContent();
    }
}
