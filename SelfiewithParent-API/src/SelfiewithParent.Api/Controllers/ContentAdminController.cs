using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;
using SelfiewithParent.Api.Content;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>
/// Content pages, public menus and images, managed by super admins and admins.
/// The API checks every block (known types and fields, plain text only, safe links, our own images); the database
/// procedures check the caller's role again and record every change in the audit log.
/// </summary>
[ApiController]
[Route("api/v1/admin")]
[Authorize(Policy = Policies.ContentEditor)]
[Produces("application/json")]
public sealed class ContentAdminController(ContentRepository content, ILogger<ContentAdminController> log) : ControllerBase
{
    private static readonly string[] PublicMenus = ["main", "footer"];
    private const int MaxImageBytes = FileTypes.MaxPageImageBytes;

    private string? Actor => User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

    // ---------- Pages ----------

    /// <summary>All content pages.</summary>
    [HttpGet("pages")]
    [ProducesResponseType(typeof(IReadOnlyList<PageListItemResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Pages(CancellationToken ct) =>
        Ok((await content.ListPagesAsync(ct)).Select(p => new PageListItemResponse(
            p.PageId, p.Slug, p.IsPublished, p.Title, p.Languages.Split(','), p.UpdatedAtUtc, p.UpdatedByName)));

    /// <summary>A page with its content in every language that has some.</summary>
    [HttpGet("pages/{pageId:int}")]
    [ProducesResponseType(typeof(PageDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Page(int pageId, CancellationToken ct)
    {
        var page = await content.GetPageAsync(pageId, ct);
        if (page is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "That page wasn't found.");
        return Ok(new PageDetailResponse(page.Page.PageId, page.Page.Slug, page.Page.IsPublished, page.Page.UpdatedAtUtc,
            page.Contents.Select(c => new PageContentResponse(c.LanguageCode, c.Title, c.Description,
                JsonDocument.Parse(c.BlocksJson).RootElement.Clone())).ToList()));
    }

    /// <summary>Create a page (unpublished, English, no blocks yet).</summary>
    [HttpPost("pages")]
    [ProducesResponseType(typeof(CreatePageResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreatePage(CreatePageRequest request, CancellationToken ct)
    {
        var slug = request.Slug.Trim();
        if (PageBlocks.CheckSlug(slug) is { } slugProblem) return Invalid(nameof(request.Slug), slugProblem, "page create");
        if (TextProblem(request.Title) is { } titleProblem) return Invalid(nameof(request.Title), titleProblem, "page create");

        var (pageId, outcome) = await content.CreatePageAsync(User.GetUserId(), slug, request.Title.Trim(), ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "page create", slug);

        log.LogInformation("Page {PageId} '/{Slug}' created by {Actor}", pageId, slug, Actor);
        return StatusCode(StatusCodes.Status201Created, new CreatePageResponse(pageId));
    }

    /// <summary>Change a page's web address and publish / unpublish it.</summary>
    [HttpPut("pages/{pageId:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdatePage(int pageId, UpdatePageRequest request, CancellationToken ct)
    {
        var slug = request.Slug.Trim();
        if (PageBlocks.CheckSlug(slug) is { } slugProblem) return Invalid(nameof(request.Slug), slugProblem, "page update");

        var outcome = await content.UpdatePageAsync(User.GetUserId(), pageId, slug, request.IsPublished!.Value, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "page update", pageId);

        log.LogInformation("Page {PageId} set to '/{Slug}' ({State}) by {Actor}", pageId, slug,
            request.IsPublished.Value ? "published" : "unpublished", Actor);
        return NoContent();
    }

    /// <summary>Save a page's content in one language.</summary>
    /// <remarks>
    /// English holds the whole page (blocks, layout, links, images). Other languages hold only translated text matched
    /// to the English blocks by id; anything else in a translation is ignored, and missing text shows in English.
    /// </remarks>
    [HttpPut("pages/{pageId:int}/content/{lang}")]
    [RequestSizeLimit(512 * 1024)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SaveContent(int pageId, string lang, SavePageContentRequest request, CancellationToken ct)
    {
        if (!PageBlocks.Languages.Contains(lang)) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Unknown language.");
        if (TextProblem(request.Title) is { } titleProblem) return Invalid(nameof(request.Title), titleProblem, "content save");
        if (request.Description is not null && TextProblem(request.Description) is { } descProblem)
            return Invalid(nameof(request.Description), descProblem, "content save");

        string? json, problem;
        if (lang == "en")
        {
            (json, problem) = PageBlocks.ValidateEnglish(request.Blocks);
        }
        else
        {
            var english = await content.GetEnglishBlocksAsync(pageId, ct);
            if (english is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "That page wasn't found.");
            (json, problem) = PageBlocks.CleanTranslation(request.Blocks, english);
        }
        if (problem is not null) return Invalid(nameof(request.Blocks), problem, "content save");

        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        var outcome = await content.SaveContentAsync(User.GetUserId(), pageId, lang, request.Title.Trim(), description, json!, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "content save", pageId);

        log.LogInformation("Page {PageId} content ({Language}) saved by {Actor}", pageId, lang, Actor);
        return NoContent();
    }

    /// <summary>Remove a translation (the page then shows in English for that language). English can't be removed.</summary>
    [HttpDelete("pages/{pageId:int}/content/{lang}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> DeleteContent(int pageId, string lang, CancellationToken ct)
    {
        if (!PageBlocks.Languages.Contains(lang)) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Unknown language.");
        var outcome = await content.DeleteContentAsync(User.GetUserId(), pageId, lang, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "translation delete", pageId);

        log.LogInformation("Page {PageId} translation ({Language}) removed by {Actor}", pageId, lang, Actor);
        return NoContent();
    }

    /// <summary>Delete a page and all its translations.</summary>
    [HttpDelete("pages/{pageId:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeletePage(int pageId, CancellationToken ct)
    {
        var outcome = await content.DeletePageAsync(User.GetUserId(), pageId, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "page delete", pageId);

        log.LogInformation("Page {PageId} deleted by {Actor}", pageId, Actor);
        return NoContent();
    }

    // ---------- Public menus ----------

    /// <summary>A public menu (main or footer) with every item, including switched-off ones, and all labels.</summary>
    [HttpGet("menus/{menuCode}")]
    [ProducesResponseType(typeof(AdminMenuResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Menu(string menuCode, CancellationToken ct)
    {
        if (!PublicMenus.Contains(menuCode)) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Unknown menu.");
        var menu = await content.GetPublicMenuAsync(menuCode, ct);
        if (menu is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Unknown menu.");

        var labels = menu.Value.Labels.ToLookup(l => l.MenuItemId);
        return Ok(new AdminMenuResponse(menuCode, menu.Value.Items.Select(i => new AdminMenuItemResponse(
            i.MenuItemId, i.ParentMenuItemId, i.ItemKey, i.ItemType, i.Label,
            labels[i.MenuItemId].ToDictionary(l => l.LanguageCode, l => l.Label),
            i.Url, i.ActionCode, i.Icon, i.Visibility, i.OpensNewTab, i.IsActive, i.SortOrder, i.RequiredRole)).ToList()));
    }

    /// <summary>Add an item to a public menu.</summary>
    [HttpPost("menus/{menuCode}/items")]
    [ProducesResponseType(typeof(SaveMenuItemResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<IActionResult> AddMenuItem(string menuCode, SaveMenuItemRequest request, CancellationToken ct) =>
        SaveMenuItem(null, menuCode, request, ct);

    /// <summary>Change an item in a public menu.</summary>
    [HttpPut("menus/{menuCode}/items/{menuItemId:int}")]
    [ProducesResponseType(typeof(SaveMenuItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<IActionResult> UpdateMenuItem(string menuCode, int menuItemId, SaveMenuItemRequest request, CancellationToken ct) =>
        SaveMenuItem(menuItemId, menuCode, request, ct);

    private async Task<IActionResult> SaveMenuItem(int? menuItemId, string menuCode, SaveMenuItemRequest request, CancellationToken ct)
    {
        if (!PublicMenus.Contains(menuCode)) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Unknown menu.");
        if (TextProblem(request.Label) is { } labelProblem) return Invalid(nameof(request.Label), labelProblem, "menu item save");

        var url = string.IsNullOrWhiteSpace(request.Url) ? null : request.Url.Trim();
        var needsUrl = request.ItemType is "Link" or "Button";
        if (needsUrl && (url is null || !PageBlocks.IsSafeUrl(url)))
            return Invalid(nameof(request.Url), "Enter a link starting with /, https://, mailto: or tel:.", "menu item save");
        if (!needsUrl) url = null;                     // dropdowns and dividers don't link anywhere

        var labels = new Dictionary<string, string>();
        foreach (var (language, value) in request.Labels ?? [])
        {
            var text = value?.Trim() ?? "";
            if (text.Length == 0) continue;
            if (language == "en" || !PageBlocks.Languages.Contains(language))
                return Invalid(nameof(request.Labels), $"Unknown language '{language}'.", "menu item save");
            if (text.Length > 100 || TextProblem(text) is not null)
                return Invalid(nameof(request.Labels), "Translated labels are plain text up to 100 characters.", "menu item save");
            labels[language] = text;
        }

        var (id, outcome) = await content.SaveMenuItemAsync(User.GetUserId(), new ContentRepository.MenuItemSave(
            menuItemId, menuCode, request.ParentMenuItemId, request.ItemKey, request.ItemType, request.Label.Trim(), url,
            null, string.IsNullOrWhiteSpace(request.Icon) ? null : request.Icon, request.Visibility, request.OpensNewTab,
            request.IsActive, request.SortOrder, JsonSerializer.Serialize(labels)), ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "menu item save", menuItemId?.ToString() ?? request.ItemKey);

        log.LogInformation("Menu {Menu} item {MenuItemId} ({Key}) {Change} by {Actor}", menuCode, id, request.ItemKey,
            menuItemId is null ? "added" : "changed", Actor);
        return menuItemId is null ? StatusCode(StatusCodes.Status201Created, new SaveMenuItemResponse(id)) : Ok(new SaveMenuItemResponse(id));
    }

    /// <summary>Delete an item from a public menu. A dropdown must be emptied first.</summary>
    [HttpDelete("menus/items/{menuItemId:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> DeleteMenuItem(int menuItemId, CancellationToken ct)
    {
        var outcome = await content.DeleteMenuItemAsync(User.GetUserId(), menuItemId, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "menu item delete", menuItemId);

        log.LogInformation("Menu item {MenuItemId} deleted by {Actor}", menuItemId, Actor);
        return NoContent();
    }

    /// <summary>Move items in a public menu: each item's parent (null = top level) and sort order.</summary>
    [HttpPut("menus/{menuCode}/order")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ReorderMenu(string menuCode, IReadOnlyList<MenuOrderItem> items, CancellationToken ct)
    {
        if (!PublicMenus.Contains(menuCode)) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Unknown menu.");
        if (items.Count is 0 or > 200 || items.Select(i => i.Id).Distinct().Count() != items.Count)
            return Invalid("items", "The new order isn't valid.", "menu reorder");

        var json = JsonSerializer.Serialize(items.Select(i => new { id = i.Id, parentId = i.ParentId, sortOrder = i.SortOrder }));
        var outcome = await content.ReorderMenuAsync(User.GetUserId(), menuCode, json, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "menu reorder", menuCode);

        log.LogInformation("Menu {Menu} reordered ({Count} items) by {Actor}", menuCode, items.Count, Actor);
        return NoContent();
    }

    // ---------- Images ----------

    /// <summary>All images: uploaded ones (newest first), then the website's own pictures.</summary>
    [HttpGet("media")]
    [ProducesResponseType(typeof(IReadOnlyList<MediaResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> MediaList(CancellationToken ct) =>
        Ok((await content.ListMediaAsync(ct)).Select(m =>
            new MediaResponse(m.PublicId, $"media/{m.PublicId}", m.FileName, m.ContentType, m.SizeBytes, m.CreatedAtUtc, m.IsSystem)));

    /// <summary>Upload a PNG, JPEG or WebP image (up to 2 MB). Use the returned path (media/…) in page blocks.</summary>
    [HttpPost("media")]
    [RequestSizeLimit(MaxImageBytes + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxImageBytes + 64 * 1024)]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(MediaResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UploadMedia(IFormFile file, CancellationToken ct)
    {
        if (file.Length is 0 or > MaxImageBytes) return Invalid(nameof(file), "Choose an image up to 2 MB.", "image upload");

        var data = await FileTypes.ReadAsync(file, ct);

        // The file's real type, from its first bytes; the name and the browser's claim aren't trusted
        var contentType = FileTypes.Image(data);
        if (contentType is null) return Invalid(nameof(file), "Only PNG, JPEG and WebP images can be uploaded.", "image upload");

        var name = FileTypes.CleanName(file.FileName, "image");

        var (publicId, outcome) = await content.SaveMediaAsync(User.GetUserId(), name, contentType, data, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "image upload", name);

        log.LogInformation("Image {PublicId} ({ContentType}, {Size} bytes) uploaded by {Actor}", publicId, contentType, data.Length, Actor);
        return StatusCode(StatusCodes.Status201Created,
            new MediaResponse(publicId, $"media/{publicId}", name, contentType, data.Length, DateTime.UtcNow, false));
    }

    /// <summary>Delete an uploaded image (the website's own pictures can't be deleted). Pages still using it will show no image.</summary>
    [HttpDelete("media/{publicId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteMedia(Guid publicId, CancellationToken ct)
    {
        var outcome = await content.DeleteMediaAsync(User.GetUserId(), publicId, ct);
        if (!outcome.Succeeded) return ContentProblem(outcome, "image delete", publicId);

        log.LogInformation("Image {PublicId} deleted by {Actor}", publicId, Actor);
        return NoContent();
    }

    // ---------- Helpers ----------

    private static string? TextProblem(string text) =>
        string.IsNullOrWhiteSpace(text) ? "This can't be empty."
        : text.Contains('<') || text.Contains('>') ? "Text can't contain < or >."
        : null;

    private IActionResult Invalid(string field, string message, string action)
    {
        log.LogWarning("Content {Action} refused for {Actor}: {Field} — {Problem}", action, Actor, field, message);
        return ValidationProblem(new ValidationProblemDetails(new Dictionary<string, string[]> { [field] = [message] }));
    }

    private IActionResult ContentProblem(ContentRepository.Outcome outcome, string action, object target)
    {
        log.LogWarning("Content {Action} ({Target}) refused for {Actor}: {Error}", action, target, Actor, outcome.Error);
        var status = outcome.Error switch
        {
            ContentRepository.ContentError.NotEditor => StatusCodes.Status403Forbidden,
            ContentRepository.ContentError.NotFound or ContentRepository.ContentError.Locked => StatusCodes.Status404NotFound,
            ContentRepository.ContentError.Taken or ContentRepository.ContentError.HasChildren or ContentRepository.ContentError.Protected => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };
        return Problem(statusCode: status, title: outcome.Message);
    }
}
