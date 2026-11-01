-- Creates a staff account (Admin, Moderator, Support or PrivacyOfficer), or gives that role to an existing account
-- with the same verified email. The ONLY way the website can give anyone a staff role.
--
-- Safety rules (enforced here, in the database — not just in the API):
--   * the caller must be an active SuperAdmin: their id is read from the connection's read-only session context
--     (set by the API for the signed-in user), never from a parameter
--   * SuperAdmin (and Visitor) can't be handed out this way; super admins are set up by the database owner
--   * an existing account keeps its own password and name; only the role is added
--   * every change is recorded in audit.ChangeLog by the table triggers, with the super admin as the actor
-- Runs as the login-less user swp_staff_admin (see Security\swp_staff_admin.sql) so it can write auth.UserRole,
-- which the website login (swp_app) is otherwise denied, and the new account's rows (row-level security).
CREATE PROCEDURE [auth].[usp_CreateStaffUser]
    @Email        NVARCHAR (254),
    @FullName     NVARCHAR (60),
    @PasswordHash VARCHAR (200),      -- made by the API (PBKDF2); NULL = sign in with an emailed code only
    @RoleCode     VARCHAR (30)
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
        THROW 50010, N'Only a super admin can create staff accounts.', 1;

    DECLARE @roleId SMALLINT = (
        SELECT [RoleId] FROM [auth].[Role]
        WHERE [RoleCode] = @RoleCode AND [IsActive] = 1 AND [RoleCode] IN ('Admin', 'Moderator', 'Support', 'PrivacyOfficer'));
    IF @roleId IS NULL
        THROW 50011, N'That role can''t be given here.', 1;

    SET @Email = LOWER(LTRIM(RTRIM(@Email)));
    IF @Email IS NULL OR @Email NOT LIKE '_%@_%._%' OR LEN(@Email) > 254
        THROW 50012, N'Enter a valid email address.', 1;
    SET @FullName = NULLIF(LTRIM(RTRIM(@FullName)), N'');

    DECLARE @userId BIGINT, @publicId UNIQUEIDENTIFIER, @outcome VARCHAR (20);

    BEGIN TRANSACTION;

    -- Lock the email so two super admins adding the same person at once can't create two accounts
    SELECT @userId = [UserId], @publicId = [PublicId]
    FROM [auth].[User] WITH (UPDLOCK, HOLDLOCK)
    WHERE [Email] = @Email AND [EmailVerifiedAtUtc] IS NOT NULL AND [Status] <> 'Deleted';

    IF @userId IS NULL
    BEGIN
        DECLARE @new TABLE ([UserId] BIGINT, [PublicId] UNIQUEIDENTIFIER);
        -- The super admin vouches for the address; the person can only sign in through it (code or password)
        INSERT [auth].[User] ([SignUpMethod], [Email], [EmailVerifiedAtUtc], [FullName])
        OUTPUT inserted.[UserId], inserted.[PublicId] INTO @new
        VALUES ('Email', @Email, SYSUTCDATETIME(), @FullName);
        SELECT @userId = [UserId], @publicId = [PublicId] FROM @new;

        IF @PasswordHash IS NOT NULL
            INSERT [auth].[UserPassword] ([UserId], [PasswordHash]) VALUES (@userId, @PasswordHash);

        SET @outcome = 'Created';
    END
    ELSE IF EXISTS (SELECT 1 FROM [auth].[UserRole] WHERE [UserId] = @userId AND [RoleId] = @roleId)
        SET @outcome = 'AlreadyHadRole';
    ELSE
        SET @outcome = 'RoleAdded';

    IF @outcome <> 'AlreadyHadRole'
        INSERT [auth].[UserRole] ([UserId], [RoleId], [AssignedByUserId]) VALUES (@userId, @roleId, @actor);

    COMMIT TRANSACTION;

    SELECT @publicId AS [PublicId], @outcome AS [Outcome];
END;
GO
