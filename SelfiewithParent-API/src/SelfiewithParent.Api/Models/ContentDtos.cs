using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace SelfiewithParent.Api.Models;

// ---------- Content pages (website) ----------

/// <summary>A published page in one language, ready to render. Blocks are plain data: text is shown as text, never as HTML.</summary>
public sealed record PageResponse(string Slug, string Language, string Title, string? Description, JsonElement Blocks);

// ---------- Content pages (admin) ----------

public sealed record PageListItemResponse(int PageId, string Slug, bool IsPublished, string Title, IReadOnlyList<string> Languages,
    DateTime UpdatedAtUtc, string? UpdatedBy);

public sealed record PageContentResponse(string Language, string Title, string? Description, JsonElement Blocks);

public sealed record PageDetailResponse(int PageId, string Slug, bool IsPublished, DateTime UpdatedAtUtc, IReadOnlyList<PageContentResponse> Contents);

/// <summary>A new page (unpublished, English, no blocks yet).</summary>
public sealed record CreatePageRequest
{
    /// <summary>Web address: lower-case letters, numbers and single hyphens.</summary>
    /// <example>our-team</example>
    [Required, StringLength(60, MinimumLength = 2)]
    public string Slug { get; init; } = "";

    /// <example>Our team</example>
    [Required, StringLength(120, MinimumLength = 1)]
    public string Title { get; init; } = "";
}

public sealed record CreatePageResponse(int PageId);

public sealed record UpdatePageRequest
{
    [Required, StringLength(60, MinimumLength = 2)]
    public string Slug { get; init; } = "";

    [Required]
    public bool? IsPublished { get; init; }
}

/// <summary>
/// A page's content in one language. English: the full list of blocks. Other languages: only the text to translate,
/// matched to the English blocks by id (anything left out shows in English).
/// </summary>
public sealed record SavePageContentRequest
{
    [Required, StringLength(120, MinimumLength = 1)]
    public string Title { get; init; } = "";

    [StringLength(300)]
    public string? Description { get; init; }

    public JsonElement Blocks { get; init; }
}

// ---------- Public menus (admin) ----------

public sealed record AdminMenuResponse(string MenuCode, IReadOnlyList<AdminMenuItemResponse> Items);

/// <summary>A menu entry with its English label and translated labels (by language code).</summary>
public sealed record AdminMenuItemResponse(int MenuItemId, int? ParentMenuItemId, string ItemKey, string ItemType, string Label,
    IReadOnlyDictionary<string, string> Labels, string? Url, string? ActionCode, string? Icon, string Visibility, bool OpensNewTab,
    bool IsActive, short SortOrder, string? RequiredRole);

public sealed record SaveMenuItemRequest
{
    /// <summary>Null = top level; otherwise a top-level dropdown in the same menu.</summary>
    public int? ParentMenuItemId { get; init; }

    /// <example>about.team</example>
    [Required, RegularExpression(@"^[a-z0-9.\-]{1,50}$", ErrorMessage = "The key can use lower-case letters, numbers, dots and hyphens.")]
    public string ItemKey { get; init; } = "";

    /// <summary>Link, Dropdown, Button or Divider.</summary>
    [Required, RegularExpression("^(Link|Dropdown|Button|Divider)$", ErrorMessage = "Choose Link, Dropdown, Button or Divider.")]
    public string ItemType { get; init; } = "";

    /// <summary>English label.</summary>
    [Required, StringLength(100, MinimumLength = 1)]
    public string Label { get; init; } = "";

    /// <summary>Translated labels: hi, bn, ar, es, fr. Missing / empty = English.</summary>
    public Dictionary<string, string>? Labels { get; init; }

    [StringLength(300)]
    public string? Url { get; init; }

    [RegularExpression("^bi-[a-z0-9-]{1,37}$", ErrorMessage = "Icons look like 'bi-heart'.")]
    public string? Icon { get; init; }

    [Required, RegularExpression("^(Always|SignedIn|SignedOut)$", ErrorMessage = "Choose Always, SignedIn or SignedOut.")]
    public string Visibility { get; init; } = "Always";

    public bool OpensNewTab { get; init; }

    public bool IsActive { get; init; } = true;

    [Range(0, 32000)]
    public short SortOrder { get; init; }
}

public sealed record SaveMenuItemResponse(int MenuItemId);

/// <summary>New position of one item: its parent (null = top level) and sort order.</summary>
public sealed record MenuOrderItem(int Id, int? ParentId, short SortOrder);

// ---------- Images (admin) ----------

/// <summary>An image for content pages. IsSystem: one of the website's own pictures (can't be deleted).</summary>
public sealed record MediaResponse(Guid PublicId, string Path, string FileName, string ContentType, int SizeBytes, DateTime CreatedAtUtc, bool IsSystem);
