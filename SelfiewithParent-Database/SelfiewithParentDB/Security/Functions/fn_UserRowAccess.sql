-- Row-level security rule for visitor-owned rows.
-- The app sets, at the start of every request (read-only, so it can't be changed later on that connection):
--     EXEC sp_set_session_context N'UserId', <signed-in UserId>, @read_only = 1;
-- or, only for sign-in / registration lookups and background jobs:
--     EXEC sp_set_session_context N'AccessScope', N'System', @read_only = 1;
-- A row is visible / changeable when it belongs to the signed-in visitor, the request is a System job,
-- or the caller is support / privacy officer / database owner, or auth.usp_CreateStaffUser (which runs as the
-- login-less user swp_staff_admin, only after checking that the caller is a super admin).
CREATE FUNCTION [security].[fn_UserRowAccess] (@UserId BIGINT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS [AccessGranted]
    WHERE @UserId = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT)
       OR CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20)) = N'System'
       OR IS_MEMBER(N'swp_support') = 1
       OR IS_MEMBER(N'swp_privacy_officer') = 1
       OR IS_MEMBER(N'db_owner') = 1
       OR USER_NAME() = N'swp_staff_admin';
