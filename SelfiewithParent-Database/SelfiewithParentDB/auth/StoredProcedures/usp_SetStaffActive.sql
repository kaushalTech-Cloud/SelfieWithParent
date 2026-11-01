-- Makes a staff account active or inactive. Inactive = Status 'Suspended': every sign-in (code, password, Google)
-- and every session refresh is refused until it is made active again. Nothing is deleted.
-- Same safety rules as the other staff procedures:
--   * the caller must be an active SuperAdmin (id from the read-only session context, never a parameter)
--   * a super admin can't deactivate themselves, or another SuperAdmin
--   * recorded in audit.ChangeLog by the table trigger, with the super admin as the actor
-- Returns the account's internal id (the API signs a deactivated account out everywhere).
-- Runs as the login-less user swp_staff_admin (see Security\swp_staff_admin.sql).
CREATE PROCEDURE [auth].[usp_SetStaffActive]
    @PublicId UNIQUEIDENTIFIER,
    @IsActive BIT
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
        THROW 50010, N'Only a super admin can change a staff member''s status.', 1;

    BEGIN TRANSACTION;

    DECLARE @userId BIGINT = (
        SELECT u.[UserId] FROM [auth].[User] AS u WITH (UPDLOCK, HOLDLOCK)
        WHERE u.[PublicId] = @PublicId AND u.[Status] IN ('Active', 'Suspended')
          AND EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
                      WHERE ur.[UserId] = u.[UserId] AND r.[RoleCode] IN ('SuperAdmin', 'Admin', 'Moderator', 'Support', 'PrivacyOfficer')));

    IF @userId IS NULL
    BEGIN ROLLBACK TRANSACTION; THROW 50013, N'That staff member wasn''t found.', 1; END
    IF @userId = @actor
    BEGIN ROLLBACK TRANSACTION; THROW 50014, N'You can''t make your own account inactive.', 1; END
    IF EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
               WHERE ur.[UserId] = @userId AND r.[RoleCode] = 'SuperAdmin')
    BEGIN ROLLBACK TRANSACTION; THROW 50015, N'A super admin''s status can''t be changed here.', 1; END

    UPDATE [auth].[User]
       SET [Status] = IIF(@IsActive = 1, 'Active', 'Suspended'), [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [UserId] = @userId AND [Status] <> IIF(@IsActive = 1, 'Active', 'Suspended');

    COMMIT TRANSACTION;

    SELECT @userId AS [UserId];
END;
GO
