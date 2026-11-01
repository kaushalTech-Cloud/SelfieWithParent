using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Content pages, public menus and images. Visitors read published content (System scope, read-only).
/// Every change goes through a site.usp_* procedure as the signed-in editor: the database checks again that they are
/// an active SuperAdmin or Admin and records the change in the audit log.
/// </summary>
public sealed class ContentRepository(SqlConnectionFactory db, IMemoryCache cache)
{
    public enum ContentError { None, NotEditor, NotFound, Taken, Invalid, HasChildren, Locked, English, Protected }

    /// <summary>The result of a change: an error (with the database's message for the editor), or none.</summary>
    public readonly record struct Outcome(ContentError Error, string? Message)
    {
        public static readonly Outcome Ok = new(ContentError.None, null);
        public bool Succeeded => Error == ContentError.None;
    }

    private static Outcome ToOutcome(SqlException ex) => ex.Number switch
    {
        50020 => new(ContentError.NotEditor, ex.Message),
        50021 => new(ContentError.NotFound, ex.Message),
        50022 => new(ContentError.Taken, ex.Message),
        50023 => new(ContentError.Invalid, ex.Message),
        50024 => new(ContentError.HasChildren, ex.Message),
        50025 => new(ContentError.Locked, ex.Message),
        50026 => new(ContentError.English, ex.Message),
        50027 => new(ContentError.Protected, ex.Message),
        2601 or 2627 => new(ContentError.Taken, "That is already in use."),
        _ => new(ContentError.Invalid, "Something in the content isn't valid.")   // 547: a table check refused it
    };

    private static bool IsContentError(SqlException ex) => ex.Number is (>= 50020 and <= 50029) or 2601 or 2627 or 547;

    private async Task<Outcome> RunAsync(long editorUserId, string procedure, object args, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(editorUserId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition(procedure, args, commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return Outcome.Ok;
        }
        catch (SqlException ex) when (IsContentError(ex))
        {
            return ToOutcome(ex);
        }
    }

    private async Task<(T? Value, Outcome Outcome)> RunScalarAsync<T>(long editorUserId, string procedure, object args, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(editorUserId), ct);
        try
        {
            var value = await conn.QuerySingleAsync<T>(new CommandDefinition(procedure, args, commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return (value, Outcome.Ok);
        }
        catch (SqlException ex) when (IsContentError(ex))
        {
            return (default, ToOutcome(ex));
        }
    }

    // ---------- Pages: website ----------

    public sealed record PageContentRow(string LanguageCode, string Title, string? Description, string BlocksJson);

    /// <summary>A published page's English content and, if different, the requested language's. Null if not published.</summary>
    public async Task<(PageContentRow English, PageContentRow? Translation)?> GetPublishedAsync(string slug, string language, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var rows = (await conn.QueryAsync<PageContentRow>(new CommandDefinition(@"
            SELECT c.LanguageCode, c.Title, c.Description, c.BlocksJson
            FROM site.Page AS p JOIN site.PageContent AS c ON c.PageId = p.PageId
            WHERE p.Slug = @slug AND p.IsPublished = 1 AND c.LanguageCode IN ('en', @language);",
            new { slug, language }, cancellationToken: ct))).ToList();
        var english = rows.FirstOrDefault(r => r.LanguageCode == "en");
        if (english is null) return null;
        return (english, language == "en" ? null : rows.FirstOrDefault(r => r.LanguageCode == language));
    }

    // ---------- Pages: admin ----------

    public sealed record PageListRow(int PageId, string Slug, bool IsPublished, string Title, string Languages,
        DateTime UpdatedAtUtc, string? UpdatedByName);

    public async Task<IReadOnlyList<PageListRow>> ListPagesAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<PageListRow>(new CommandDefinition(@"
            SELECT p.PageId, p.Slug, p.IsPublished, en.Title,
                   (SELECT STRING_AGG(c.LanguageCode, ',') WITHIN GROUP (ORDER BY c.LanguageCode)
                    FROM site.PageContent AS c WHERE c.PageId = p.PageId) AS Languages,
                   p.UpdatedAtUtc, u.FullName AS UpdatedByName
            FROM site.Page AS p
            JOIN site.PageContent AS en ON en.PageId = p.PageId AND en.LanguageCode = 'en'
            LEFT JOIN auth.[User] AS u ON u.UserId = p.UpdatedByUserId
            ORDER BY p.Slug;", cancellationToken: ct))).ToList();
    }

    public sealed record PageRow(int PageId, string Slug, bool IsPublished, DateTime UpdatedAtUtc);

    public sealed record PageDetail(PageRow Page, IReadOnlyList<PageContentRow> Contents);

    /// <summary>A page with its content in every language that has some (published or not).</summary>
    public async Task<PageDetail?> GetPageAsync(int pageId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var page = await conn.QuerySingleOrDefaultAsync<PageRow>(new CommandDefinition(
            "SELECT PageId, Slug, IsPublished, UpdatedAtUtc FROM site.Page WHERE PageId = @pageId;", new { pageId }, cancellationToken: ct));
        if (page is null) return null;
        var contents = (await conn.QueryAsync<PageContentRow>(new CommandDefinition(
            "SELECT LanguageCode, Title, Description, BlocksJson FROM site.PageContent WHERE PageId = @pageId;",
            new { pageId }, cancellationToken: ct))).ToList();
        return new PageDetail(page, contents);
    }

    public async Task<string?> GetEnglishBlocksAsync(int pageId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            "SELECT BlocksJson FROM site.PageContent WHERE PageId = @pageId AND LanguageCode = 'en';", new { pageId }, cancellationToken: ct));
    }

    public Task<(int PageId, Outcome Outcome)> CreatePageAsync(long editorUserId, string slug, string title, CancellationToken ct) =>
        RunScalarAsync<int>(editorUserId, "site.usp_CreatePage", new { Slug = slug, Title = title }, ct);

    public Task<Outcome> UpdatePageAsync(long editorUserId, int pageId, string slug, bool isPublished, CancellationToken ct) =>
        RunAsync(editorUserId, "site.usp_UpdatePage", new { PageId = pageId, Slug = slug, IsPublished = isPublished }, ct);

    public Task<Outcome> SaveContentAsync(long editorUserId, int pageId, string language, string title, string? description,
        string blocksJson, CancellationToken ct) =>
        RunAsync(editorUserId, "site.usp_SavePageContent",
            new { PageId = pageId, LanguageCode = language, Title = title, Description = description, BlocksJson = blocksJson }, ct);

    public Task<Outcome> DeleteContentAsync(long editorUserId, int pageId, string language, CancellationToken ct) =>
        RunAsync(editorUserId, "site.usp_DeletePageContent", new { PageId = pageId, LanguageCode = language }, ct);

    public Task<Outcome> DeletePageAsync(long editorUserId, int pageId, CancellationToken ct) =>
        RunAsync(editorUserId, "site.usp_DeletePage", new { PageId = pageId }, ct);

    // ---------- Public menus: admin ----------

    public sealed record MenuItemRow(int MenuItemId, int? ParentMenuItemId, string ItemKey, string ItemType, string Label,
        string? Url, string? ActionCode, string? Icon, string Visibility, bool OpensNewTab, bool IsActive, short SortOrder, string? RequiredRole);

    public sealed record MenuLabelRow(int MenuItemId, string LanguageCode, string Label);

    /// <summary>A public menu with all its items (also switched-off ones) and labels. Null for unknown / staff menus.</summary>
    public async Task<(IReadOnlyList<MenuItemRow> Items, IReadOnlyList<MenuLabelRow> Labels)?> GetPublicMenuAsync(string menuCode, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var menuId = await conn.QuerySingleOrDefaultAsync<short?>(new CommandDefinition(
            "SELECT MenuId FROM site.Menu WHERE MenuCode = @menuCode AND Audience = 'Public';", new { menuCode }, cancellationToken: ct));
        if (menuId is null) return null;
        var items = (await conn.QueryAsync<MenuItemRow>(new CommandDefinition(@"
            SELECT i.MenuItemId, i.ParentMenuItemId, i.ItemKey, i.ItemType, i.Label, i.Url, i.ActionCode, i.Icon, i.Visibility,
                   i.OpensNewTab, i.IsActive, i.SortOrder, r.RoleCode AS RequiredRole
            FROM site.MenuItem AS i LEFT JOIN auth.[Role] AS r ON r.RoleId = i.RequiredRoleId
            WHERE i.MenuId = @menuId ORDER BY i.SortOrder, i.MenuItemId;", new { menuId }, cancellationToken: ct))).ToList();
        var labels = (await conn.QueryAsync<MenuLabelRow>(new CommandDefinition(@"
            SELECT l.MenuItemId, l.LanguageCode, l.Label FROM site.MenuItemLabel AS l
            JOIN site.MenuItem AS i ON i.MenuItemId = l.MenuItemId WHERE i.MenuId = @menuId;", new { menuId }, cancellationToken: ct))).ToList();
        return (items, labels);
    }

    public sealed record MenuItemSave(int? MenuItemId, string MenuCode, int? ParentMenuItemId, string ItemKey, string ItemType,
        string Label, string? Url, string? ActionCode, string? Icon, string Visibility, bool OpensNewTab, bool IsActive,
        short SortOrder, string LabelsJson);

    public async Task<(int MenuItemId, Outcome Outcome)> SaveMenuItemAsync(long editorUserId, MenuItemSave item, CancellationToken ct)
    {
        var result = await RunScalarAsync<int>(editorUserId, "site.usp_SaveMenuItem", item, ct);
        if (result.Outcome.Succeeded) ForgetMenu(item.MenuCode);
        return result;
    }

    /// <summary>Deletes an item from a public menu (refused while a dropdown still has items in it).</summary>
    public async Task<Outcome> DeleteMenuItemAsync(long editorUserId, int menuItemId, CancellationToken ct)
    {
        var outcome = await RunAsync(editorUserId, "site.usp_DeleteMenuItem", new { MenuItemId = menuItemId }, ct);
        if (outcome.Succeeded) { ForgetMenu("main"); ForgetMenu("footer"); }
        return outcome;
    }

    public async Task<Outcome> ReorderMenuAsync(long editorUserId, string menuCode, string itemsJson, CancellationToken ct)
    {
        var outcome = await RunAsync(editorUserId, "site.usp_ReorderMenu", new { MenuCode = menuCode, ItemsJson = itemsJson }, ct);
        if (outcome.Succeeded) ForgetMenu(menuCode);
        return outcome;
    }

    /// <summary>The website reads menus through a short cache (MenuRepository); changes show straight away.</summary>
    private void ForgetMenu(string menuCode) => cache.Remove($"menu:{menuCode}");

    // ---------- Images ----------

    public sealed record MediaRow(Guid PublicId, string FileName, string ContentType, int SizeBytes, DateTime CreatedAtUtc, bool IsSystem);

    public sealed record MediaFile(string ContentType, byte[] Data);

    public async Task<IReadOnlyList<MediaRow>> ListMediaAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<MediaRow>(new CommandDefinition(
            "SELECT PublicId, FileName, ContentType, SizeBytes, CreatedAtUtc, IsSystem FROM site.Media ORDER BY IsSystem, CreatedAtUtc DESC, FileName, MediaId DESC;",
            cancellationToken: ct))).ToList();
    }

    public async Task<MediaFile?> GetMediaAsync(Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleOrDefaultAsync<MediaFile>(new CommandDefinition(
            "SELECT ContentType, Data FROM site.Media WHERE PublicId = @publicId;", new { publicId }, cancellationToken: ct));
    }

    public Task<(Guid PublicId, Outcome Outcome)> SaveMediaAsync(long editorUserId, string fileName, string contentType, byte[] data, CancellationToken ct) =>
        RunScalarAsync<Guid>(editorUserId, "site.usp_SaveMedia", new { FileName = fileName, ContentType = contentType, Data = data }, ct);

    public Task<Outcome> DeleteMediaAsync(long editorUserId, Guid publicId, CancellationToken ct) =>
        RunAsync(editorUserId, "site.usp_DeleteMedia", new { PublicId = publicId }, ct);
}
