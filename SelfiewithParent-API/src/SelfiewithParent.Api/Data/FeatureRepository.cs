using System.Data;
using Dapper;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>
/// Site features staff switch on / off in the admin site (site.Setting 'feature.*' and 'show.*', '1' / '0'). A switched-off
/// feature disappears from the public menus, its buttons, and its pages ("not available right now"); its API refuses new
/// submissions. Missing settings count as on.
/// </summary>
public sealed class FeatureRepository(SqlConnectionFactory db)
{
    /// <summary>Feature → the website paths it owns (menu items linking there are hidden while it's off).</summary>
    public static readonly IReadOnlyDictionary<string, string[]> Features = new Dictionary<string, string[]>
    {
        ["then-now"] = ["/then-now"], ["memories"] = ["/memories"], ["family-tree"] = ["/family-tree"], ["contest"] = ["/contest"],
        ["photo-frames"] = ["/photo-frames"], ["reels"] = [], ["parents-voices"] = ["/parents-voices"], ["support"] = ["/support"],
        ["streaks"] = [], ["profiles"] = ["/p"], ["albums"] = ["/albums"]
    };
    /// <summary>Contact lines in the top bar / footer / contact section.</summary>
    public static readonly string[] ContactLines = ["contact-email", "contact-phone", "contact-address"];

    public sealed record State(IReadOnlyDictionary<string, bool> Features, IReadOnlyDictionary<string, bool> Show);

    public async Task<State> GetAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var s = (await conn.QueryAsync<(string Key, string Value)>(new CommandDefinition(
            "SELECT SettingKey, Value FROM site.Setting WHERE SettingKey LIKE 'feature.%' OR SettingKey LIKE 'show.%';", cancellationToken: ct)))
            .ToDictionary(x => x.Key, x => x.Value);
        return new State(
            Features.Keys.ToDictionary(k => k, k => s.GetValueOrDefault("feature." + k, "1") != "0"),
            ContactLines.ToDictionary(k => k, k => s.GetValueOrDefault("show." + k, "1") != "0"));
    }

    public async Task<bool> IsOnAsync(string feature, CancellationToken ct) => (await GetAsync(ct)).Features.GetValueOrDefault(feature, true);

    /// <summary>Switches a feature ("feature") or contact line ("show") through site.usp_SetSetting. Null when done, or the message.</summary>
    public async Task<string?> SetAsync(long userId, string group, string key, bool on, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("site.usp_SetSetting", new { SettingKey = $"{group}.{key}", Value = on ? "1" : "0" },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (ex.Number is >= 50020 and <= 50029) { return ex.Message; }
    }

    /// <summary>Whether a menu link goes to a switched-off feature.</summary>
    public static bool LinksToOff(string? url, State state) =>
        url is not null && state.Features.Any(f => !f.Value && Features[f.Key].Any(p =>
            url.Equals(p, StringComparison.OrdinalIgnoreCase) || url.StartsWith(p + "/", StringComparison.OrdinalIgnoreCase)
            || url.StartsWith(p + "?", StringComparison.OrdinalIgnoreCase) || url.StartsWith(p + "#", StringComparison.OrdinalIgnoreCase)));
}
