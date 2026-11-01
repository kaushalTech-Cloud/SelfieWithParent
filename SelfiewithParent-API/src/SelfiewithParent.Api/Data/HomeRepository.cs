using System.Data;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using SelfiewithParent.Api.Content;

namespace SelfiewithParent.Api.Data;

/// <summary>The home page's content per language (site.HomeContent) and the live numbers it can show.</summary>
public sealed class HomeRepository(SqlConnectionFactory db)
{
    public async Task<(HomeContent? Content, DateTime? UpdatedAtUtc)> GetAsync(string lang, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var row = await conn.QuerySingleOrDefaultAsync<(string Json, DateTime UpdatedAtUtc)?>(new CommandDefinition(
            "SELECT ContentJson, UpdatedAtUtc FROM site.HomeContent WHERE LanguageCode = @lang;", new { lang }, cancellationToken: ct));
        if (row is null) return (null, null);
        try { return (JsonSerializer.Deserialize<HomeContent>(row.Value.Json, HomeContentRules.Json), row.Value.UpdatedAtUtc); }
        catch (JsonException) { return (null, row.Value.UpdatedAtUtc); }   // never break the home page
    }

    /// <summary>Saves (or, with null, removes) a language's content through site.usp_SaveHomeContent. Null when done, or the message.</summary>
    public async Task<string?> SaveAsync(long userId, string lang, HomeContent? content, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition("site.usp_SaveHomeContent",
                new { LanguageCode = lang, ContentJson = content is null ? null : JsonSerializer.Serialize(content, HomeContentRules.Json) },
                commandType: CommandType.StoredProcedure, cancellationToken: ct));
            return null;
        }
        catch (SqlException ex) when (ex.Number is >= 50020 and <= 50029)
        {
            return ex.Message;
        }
    }

    public sealed record Numbers(int Selfies, int Towns, int Countries, int Families, int Visitors);

    /// <summary>Live numbers for the impact section (approved photos only; not counting photo frames).</summary>
    public async Task<Numbers> NumbersAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return await conn.QuerySingleAsync<Numbers>(new CommandDefinition(@"
            SELECT COUNT(*) AS Selfies,
                   COUNT(DISTINCT IIF(s.City IS NULL, NULL, CONCAT(LOWER(LTRIM(RTRIM(s.City))), '|', s.CountryCode))) AS Towns,
                   COUNT(DISTINCT s.CountryCode) AS Countries,
                   ISNULL(SUM(IIF(s.Kind = 'family', 1, 0)), 0) AS Families,
                   (SELECT COUNT(*) FROM auth.[User] AS u WHERE u.Status = 'Active'
                      AND EXISTS (SELECT 1 FROM auth.UserRole AS ur JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND r.RoleCode = 'Visitor')
                      AND NOT EXISTS (SELECT 1 FROM auth.UserRole AS ur JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId WHERE ur.UserId = u.UserId AND r.RoleCode <> 'Visitor')) AS Visitors
            FROM selfie.Submission AS s WHERE s.Status = 'Approved' AND s.Kind NOT IN ('frame', 'reel');", cancellationToken: ct));
    }
}
