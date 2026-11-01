using Dapper;
using Microsoft.Data.SqlClient;
using SelfiewithParent.Api.Models;
using SelfiewithParent.Api.Security;

namespace SelfiewithParent.Api.Data;

/// <summary>Account data. Every query is parameterised; nothing typed by a visitor is ever concatenated into SQL.</summary>
public sealed class UserRepository(SqlConnectionFactory db)
{
    public sealed record SignInUser(long UserId, Guid PublicId, string Status, bool ProfileComplete, IReadOnlyList<string> Roles);

    private sealed record UserKeyRow(long UserId, Guid PublicId, string Status, bool ProfileComplete);

    private const string SelectKeyColumns =
        "UserId, PublicId, Status, CAST(IIF(ProfileCompletedAtUtc IS NULL, 0, 1) AS bit) AS ProfileComplete";

    // ---------- Sign-in (System scope: the API has already verified the code / Google token) ----------

    public async Task<SignInUser> FindOrCreateByMobileAsync(string countryCode, string digits, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var p = new { cc = countryCode, n = digits };

        var row = await conn.QuerySingleOrDefaultAsync<UserKeyRow>(new CommandDefinition(
            $"SELECT {SelectKeyColumns} FROM auth.[User] WHERE MobileCountryCode = @cc AND MobileNumber = @n AND Status <> 'Deleted';",
            p, cancellationToken: ct));

        if (row is null)
        {
            try
            {
                // OUTPUT ... INTO is required because the table has triggers
                row = await conn.QuerySingleAsync<UserKeyRow>(new CommandDefinition(@"
                    DECLARE @new TABLE (UserId BIGINT, PublicId UNIQUEIDENTIFIER);
                    INSERT auth.[User] (SignUpMethod, MobileCountryCode, MobileNumber, MobileVerifiedAtUtc, LastSignInAtUtc)
                    OUTPUT inserted.UserId, inserted.PublicId INTO @new
                    VALUES ('Mobile', @cc, @n, SYSUTCDATETIME(), SYSUTCDATETIME());
                    SELECT UserId, PublicId, 'Active' AS Status, CAST(0 AS bit) AS ProfileComplete FROM @new;",
                    p, cancellationToken: ct));
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627)
            {
                // Two sign-ins for the same new number at once: the other request created it
                row = await conn.QuerySingleAsync<UserKeyRow>(new CommandDefinition(
                    $"SELECT {SelectKeyColumns} FROM auth.[User] WHERE MobileCountryCode = @cc AND MobileNumber = @n AND Status <> 'Deleted';",
                    p, cancellationToken: ct));
            }
        }
        else
        {
            await conn.ExecuteAsync(new CommandDefinition(
                "UPDATE auth.[User] SET MobileVerifiedAtUtc = SYSUTCDATETIME(), LastSignInAtUtc = SYSUTCDATETIME(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @id;",
                new { id = row.UserId }, cancellationToken: ct));
        }

        return new SignInUser(row.UserId, row.PublicId, row.Status, row.ProfileComplete, await GetRolesAsync(conn, row.UserId, ct));
    }

    /// <summary>Sign-in by email: the account whose email is verified, or a new one. Pass the normalised (lower-case) email.</summary>
    public async Task<SignInUser> FindOrCreateByEmailAsync(string email, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var p = new { email };
        const string find = $"SELECT {SelectKeyColumns} FROM auth.[User] WHERE Email = @email AND EmailVerifiedAtUtc IS NOT NULL AND Status <> 'Deleted';";

        var row = await conn.QuerySingleOrDefaultAsync<UserKeyRow>(new CommandDefinition(find, p, cancellationToken: ct));
        if (row is null)
        {
            // An account that only typed this email into its profile (unverified) is NOT linked automatically
            try
            {
                row = await conn.QuerySingleAsync<UserKeyRow>(new CommandDefinition(@"
                    DECLARE @new TABLE (UserId BIGINT, PublicId UNIQUEIDENTIFIER);
                    INSERT auth.[User] (SignUpMethod, Email, EmailVerifiedAtUtc, LastSignInAtUtc)
                    OUTPUT inserted.UserId, inserted.PublicId INTO @new
                    VALUES ('Email', @email, SYSUTCDATETIME(), SYSUTCDATETIME());
                    SELECT UserId, PublicId, 'Active' AS Status, CAST(0 AS bit) AS ProfileComplete FROM @new;",
                    p, cancellationToken: ct));
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627)
            {
                // Two sign-ins for the same new email at once: the other request created it
                row = await conn.QuerySingleAsync<UserKeyRow>(new CommandDefinition(find, p, cancellationToken: ct));
            }
        }
        else
        {
            await conn.ExecuteAsync(new CommandDefinition(
                "UPDATE auth.[User] SET EmailVerifiedAtUtc = SYSUTCDATETIME(), LastSignInAtUtc = SYSUTCDATETIME(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @id;",
                new { id = row.UserId }, cancellationToken: ct));
        }

        return new SignInUser(row.UserId, row.PublicId, row.Status, row.ProfileComplete, await GetRolesAsync(conn, row.UserId, ct));
    }

    // ---------- Password sign-in (email accounts that added a password) ----------

    /// <summary>Wrong passwords in a row before password sign-in pauses (the emailed code still works).</summary>
    public const int MaxPasswordFailures = 5;
    public static readonly TimeSpan PasswordLockout = TimeSpan.FromMinutes(15);

    public sealed record PasswordSignIn(SignInUser User, string PasswordHash, bool Locked);

    private sealed record PasswordRow(long UserId, Guid PublicId, string Status, bool ProfileComplete, string PasswordHash, bool Locked);

    /// <summary>The account with this verified email and a password, or null. Pass the normalised (lower-case) email.</summary>
    public async Task<PasswordSignIn?> FindForPasswordSignInAsync(string email, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var row = await conn.QuerySingleOrDefaultAsync<PasswordRow>(new CommandDefinition(@"
            SELECT u.UserId, u.PublicId, u.Status, CAST(IIF(u.ProfileCompletedAtUtc IS NULL, 0, 1) AS bit) AS ProfileComplete,
                   p.PasswordHash, CAST(IIF(p.LockedUntilUtc > SYSUTCDATETIME(), 1, 0) AS bit) AS Locked
            FROM auth.[User] AS u
            JOIN auth.UserPassword AS p ON p.UserId = u.UserId
            WHERE u.Email = @email AND u.EmailVerifiedAtUtc IS NOT NULL AND u.Status <> 'Deleted' AND p.PasswordHash IS NOT NULL;",
            new { email }, cancellationToken: ct));
        if (row is null) return null;
        var user = new SignInUser(row.UserId, row.PublicId, row.Status, row.ProfileComplete, await GetRolesAsync(conn, row.UserId, ct));
        return new PasswordSignIn(user, row.PasswordHash, row.Locked);
    }

    /// <summary>Counts a wrong password; the 5th in a row pauses password sign-in for 15 minutes. Returns true when now locked.</summary>
    public async Task<bool> RecordPasswordFailureAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        // OUTPUT ... INTO is required because the table has triggers
        return await conn.QuerySingleOrDefaultAsync<bool>(new CommandDefinition(@"
            DECLARE @r TABLE (Locked BIT);
            UPDATE auth.UserPassword
               SET FailedAttempts  = IIF(FailedAttempts >= 1000, 1000, FailedAttempts + 1),
                   LastFailedAtUtc = SYSUTCDATETIME(),
                   LockedUntilUtc  = IIF(FailedAttempts + 1 >= @max, DATEADD(SECOND, @lockSeconds, SYSUTCDATETIME()), LockedUntilUtc)
            OUTPUT CAST(IIF(inserted.LockedUntilUtc > SYSUTCDATETIME(), 1, 0) AS bit) INTO @r
             WHERE UserId = @id;
            SELECT Locked FROM @r;",
            new { id = userId, max = MaxPasswordFailures, lockSeconds = (int)PasswordLockout.TotalSeconds }, cancellationToken: ct));
    }

    /// <summary>Right password: clears the wrong-attempt count, records the sign-in, and stores a stronger hash if one is given.</summary>
    public async Task RecordPasswordSuccessAsync(long userId, string? upgradedHash, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        await conn.ExecuteAsync(new CommandDefinition(@"
            UPDATE auth.UserPassword
               SET FailedAttempts = 0, LockedUntilUtc = NULL,
                   PasswordHash   = COALESCE(@hash, PasswordHash),
                   UpdatedAtUtc   = IIF(@hash IS NULL, UpdatedAtUtc, SYSUTCDATETIME())
             WHERE UserId = @id AND (FailedAttempts <> 0 OR LockedUntilUtc IS NOT NULL OR @hash IS NOT NULL);
            UPDATE auth.[User] SET LastSignInAtUtc = SYSUTCDATETIME(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @id;",
            new { id = userId, hash = upgradedHash }, cancellationToken: ct));
    }

    public async Task<SignInUser> FindOrCreateByGoogleAsync(string subject, string? verifiedEmail, string? name, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);

        var row = await conn.QuerySingleOrDefaultAsync<UserKeyRow>(new CommandDefinition(
            $"SELECT {SelectKeyColumns} FROM auth.[User] WHERE GoogleSubjectId = @sub AND Status <> 'Deleted';",
            new { sub = subject }, cancellationToken: ct));

        if (row is null)
        {
            // An existing account with the same email is NOT linked automatically (prevents account takeover)
            try
            {
                row = await conn.QuerySingleAsync<UserKeyRow>(new CommandDefinition(@"
                    DECLARE @new TABLE (UserId BIGINT, PublicId UNIQUEIDENTIFIER);
                    INSERT auth.[User] (SignUpMethod, GoogleSubjectId, Email, EmailVerifiedAtUtc, FullName, LastSignInAtUtc)
                    OUTPUT inserted.UserId, inserted.PublicId INTO @new
                    VALUES ('Google', @sub, @email, IIF(@email IS NULL, NULL, SYSUTCDATETIME()), @name, SYSUTCDATETIME());
                    SELECT UserId, PublicId, 'Active' AS Status, CAST(0 AS bit) AS ProfileComplete FROM @new;",
                    new { sub = subject, email = verifiedEmail, name }, cancellationToken: ct));
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627)
            {
                row = await conn.QuerySingleAsync<UserKeyRow>(new CommandDefinition(
                    $"SELECT {SelectKeyColumns} FROM auth.[User] WHERE GoogleSubjectId = @sub AND Status <> 'Deleted';",
                    new { sub = subject }, cancellationToken: ct));
            }
        }
        else
        {
            await conn.ExecuteAsync(new CommandDefinition(
                "UPDATE auth.[User] SET LastSignInAtUtc = SYSUTCDATETIME(), UpdatedAtUtc = SYSUTCDATETIME() WHERE UserId = @id;",
                new { id = row.UserId }, cancellationToken: ct));
        }

        return new SignInUser(row.UserId, row.PublicId, row.Status, row.ProfileComplete, await GetRolesAsync(conn, row.UserId, ct));
    }

    /// <summary>Current status and roles, used when a refresh token is exchanged.</summary>
    public async Task<SignInUser?> GetForTokenRefreshAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var row = await conn.QuerySingleOrDefaultAsync<UserKeyRow>(new CommandDefinition(
            $"SELECT {SelectKeyColumns} FROM auth.[User] WHERE UserId = @id;", new { id = userId }, cancellationToken: ct));
        return row is null ? null : new SignInUser(row.UserId, row.PublicId, row.Status, row.ProfileComplete, await GetRolesAsync(conn, row.UserId, ct));
    }

    private static async Task<IReadOnlyList<string>> GetRolesAsync(SqlConnection conn, long userId, CancellationToken ct) =>
        (await conn.QueryAsync<string>(new CommandDefinition(@"
            SELECT r.RoleCode
            FROM auth.UserRole AS ur
            JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId
            WHERE ur.UserId = @id AND r.IsActive = 1
              AND (ur.ExpiresAtUtc IS NULL OR ur.ExpiresAtUtc > SYSUTCDATETIME())
            ORDER BY r.RoleId;", new { id = userId }, cancellationToken: ct))).ToList();

    // ---------- My account (signed-in user scope: row-level security limits every query to their own row) ----------

    private sealed record ProfileRow(Guid PublicId, string SignUpMethod, string? MobileCountryCode, string? MobileNumber, string? Email,
        string? FullName, string? CountryCode, string? StateName, string? City, string PreferredLanguage,
        bool IsAdultConfirmed, bool WhatsAppOptIn, DateTime? ProfileCompletedAtUtc, DateTime CreatedAtUtc, bool HasPassword, Guid? PhotoId);

    private const string ProfileColumns = @"PublicId, SignUpMethod, MobileCountryCode, MobileNumber, Email, FullName, CountryCode, StateName, City,
        PreferredLanguage, IsAdultConfirmed, WhatsAppOptIn, ProfileCompletedAtUtc, CreatedAtUtc,
        CAST(IIF(EXISTS (SELECT 1 FROM auth.UserPassword AS pw WHERE pw.UserId = [User].UserId AND pw.PasswordHash IS NOT NULL), 1, 0) AS bit) AS HasPassword,
        (SELECT ph.PublicId FROM auth.ProfilePhoto AS ph WHERE ph.UserId = [User].UserId) AS PhotoId";

    public async Task<ProfileResponse?> GetProfileAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var p = await conn.QuerySingleOrDefaultAsync<ProfileRow>(new CommandDefinition(
            $"SELECT {ProfileColumns} FROM auth.[User] WHERE UserId = @id AND Status = 'Active';", new { id = userId }, cancellationToken: ct));
        if (p is null) return null;

        var roles = (await conn.QueryAsync<string>(new CommandDefinition(
            "SELECT r.RoleCode FROM auth.UserRole ur JOIN auth.[Role] r ON r.RoleId = ur.RoleId WHERE ur.UserId = @id ORDER BY r.RoleId;",
            new { id = userId }, cancellationToken: ct))).ToList();

        return ToResponse(p, roles);
    }

    private static ProfileResponse ToResponse(ProfileRow p, IReadOnlyList<string> roles) => new(
        p.PublicId, p.SignUpMethod,
        p.MobileNumber is null ? null : PhoneNumber.Mask(p.MobileCountryCode ?? "", p.MobileNumber),
        p.Email, p.FullName, p.CountryCode, p.StateName, p.City, p.PreferredLanguage,
        p.IsAdultConfirmed, p.WhatsAppOptIn, p.ProfileCompletedAtUtc is not null, roles, p.CreatedAtUtc, p.HasPassword, p.PhotoId);

    // ---------- Profile photo (my own; the database only lets these touch the signed-in account's photo) ----------

    public sealed record PhotoFile(string ContentType, byte[] Data);

    public async Task<PhotoFile?> GetPhotoAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return await conn.QuerySingleOrDefaultAsync<PhotoFile>(new CommandDefinition(
            "SELECT ContentType, Data FROM auth.ProfilePhoto WHERE UserId = @id;", new { id = userId }, cancellationToken: ct));
    }

    /// <summary>Adds or replaces my photo. Returns its new id.</summary>
    public async Task<Guid> SetPhotoAsync(long userId, string contentType, byte[] data, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return await conn.QuerySingleAsync<Guid>(new CommandDefinition("auth.usp_SetProfilePhoto",
            new { ContentType = contentType, Data = data }, commandType: System.Data.CommandType.StoredProcedure, cancellationToken: ct));
    }

    public async Task RemovePhotoAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        await conn.ExecuteAsync(new CommandDefinition("auth.usp_RemoveProfilePhoto", commandType: System.Data.CommandType.StoredProcedure, cancellationToken: ct));
    }

    public enum SetMobileResult { Saved, NotFound, TakenByAnotherAccount }

    /// <summary>Saves my verified mobile number (the code has already been checked). It can then be used to sign in.</summary>
    public async Task<SetMobileResult> SetMobileAsync(long userId, string countryCode, string digits, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        try
        {
            var rows = await conn.ExecuteAsync(new CommandDefinition(@"
                UPDATE auth.[User]
                   SET MobileCountryCode = @cc, MobileNumber = @n, MobileVerifiedAtUtc = SYSUTCDATETIME(), UpdatedAtUtc = SYSUTCDATETIME()
                 WHERE UserId = @id AND Status = 'Active';",
                new { id = userId, cc = countryCode, n = digits }, cancellationToken: ct));
            return rows == 1 ? SetMobileResult.Saved : SetMobileResult.NotFound;
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            return SetMobileResult.TakenByAnotherAccount;   // UX_User_Mobile: one account per number
        }
    }

    public sealed record PasswordState(string SignUpMethod, string? Email, string? PasswordHash);

    /// <summary>What's needed to add or change my password (row-level security: my own row only).</summary>
    public async Task<PasswordState?> GetPasswordStateAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        return await conn.QuerySingleOrDefaultAsync<PasswordState>(new CommandDefinition(@"
            SELECT u.SignUpMethod, u.Email, p.PasswordHash
            FROM auth.[User] AS u
            LEFT JOIN auth.UserPassword AS p ON p.UserId = u.UserId
            WHERE u.UserId = @id AND u.Status = 'Active';", new { id = userId }, cancellationToken: ct));
    }

    /// <summary>Adds or replaces my password hash (and clears any lock-out).</summary>
    public async Task SetPasswordAsync(long userId, string hash, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        await conn.ExecuteAsync(new CommandDefinition(@"
            UPDATE auth.UserPassword
               SET PasswordHash = @hash, FailedAttempts = 0, LockedUntilUtc = NULL, UpdatedAtUtc = SYSUTCDATETIME()
             WHERE UserId = @id;
            IF @@ROWCOUNT = 0
                INSERT auth.UserPassword (UserId, PasswordHash) VALUES (@id, @hash);",
            new { id = userId, hash }, cancellationToken: ct));
    }

    public async Task<bool> UpdateProfileAsync(long userId, UpdateProfileRequest r, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var rows = await conn.ExecuteAsync(new CommandDefinition(@"
            UPDATE auth.[User]
               SET FullName            = @FullName,
                   -- Email-sign-in accounts keep their verified email: it's how they sign in (changing it needs a new code)
                   EmailVerifiedAtUtc  = IIF(SignUpMethod = 'Email' OR ISNULL(Email, N'') = ISNULL(@Email, N''), EmailVerifiedAtUtc, NULL),
                   Email               = IIF(SignUpMethod = 'Email', Email, @Email),
                   CountryCode         = @CountryCode,
                   StateName           = @StateName,
                   City                = @City,
                   PreferredLanguage   = @PreferredLanguage,
                   IsAdultConfirmed    = 1,
                   AdultConfirmedAtUtc = COALESCE(AdultConfirmedAtUtc, SYSUTCDATETIME()),
                   WhatsAppOptInAtUtc  = IIF(@WhatsAppOptIn = 1, COALESCE(WhatsAppOptInAtUtc, SYSUTCDATETIME()), NULL),
                   WhatsAppOptIn       = @WhatsAppOptIn,
                   ProfileCompletedAtUtc = COALESCE(ProfileCompletedAtUtc, SYSUTCDATETIME()),
                   UpdatedAtUtc        = SYSUTCDATETIME()
             WHERE UserId = @UserId AND Status = 'Active';",
            new
            {
                UserId = userId,
                FullName = r.FullName.Trim(),
                Email = string.IsNullOrWhiteSpace(r.Email) ? null : r.Email.Trim(),
                r.CountryCode,
                StateName = string.IsNullOrWhiteSpace(r.StateName) ? null : r.StateName.Trim(),
                City = string.IsNullOrWhiteSpace(r.City) ? null : r.City.Trim(),
                r.PreferredLanguage,
                r.WhatsAppOptIn
            }, cancellationToken: ct));
        return rows == 1;
    }

    /// <summary>Everything we hold about the visitor (their right to access their data).</summary>
    public async Task<object?> ExportAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var p = await conn.QuerySingleOrDefaultAsync(new CommandDefinition(@"
            SELECT PublicId, SignUpMethod, MobileCountryCode, MobileNumber, MobileVerifiedAtUtc, Email, EmailVerifiedAtUtc,
                   FullName, CountryCode, StateName, City, PreferredLanguage, IsAdultConfirmed, AdultConfirmedAtUtc,
                   WhatsAppOptIn, WhatsAppOptInAtUtc, Status, ProfileCompletedAtUtc, LastSignInAtUtc, CreatedAtUtc, UpdatedAtUtc
            FROM auth.[User] WHERE UserId = @id AND Status = 'Active';", new { id = userId }, cancellationToken: ct));
        if (p is null) return null;
        var roles = await conn.QueryAsync(new CommandDefinition(@"
            SELECT r.RoleCode, ur.AssignedAtUtc, ur.ExpiresAtUtc
            FROM auth.UserRole ur JOIN auth.[Role] r ON r.RoleId = ur.RoleId WHERE ur.UserId = @id;", new { id = userId }, cancellationToken: ct));
        // Whether a password is set and when — never the hash
        var password = await conn.QuerySingleOrDefaultAsync(new CommandDefinition(@"
            SELECT CreatedAtUtc AS AddedAtUtc, UpdatedAtUtc AS LastChangedAtUtc
            FROM auth.UserPassword WHERE UserId = @id AND PasswordHash IS NOT NULL;", new { id = userId }, cancellationToken: ct));
        return new { account = p, roles, password, exportedAtUtc = DateTime.UtcNow };
    }

    /// <summary>Deletes the account: personal data is cleared and the account can't sign in again.</summary>
    public async Task<bool> DeleteAccountAsync(long userId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(userId), ct);
        var rows = await conn.QuerySingleAsync<int>(new CommandDefinition(@"
            UPDATE auth.[User]
               SET MobileCountryCode = NULL, MobileNumber = NULL, MobileVerifiedAtUtc = NULL,
                   Email = NULL, EmailVerifiedAtUtc = NULL, GoogleSubjectId = NULL,
                   FullName = NULL, StateName = NULL, City = NULL,
                   WhatsAppOptIn = 0, WhatsAppOptInAtUtc = NULL,
                   Status = 'Deleted', DeletedAtUtc = SYSUTCDATETIME(), UpdatedAtUtc = SYSUTCDATETIME()
             WHERE UserId = @id AND Status = 'Active';
            DECLARE @rows INT = @@ROWCOUNT;
            -- The password goes too (rows are never hard-deleted by the website; the hash is cleared)
            UPDATE auth.UserPassword SET PasswordHash = NULL, FailedAttempts = 0, LockedUntilUtc = NULL, UpdatedAtUtc = SYSUTCDATETIME()
             WHERE UserId = @id AND @rows = 1;
            -- Their profile photo, and every selfie / video they shared, are removed
            IF @rows = 1 BEGIN EXEC auth.usp_RemoveProfilePhoto; EXEC selfie.usp_DeleteMySubmissions; END
            SELECT @rows;", new { id = userId }, cancellationToken: ct));
        return rows == 1;
    }

    // ---------- Staff (System scope; the controller has already checked the caller's role) ----------

    public async Task<IReadOnlyList<RoleResponse>> ListRolesAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        return (await conn.QueryAsync<RoleResponse>(new CommandDefinition(
            "SELECT RoleId, RoleCode, Name, Description FROM auth.[Role] WHERE IsActive = 1 ORDER BY RoleId;", cancellationToken: ct))).ToList();
    }

    private sealed record StaffRow(Guid PublicId, string? Email, string? MobileCountryCode, string? MobileNumber, string? FullName,
        string Roles, DateTime CreatedAtUtc, DateTime? LastSignInAtUtc, string Status);

    /// <summary>Everyone holding a staff role (current, not expired), active and inactive, newest first.</summary>
    public async Task<IReadOnlyList<StaffMemberResponse>> ListStaffAsync(CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var rows = await conn.QueryAsync<StaffRow>(new CommandDefinition(@"
            SELECT u.PublicId, u.Email, u.MobileCountryCode, u.MobileNumber, u.FullName,
                   STRING_AGG(r.RoleCode, ',') WITHIN GROUP (ORDER BY r.RoleId) AS Roles, u.CreatedAtUtc, u.LastSignInAtUtc, u.Status
            FROM auth.[User] AS u
            JOIN auth.UserRole AS ur ON ur.UserId = u.UserId AND (ur.ExpiresAtUtc IS NULL OR ur.ExpiresAtUtc > SYSUTCDATETIME())
            JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId AND r.IsActive = 1 AND r.RoleCode <> 'Visitor'
            WHERE u.Status IN ('Active', 'Suspended')
            GROUP BY u.UserId, u.PublicId, u.Email, u.MobileCountryCode, u.MobileNumber, u.FullName, u.CreatedAtUtc, u.LastSignInAtUtc, u.Status
            ORDER BY u.CreatedAtUtc DESC;", cancellationToken: ct));
        return rows.Select(r => new StaffMemberResponse(r.PublicId, r.Email,
            r.MobileNumber is null ? null : PhoneNumber.Mask(r.MobileCountryCode ?? "", r.MobileNumber),
            r.FullName, r.Roles.Split(','), r.CreatedAtUtc, r.LastSignInAtUtc, r.Status == "Active")).ToList();
    }

    /// <summary>Why a staff / visitor procedure refused (its THROW numbers 50010–50018).</summary>
    public enum StaffError { None, NotSuperAdmin, RoleNotAllowed, BadEmail, NotFound, Self, SuperAdmin, EmailTaken, ReasonMissing, NoChange }

    private static StaffError ToStaffError(int number) => number switch
    {
        50010 => StaffError.NotSuperAdmin,
        50011 => StaffError.RoleNotAllowed,
        50012 => StaffError.BadEmail,
        50013 => StaffError.NotFound,
        50014 => StaffError.Self,
        50015 => StaffError.SuperAdmin,
        50017 => StaffError.ReasonMissing,
        50018 => StaffError.NoChange,
        _ => StaffError.EmailTaken
    };

    // ---------- Visitors (super admins) ----------

    private sealed record VisitorRow(Guid PublicId, string? FullName, string? Email, string? MobileCountryCode, string? MobileNumber,
        string SignUpMethod, string? CountryCode, DateTime CreatedAtUtc, DateTime? LastSignInAtUtc, string Status,
        string? LastReason, DateTime? LastStatusChangeAtUtc, int Total);

    private const string VisitorFilter = @"
            u.Status IN ('Active', 'Suspended')
              AND (@active IS NULL OR u.Status = IIF(@active = 1, 'Active', 'Suspended'))
              AND NOT EXISTS (SELECT 1 FROM auth.UserRole AS ur JOIN auth.[Role] AS r ON r.RoleId = ur.RoleId
                              WHERE ur.UserId = u.UserId AND r.RoleCode <> 'Visitor')
              AND (@term IS NULL
                   OR u.FullName LIKE '%' + @term + '%'
                   OR u.Email LIKE '%' + @term + '%'
                   OR (LEN(@digits) >= 3 AND u.MobileNumber LIKE '%' + @digits))";

    /// <summary>
    /// Accounts without a staff role (active and inactive), newest first, one page at a time.
    /// <paramref name="search"/> matches name, email or the last digits of the mobile number (all parameterised).
    /// </summary>
    public async Task<VisitorPageResponse> ListVisitorsAsync(string? search, bool? isActive, int page, int pageSize, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var term = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        var digits = term is null ? null : new string(term.Where(char.IsAsciiDigit).ToArray());
        var p = new { term, digits, active = isActive, skip = (page - 1) * pageSize, take = pageSize };

        var rows = (await conn.QueryAsync<VisitorRow>(new CommandDefinition($@"
            SELECT u.PublicId, u.FullName, u.Email, u.MobileCountryCode, u.MobileNumber, u.SignUpMethod, u.CountryCode,
                   u.CreatedAtUtc, u.LastSignInAtUtc, u.Status, h.Reason AS LastReason, h.ChangedAtUtc AS LastStatusChangeAtUtc,
                   COUNT(*) OVER () AS Total
            FROM auth.[User] AS u
            OUTER APPLY (SELECT TOP (1) c.Reason, c.ChangedAtUtc FROM auth.AccountStatusChange AS c
                         WHERE c.UserId = u.UserId ORDER BY c.AccountStatusChangeId DESC) AS h
            WHERE {VisitorFilter}
            ORDER BY u.CreatedAtUtc DESC, u.UserId DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;", p, cancellationToken: ct))).ToList();

        // A page past the end has no rows to carry the total; count separately only then
        var total = rows.Count > 0 ? rows[0].Total : page == 1 ? 0 : await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            $"SELECT COUNT(*) FROM auth.[User] AS u WHERE {VisitorFilter};", p, cancellationToken: ct));

        var items = rows.Select(r => new VisitorResponse(r.PublicId, r.FullName, r.Email,
            r.MobileNumber is null ? null : PhoneNumber.Mask(r.MobileCountryCode ?? "", r.MobileNumber),
            r.SignUpMethod, r.CountryCode, r.CreatedAtUtc, r.LastSignInAtUtc, r.Status == "Active",
            r.LastReason, r.LastStatusChangeAtUtc)).ToList();
        return new VisitorPageResponse(items, total, page, pageSize);
    }

    public sealed record VisitorContact(long UserId, string? Email, DateTime? EmailVerifiedAtUtc, string? FullName);

    /// <summary>
    /// Makes a visitor active / inactive through auth.usp_SetVisitorActive (the database checks the caller is an active
    /// super admin and the account isn't staff, and keeps the reason). Returns the visitor's contact details for the notice.
    /// </summary>
    public async Task<(VisitorContact? Contact, StaffError Error)> SetVisitorActiveAsync(
        long superAdminUserId, Guid publicId, bool isActive, string reason, CancellationToken ct)
    {
        long userId;
        await using (var conn = await db.OpenAsync(DbAccess.ForUser(superAdminUserId), ct))
        {
            try
            {
                userId = await conn.QuerySingleAsync<long>(new CommandDefinition(
                    "auth.usp_SetVisitorActive", new { PublicId = publicId, IsActive = isActive, Reason = reason },
                    commandType: System.Data.CommandType.StoredProcedure, cancellationToken: ct));
            }
            catch (SqlException ex) when (ex.Number is >= 50010 and <= 50018)
            {
                return (null, ToStaffError(ex.Number));
            }
        }

        // Personal data stays masked inside the procedure; the website login reads the real contact details here
        await using var sys = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var contact = await sys.QuerySingleAsync<VisitorContact>(new CommandDefinition(
            "SELECT UserId, Email, EmailVerifiedAtUtc, FullName FROM auth.[User] WHERE UserId = @id;", new { id = userId }, cancellationToken: ct));
        return (contact, StaffError.None);
    }

    private sealed record UpdateStaffRow(long UserId, bool RoleChanged);

    /// <summary>
    /// Edits a staff member through auth.usp_UpdateStaffUser (the database checks the caller is an active super admin
    /// and refuses self / other super admins / an email used by another account).
    /// </summary>
    public async Task<(long? UserId, bool RoleChanged, StaffError Error)> UpdateStaffAsync(
        long superAdminUserId, Guid publicId, string email, string fullName, string roleCode, string? passwordHash, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(superAdminUserId), ct);
        try
        {
            var row = await conn.QuerySingleAsync<UpdateStaffRow>(new CommandDefinition(
                "auth.usp_UpdateStaffUser",
                new { PublicId = publicId, Email = email, FullName = fullName, RoleCode = roleCode, PasswordHash = passwordHash },
                commandType: System.Data.CommandType.StoredProcedure, cancellationToken: ct));
            return (row.UserId, row.RoleChanged, StaffError.None);
        }
        catch (SqlException ex) when (ex.Number is >= 50010 and <= 50016)
        {
            return (null, false, ToStaffError(ex.Number));
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            return (null, false, StaffError.EmailTaken);   // UX_User_VerifiedEmail: someone took the email at the same moment
        }
    }

    /// <summary>Makes a staff member active / inactive through auth.usp_SetStaffActive. Returns their internal id.</summary>
    public async Task<(long? UserId, StaffError Error)> SetStaffActiveAsync(long superAdminUserId, Guid publicId, bool isActive, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(superAdminUserId), ct);
        try
        {
            var userId = await conn.QuerySingleAsync<long>(new CommandDefinition(
                "auth.usp_SetStaffActive", new { PublicId = publicId, IsActive = isActive },
                commandType: System.Data.CommandType.StoredProcedure, cancellationToken: ct));
            return (userId, StaffError.None);
        }
        catch (SqlException ex) when (ex.Number is >= 50010 and <= 50015)
        {
            return (null, ToStaffError(ex.Number));
        }
    }

    public enum CreateStaffError { None, NotSuperAdmin, RoleNotAllowed, BadEmail }

    /// <summary>
    /// Creates a staff account through auth.usp_CreateStaffUser. The connection carries the super admin's own id
    /// (read-only session context), and the database itself checks that they are an active super admin.
    /// </summary>
    public async Task<(CreateStaffResponse? Result, CreateStaffError Error)> CreateStaffAsync(
        long superAdminUserId, string email, string fullName, string? passwordHash, string roleCode, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(superAdminUserId), ct);
        try
        {
            var result = await conn.QuerySingleAsync<CreateStaffResponse>(new CommandDefinition(
                "auth.usp_CreateStaffUser",
                new { Email = email, FullName = fullName, PasswordHash = passwordHash, RoleCode = roleCode },
                commandType: System.Data.CommandType.StoredProcedure, cancellationToken: ct));
            return (result, CreateStaffError.None);
        }
        catch (SqlException ex) when (ex.Number is 50010 or 50011 or 50012)
        {
            return (null, ex.Number switch
            {
                50010 => CreateStaffError.NotSuperAdmin,
                50011 => CreateStaffError.RoleNotAllowed,
                _ => CreateStaffError.BadEmail
            });
        }
    }

    public enum DeleteStaffError { None, NotSuperAdmin, NotFound, Self, SuperAdmin }

    /// <summary>
    /// Deletes a staff account through auth.usp_DeleteStaffUser (the database checks the caller is an active super admin,
    /// and refuses self / other super admins). Returns the deleted account's internal id, for signing it out.
    /// </summary>
    public async Task<(long? UserId, DeleteStaffError Error)> DeleteStaffAsync(long superAdminUserId, Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForUser(superAdminUserId), ct);
        try
        {
            var userId = await conn.QuerySingleAsync<long>(new CommandDefinition(
                "auth.usp_DeleteStaffUser", new { PublicId = publicId },
                commandType: System.Data.CommandType.StoredProcedure, cancellationToken: ct));
            return (userId, DeleteStaffError.None);
        }
        catch (SqlException ex) when (ex.Number is >= 50010 and <= 50015)
        {
            return (null, ex.Number switch
            {
                50010 => DeleteStaffError.NotSuperAdmin,
                50014 => DeleteStaffError.Self,
                50015 => DeleteStaffError.SuperAdmin,
                _ => DeleteStaffError.NotFound
            });
        }
    }

    public async Task<UserRolesResponse?> GetUserRolesAsync(Guid publicId, CancellationToken ct)
    {
        await using var conn = await db.OpenAsync(DbAccess.ForSystem(), ct);
        var userId = await conn.QuerySingleOrDefaultAsync<long?>(new CommandDefinition(
            "SELECT UserId FROM auth.[User] WHERE PublicId = @publicId AND Status <> 'Deleted';", new { publicId }, cancellationToken: ct));
        return userId is null ? null : new UserRolesResponse(publicId, await GetRolesAsync(conn, userId.Value, ct));
    }
}
