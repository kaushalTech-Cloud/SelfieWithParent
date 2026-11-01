using System.Data;
using Microsoft.Data.SqlClient;

namespace SelfiewithParent.Api.Data;

/// <summary>Who the database should treat the request as. Drives the row-level security policy.</summary>
public readonly record struct DbAccess(long? UserId, bool System)
{
    /// <summary>The signed-in visitor: the database only shows / changes their own rows.</summary>
    public static DbAccess ForUser(long userId) => new(userId, false);

    /// <summary>Sign-in, registration and staff look-ups. Only use after the API has authorised the caller.</summary>
    public static DbAccess ForSystem() => new(null, true);
}

/// <summary>
/// Opens connections that tell SQL Server who is calling, before any query runs.
/// The values are set read-only, so nothing later on the connection (including an injected query) can change them.
/// Pooled connections are reset by SqlClient, which clears the values before the next request reuses them.
/// </summary>
public sealed class SqlConnectionFactory(IConfiguration configuration)
{
    private readonly string _connectionString = configuration.GetConnectionString("SelfiewithParentDB")
        ?? throw new InvalidOperationException("Connection string 'SelfiewithParentDB' is not configured.");

    public async Task<SqlConnection> OpenAsync(DbAccess access, CancellationToken ct = default)
    {
        var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var cmd = connection.CreateCommand();
        if (access.System)
        {
            cmd.CommandText = "EXEC sys.sp_set_session_context @key = N'AccessScope', @value = N'System', @read_only = 1;";
        }
        else if (access.UserId is long id)
        {
            cmd.CommandText = "EXEC sys.sp_set_session_context @key = N'UserId', @value = @id, @read_only = 1;";
            cmd.Parameters.Add(new SqlParameter("@id", SqlDbType.BigInt) { Value = id });
        }
        else
        {
            throw new ArgumentException("A database connection must be for a signed-in user or a system task.", nameof(access));
        }

        await cmd.ExecuteNonQueryAsync(ct);
        return connection;
    }
}
