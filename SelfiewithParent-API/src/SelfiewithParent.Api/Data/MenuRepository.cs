using Dapper;
using Microsoft.Extensions.Caching.Memory;

namespace SelfiewithParent.Api.Data;

/// <summary>Navigation menus stored in the site schema. Menus are public content, cached briefly in memory.</summary>
public sealed class MenuRepository(SqlConnectionFactory db, IMemoryCache cache)
{
    public sealed record MenuRow(int MenuItemId, int? ParentMenuItemId, string ItemKey, string ItemType, string Label,
        string? Url, string? ActionCode, string? Icon, string Visibility, string? RequiredRole, bool OpensNewTab, short SortOrder);

    public sealed record LabelRow(int MenuItemId, string LanguageCode, string Label);

    public sealed record MenuData(string MenuCode, string Audience, IReadOnlyList<MenuRow> Items, IReadOnlyList<LabelRow> Labels);

    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(5);

    /// <summary>The menu with all its active items and translated labels, or null if it doesn't exist / is switched off.</summary>
    public Task<MenuData?> GetAsync(string menuCode, CancellationToken ct) =>
        cache.GetOrCreateAsync($"menu:{menuCode}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = CacheFor;
            await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);

            var menu = await conn.QuerySingleOrDefaultAsync<(short MenuId, string Audience)?>(new CommandDefinition(
                "SELECT MenuId, Audience FROM site.Menu WHERE MenuCode = @menuCode AND IsActive = 1;", new { menuCode }, cancellationToken: ct));
            if (menu is null) return null;

            var items = (await conn.QueryAsync<MenuRow>(new CommandDefinition(@"
                SELECT i.MenuItemId, i.ParentMenuItemId, i.ItemKey, i.ItemType, i.Label, i.Url, i.ActionCode, i.Icon,
                       i.Visibility, r.RoleCode AS RequiredRole, i.OpensNewTab, i.SortOrder
                FROM site.MenuItem AS i
                LEFT JOIN auth.[Role] AS r ON r.RoleId = i.RequiredRoleId
                WHERE i.MenuId = @id AND i.IsActive = 1
                ORDER BY i.SortOrder, i.MenuItemId;", new { id = menu.Value.MenuId }, cancellationToken: ct))).ToList();

            var labels = (await conn.QueryAsync<LabelRow>(new CommandDefinition(@"
                SELECT l.MenuItemId, l.LanguageCode, l.Label
                FROM site.MenuItemLabel AS l
                JOIN site.MenuItem AS i ON i.MenuItemId = l.MenuItemId
                WHERE i.MenuId = @id AND i.IsActive = 1;", new { id = menu.Value.MenuId }, cancellationToken: ct))).ToList();

            return new MenuData(menuCode, menu.Value.Audience, items, labels);
        });
}
