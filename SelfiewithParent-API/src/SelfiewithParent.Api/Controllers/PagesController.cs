using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using SelfiewithParent.Api.Content;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>Content pages and images managed in the admin site, as visitors see them. No sign-in needed.</summary>
[ApiController]
[Route("api/v1")]
[AllowAnonymous]
[EnableRateLimiting(RateLimits.PublicContent)]
[Produces("application/json")]
public sealed class PagesController(ContentRepository content, ILogger<PagesController> log) : ControllerBase
{
    /// <summary>A published page in the requested language (English text wherever a translation is missing).</summary>
    /// <param name="slug">The page's web address, e.g. about.</param>
    /// <param name="lang">en, hi, bn, ar, es or fr.</param>
    /// <param name="ct">Cancellation token.</param>
    [HttpGet("pages/{slug}")]
    [OutputCache(PolicyName = PublicCache.Content)]
    [ProducesResponseType(typeof(PageResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(string slug, [FromQuery] string? lang, CancellationToken ct)
    {
        if (PageBlocks.CheckSlug(slug) is not null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Page not found.");
        var language = lang is not null && PageBlocks.Languages.Contains(lang) ? lang : "en";

        var page = await content.GetPublishedAsync(slug, language, ct);
        if (page is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Page not found.");

        var (english, translation) = page.Value;
        var blocks = PageBlocks.Merge(english.BlocksJson, translation?.BlocksJson);
        return Ok(new PageResponse(slug, language,
            translation?.Title ?? english.Title,
            translation?.Description ?? english.Description,
            JsonSerializer.SerializeToElement(blocks)));
    }

    /// <summary>An image uploaded for content pages.</summary>
    [HttpGet("media/{publicId:guid}")]
    [OutputCache(PolicyName = PublicCache.ContentFiles)]
    [Produces("image/png", "image/jpeg", "image/webp")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Media(Guid publicId, CancellationToken ct)
    {
        var file = await content.GetMediaAsync(publicId, ct);
        if (file is null)
        {
            log.LogWarning("Image {PublicId} requested but not found", publicId);
            return NotFound();
        }
        // An image never changes under the same id (a new upload gets a new id), so browsers may keep it
        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return File(file.Data, file.ContentType);
    }
}
