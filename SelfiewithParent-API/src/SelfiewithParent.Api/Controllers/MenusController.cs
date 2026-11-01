using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using SelfiewithParent.Api.Data;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Controllers;

/// <summary>Navigation menus for the websites, stored in the database.</summary>
[ApiController]
[Route("api/v1/menus")]
[EnableRateLimiting(RateLimits.PublicContent)]
[Produces("application/json")]
public sealed partial class MenusController(MenuRepository menus, FeatureRepository features) : ControllerBase
{
    private static readonly HashSet<string> Languages = ["en", "hi", "bn", "ar", "es", "fr"];

    /// <summary>A menu as a tree, with labels in the requested language (English when a translation is missing).</summary>
    /// <param name="menuCode">main (public header), footer (public footer) or admin (staff sidebar).</param>
    /// <param name="lang">en, hi, bn, ar, es or fr.</param>
    /// <param name="ct">Cancellation token.</param>
    /// <remarks>
    /// Public menus need no sign-in. Staff menus need a staff sign-in. Items limited to a role are left out
    /// for callers without that role (super admins see everything). Each item's <c>visibility</c>
    /// (Always / SignedIn / SignedOut) tells the website when to show it.
    /// </remarks>
    [HttpGet("{menuCode}")]
    [OutputCache(PolicyName = PublicCache.Content)]
    [AllowAnonymous]
    [ProducesResponseType(typeof(MenuResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(string menuCode, [FromQuery] string? lang, CancellationToken ct)
    {
        if (!MenuCodePattern().IsMatch(menuCode))
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "Unknown menu.");
        var language = lang is not null && Languages.Contains(lang) ? lang : "en";

        var data = await menus.GetAsync(menuCode, ct);
        if (data is null) return Problem(statusCode: StatusCodes.Status404NotFound, title: "Unknown menu.");

        var isSuperAdmin = User.IsInRole(AppRoles.SuperAdmin);
        if (data.Audience == "Staff" && !AppRoles.Staff.Any(User.IsInRole))
            return User.Identity?.IsAuthenticated == true
                ? Problem(statusCode: StatusCodes.Status403Forbidden, title: "This menu is for staff only.")
                : Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Please sign in.");

        var labels = data.Labels.Where(l => l.LanguageCode == language).ToDictionary(l => l.MenuItemId, l => l.Label);
        // Public menus: links to a feature staff switched off (admin site › Site features) are left out
        var state = data.Audience == "Staff" ? null : await features.GetAsync(ct);
        var allowed = data.Items.Where(i => (i.RequiredRole is null || isSuperAdmin || User.IsInRole(i.RequiredRole))
            && (state is null || !FeatureRepository.LinksToOff(i.Url, state))).ToList();
        // The tree is built from the top down, so children of a hidden or inactive parent are dropped with it
        var byParent = allowed.ToLookup(i => i.ParentMenuItemId);

        List<MenuItemResponse> Build(int? parentId) => byParent[parentId]
            .Select(i => new MenuItemResponse(
                i.ItemKey, i.ItemType, labels.GetValueOrDefault(i.MenuItemId, i.Label), i.Url, i.ActionCode, i.Icon,
                i.Visibility, i.OpensNewTab, i.ItemType == "Dropdown" ? Build(i.MenuItemId) : []))
            // a dropdown with nothing left inside it is hidden
            .Where(i => i.Type != "Dropdown" || i.Children.Any(c => c.Type != "Divider"))
            .ToList();

        return Ok(new MenuResponse(data.MenuCode, language, Build(null)));
    }

    [System.Text.RegularExpressions.GeneratedRegex("^[a-z0-9-]{1,30}$")]
    private static partial System.Text.RegularExpressions.Regex MenuCodePattern();
}

/// <summary>A menu, ready to render.</summary>
public sealed record MenuResponse(string MenuCode, string Language, IReadOnlyList<MenuItemResponse> Items);

/// <summary>One menu entry. Type is Link, Dropdown, Button, Divider or Action.</summary>
public sealed record MenuItemResponse(
    string Key, string Type, string Label, string? Url, string? ActionCode, string? Icon,
    string Visibility, bool OpensNewTab, IReadOnlyList<MenuItemResponse> Children);
