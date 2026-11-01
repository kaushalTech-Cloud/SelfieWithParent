using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace SelfiewithParent.Api.Data;

/// <summary>Reports whether the database can be reached. Returns no details (nothing useful to an attacker).</summary>
public sealed class DatabaseHealthCheck(SqlConnectionFactory db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken ct = default)
    {
        try
        {
            await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT 1;";
            await cmd.ExecuteScalarAsync(ct);
            return HealthCheckResult.Healthy();
        }
        catch (Exception)
        {
            return HealthCheckResult.Unhealthy();
        }
    }
}
