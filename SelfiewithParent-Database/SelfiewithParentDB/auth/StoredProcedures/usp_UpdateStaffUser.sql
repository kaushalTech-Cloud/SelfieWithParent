-- Edits a staff account: name, sign-in email, staff role (Admin, Moderator, Support or PrivacyOfficer) and, optionally,
-- sets a new password. Same safety rules as auth.usp_CreateStaffUser / usp_DeleteStaffUser:
--   * the caller must be an active SuperAdmin (id from the read-only session context, never a parameter)
--   * a super admin can't edit themselves here, or another SuperAdmin (that stays with the database owner)
--   * an email already used by another account is refused
--   * every change is recorded in audit.ChangeLog by the table triggers, with the super admin as the actor
-- Returns the account's internal id and whether the role changed (the API then signs them out, so the new role applies
-- at once). Runs as the login-less user swp_staff_admin (see Security\swp_staff_admin.sql).
CREATE PROCEDURE [auth].[usp_UpdateStaffUser]
    @PublicId     UNIQUEIDENTIFIER,
    @Email        NVARCHAR (254),
    @FullName     NVARCHAR (60),
    @RoleCode     VARCHAR (30),
    @PasswordHash VARCHAR (200)       -- made by the API (PBKDF2); NULL = keep the current password
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @actor IS NULL OR NOT EXISTS (
        SELECT 1
        FROM [auth].[UserRole] AS ur
        JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
        JOIN [auth].[User] AS u ON u.[UserId] = ur.[UserId]
        WHERE ur.[UserId] = @actor AND r.[RoleCode] = 'SuperAdmin' AND r.[IsActive] = 1 AND u.[Status] = 'Active'
          AND (ur.[ExpiresAtUtc] IS NULL OR ur.[ExpiresAtUtc] > SYSUTCDATETIME()))
        THROW 50010, N'Only a super admin can edit staff accounts.', 1;

    DECLARE @roleId SMALLINT = (
        SELECT [RoleId] FROM [auth].[Role]
        WHERE [RoleCode] = @RoleCode AND [IsActive] = 1 AND [RoleCode] IN ('Admin', 'Moderator', 'Support', 'PrivacyOfficer'));
    IF @roleId IS NULL
        THROW 50011, N'That role can''t be given here.', 1;

    SET @Email = LOWER(LTRIM(RTRIM(@Email)));
    IF @Email IS NULL OR @Email NOT LIKE '_%@_%._%' OR LEN(@Email) > 254
        THROW 50012, N'Enter a valid email address.', 1;
    SET @FullName = NULLIF(LTRIM(RTRIM(@FullName)), N'');

    BEGIN TRANSACTION;

    DECLARE @userId BIGINT, @oldEmail NVARCHAR (254);
    SELECT @userId = u.[UserId], @oldEmail = u.[Email]
    FROM [auth].[User] AS u WITH (UPDLOCK, HOLDLOCK)
    WHERE u.[PublicId] = @PublicId AND u.[Status] <> 'Deleted'
      AND EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
                  WHERE ur.[UserId] = u.[UserId] AND r.[RoleCode] IN ('SuperAdmin', 'Admin', 'Moderator', 'Support', 'PrivacyOfficer'));

    -- Refusals roll back first, so the caller's connection is never left with an open transaction
    IF @userId IS NULL
    BEGIN ROLLBACK TRANSACTION; THROW 50013, N'That staff member wasn''t found.', 1; END
    IF @userId = @actor
    BEGIN ROLLBACK TRANSACTION; THROW 50014, N'You can''t edit your own account here.', 1; END
    IF EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
               WHERE ur.[UserId] = @userId AND r.[RoleCode] = 'SuperAdmin')
    BEGIN ROLLBACK TRANSACTION; THROW 50015, N'A super admin can''t be edited here.', 1; END
    IF EXISTS (SELECT 1 FROM [auth].[User] WITH (UPDLOCK, HOLDLOCK)
               WHERE [Email] = @Email AND [EmailVerifiedAtUtc] IS NOT NULL AND [Status] <> 'Deleted' AND [UserId] <> @userId)
    BEGIN ROLLBACK TRANSACTION; THROW 50016, N'That email is already used by another account.', 1; END

    -- Name and sign-in email (a changed email is vouched for by the super admin, as when creating staff)
    UPDATE [auth].[User]
       SET [FullName] = @FullName,
           [Email] = @Email,
           [EmailVerifiedAtUtc] = IIF(ISNULL([Email], N'') = @Email AND [EmailVerifiedAtUtc] IS NOT NULL, [EmailVerifiedAtUtc], SYSUTCDATETIME()),
           [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [UserId] = @userId
       AND (ISNULL([FullName], N'') <> ISNULL(@FullName, N'') OR ISNULL([Email], N'') <> @Email OR [EmailVerifiedAtUtc] IS NULL);

    -- Exactly one staff role: drop the others, add the chosen one
    DECLARE @roleChanged BIT = IIF(EXISTS (SELECT 1 FROM [auth].[UserRole] WHERE [UserId] = @userId AND [RoleId] = @roleId)
        AND NOT EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
                        WHERE ur.[UserId] = @userId AND ur.[RoleId] <> @roleId AND r.[RoleCode] IN ('Admin', 'Moderator', 'Support', 'PrivacyOfficer')), 0, 1);
    IF @roleChanged = 1
    BEGIN
        DELETE ur FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
         WHERE ur.[UserId] = @userId AND ur.[RoleId] <> @roleId AND r.[RoleCode] IN ('Admin', 'Moderator', 'Support', 'PrivacyOfficer');
        IF NOT EXISTS (SELECT 1 FROM [auth].[UserRole] WHERE [UserId] = @userId AND [RoleId] = @roleId)
            INSERT [auth].[UserRole] ([UserId], [RoleId], [AssignedByUserId]) VALUES (@userId, @roleId, @actor);
    END

    -- Optional new password (clears any lock-out)
    IF @PasswordHash IS NOT NULL
    BEGIN
        UPDATE [auth].[UserPassword]
           SET [PasswordHash] = @PasswordHash, [FailedAttempts] = 0, [LockedUntilUtc] = NULL, [UpdatedAtUtc] = SYSUTCDATETIME()
         WHERE [UserId] = @userId;
        IF @@ROWCOUNT = 0
            INSERT [auth].[UserPassword] ([UserId], [PasswordHash]) VALUES (@userId, @PasswordHash);
    END

    COMMIT TRANSACTION;

    SELECT @userId AS [UserId], @roleChanged AS [RoleChanged];
END;
GO
