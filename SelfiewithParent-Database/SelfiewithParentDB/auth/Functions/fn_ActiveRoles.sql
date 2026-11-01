-- The roles an ACTIVE account currently holds (expired grants and switched-off roles are left out).
-- Used by the locked-down procedures to check who is calling, e.g.
--     IF NOT EXISTS (SELECT 1 FROM auth.fn_ActiveRoles(@actor) WHERE RoleCode IN ('SuperAdmin', 'Admin')) THROW ...
CREATE FUNCTION [auth].[fn_ActiveRoles] (@UserId BIGINT)
RETURNS TABLE
AS
RETURN
    SELECT r.[RoleCode]
    FROM [auth].[UserRole] AS ur
    JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
    JOIN [auth].[User] AS u ON u.[UserId] = ur.[UserId]
    WHERE ur.[UserId] = @UserId
      AND r.[IsActive] = 1
      AND u.[Status] = 'Active'
      AND (ur.[ExpiresAtUtc] IS NULL OR ur.[ExpiresAtUtc] > SYSUTCDATETIME());
