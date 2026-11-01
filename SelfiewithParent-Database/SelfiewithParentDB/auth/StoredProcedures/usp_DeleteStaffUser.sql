-- Deletes a staff account (Admin, Moderator, Support or PrivacyOfficer) — the same way visitors delete their own
-- account: personal data is cleared, the password and roles are removed, and the account can never sign in again.
--
-- Safety rules (enforced here, in the database — not just in the API):
--   * the caller must be an active SuperAdmin (id from the connection's read-only session context, never a parameter)
--   * a super admin can't delete themselves, and can't delete another SuperAdmin (that stays with the database owner)
--   * only accounts that hold a staff role can be deleted here (visitors delete their own accounts)
--   * every change is recorded in audit.ChangeLog by the table triggers, with the super admin as the actor
-- Returns the deleted account's internal id so the API can sign it out everywhere.
-- Runs as the login-less user swp_staff_admin (see Security\swp_staff_admin.sql), like auth.usp_CreateStaffUser.
CREATE PROCEDURE [auth].[usp_DeleteStaffUser]
    @PublicId UNIQUEIDENTIFIER
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
        THROW 50010, N'Only a super admin can delete staff accounts.', 1;

    BEGIN TRANSACTION;

    DECLARE @userId BIGINT = (
        SELECT u.[UserId] FROM [auth].[User] AS u WITH (UPDLOCK, HOLDLOCK)
        WHERE u.[PublicId] = @PublicId AND u.[Status] <> 'Deleted'
          AND EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
                      WHERE ur.[UserId] = u.[UserId] AND r.[RoleCode] IN ('SuperAdmin', 'Admin', 'Moderator', 'Support', 'PrivacyOfficer')));
    -- Refusals roll back first, so the caller's connection is never left with an open transaction
    IF @userId IS NULL
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50013, N'That staff member wasn''t found.', 1;
    END
    IF @userId = @actor
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50014, N'You can''t delete your own account here.', 1;
    END
    IF EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
               WHERE ur.[UserId] = @userId AND r.[RoleCode] = 'SuperAdmin')
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50015, N'A super admin can''t be deleted here.', 1;
    END

    DELETE [auth].[UserRole] WHERE [UserId] = @userId;
    DELETE [auth].[ProfilePhoto] WHERE [UserId] = @userId;   -- their photo goes with their details

    UPDATE [auth].[UserPassword]
       SET [PasswordHash] = NULL, [FailedAttempts] = 0, [LockedUntilUtc] = NULL, [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [UserId] = @userId;

    UPDATE [auth].[User]
       SET [MobileCountryCode] = NULL, [MobileNumber] = NULL, [MobileVerifiedAtUtc] = NULL,
           [Email] = NULL, [EmailVerifiedAtUtc] = NULL, [GoogleSubjectId] = NULL,
           [FullName] = NULL, [StateName] = NULL, [City] = NULL,
           [WhatsAppOptIn] = 0, [WhatsAppOptInAtUtc] = NULL,
           [Status] = 'Deleted', [DeletedAtUtc] = SYSUTCDATETIME(), [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [UserId] = @userId;

    COMMIT TRANSACTION;

    SELECT @userId AS [UserId];
END;
GO
