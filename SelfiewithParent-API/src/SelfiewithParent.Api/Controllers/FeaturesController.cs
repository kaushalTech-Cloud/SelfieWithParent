using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

public sealed record FeaturesResponse(IReadOnlyDictionary<string, bool> Features, IReadOnlyDictionary<string, bool> Show);
public sealed record SetFeatureRequest
{
    /// <summary>feature (a website feature) or show (a contact line).</summary>
    [Required, RegularExpression("^(feature|show)$")] public string Group { get; init; } = "";
    [Required, StringLength(40)] public string Key { get; init; } = "";
    [Required] public bool? On { get; init; }
}

/// <summary>Which website features and contact lines are switched on (admin site: Site features).</summary>
[ApiController]
[Produces("application/json")]
public sealed class FeaturesController(FeatureRepository features, ILogger<FeaturesController> log) : ControllerBase
{
    /// <summary>The website asks once: what's switched on. No sign-in needed.</summary>
    [HttpGet("api/v1/site/features")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PublicContent)]
    [OutputCache(PolicyName = PublicCache.Content)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var s = await features.GetAsync(ct);
        return Ok(new FeaturesResponse(s.Features, s.Show));
    }

    [HttpGet("api/v1/admin/features")]
    [Authorize(Policy = Policies.ContentEditor)]
    public async Task<IActionResult> AdminGet(CancellationToken ct)
    {
        var s = await features.GetAsync(ct);
        return Ok(new FeaturesResponse(s.Features, s.Show));
    }

    [HttpPut("api/v1/admin/features")]
    [Authorize(Policy = Policies.ContentEditor)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Set(SetFeatureRequest r, CancellationToken ct)
    {
        var known = r.Group == "feature" ? FeatureRepository.Features.ContainsKey(r.Key) : FeatureRepository.ContactLines.Contains(r.Key);
        if (!known) return Problem(statusCode: 400, title: "That switch wasn't found.");
        var problem = await features.SetAsync(User.GetUserId(), r.Group, r.Key, r.On!.Value, ct);
        if (problem is not null) return Problem(statusCode: 400, title: problem);
        log.LogInformation("{Group} {Key} switched {State} by {Actor}", r.Group, r.Key, r.On.Value ? "on" : "off", User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value);
        return NoContent();
    }
}
