-- Internal identity that auth.usp_CreateStaffUser runs as (WITH EXECUTE AS 'swp_staff_admin').
-- It has NO login, so nobody can sign in as it, and nobody is granted IMPERSONATE on it: the only way to act as it
-- is to run that one procedure, which first checks in the database that the caller is an active super admin.
-- Row-level security (security.fn_UserRowAccess) lets this identity write rows for a new account.
-- It needs no table permissions of its own: the procedure and the tables share an owner (ownership chaining).
CREATE USER [swp_staff_admin] WITHOUT LOGIN;
GO
-- Needed to act inside the database at all (the project model doesn't grant it automatically)
GRANT CONNECT TO [swp_staff_admin];
GO
