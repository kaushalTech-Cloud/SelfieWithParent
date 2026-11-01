-- Makes a VISITOR account active or inactive (Status 'Suspended': every sign-in and session refresh is refused),
-- with a reason that is kept in auth.AccountStatusChange and emailed to the visitor by the API.
-- Safety rules (enforced here, in the database — not just in the API):
--   * the caller must be an active SuperAdmin (id from the read-only session context, never a parameter)
--   * only accounts WITHOUT a staff role (staff are managed on the Staff page)
--   * a reason of at least 10 characters is required
-- Returns the visitor's internal id, so the API can sign them out and email them.
-- Runs as the login-less user swp_staff_admin (see Security\swp_staff_admin.sql).
CREATE PROCEDURE [auth].[usp_SetVisitorActive]
    @PublicId UNIQUEIDENTIFIER,
    @IsActive BIT,
    @Reason   NVARCHAR (500)
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
        THROW 50010, N'Only a super admin can change a visitor''s status.', 1;

    SET @Reason = LTRIM(RTRIM(@Reason));
    IF @Reason IS NULL OR LEN(@Reason) < 10
        THROW 50017, N'Give a reason of at least 10 characters.', 1;

    DECLARE @newStatus VARCHAR (13) = IIF(@IsActive = 1, 'Active', 'Suspended');

    BEGIN TRANSACTION;

    DECLARE @userId BIGINT, @status VARCHAR (13);
    SELECT @userId = u.[UserId], @status = u.[Status]
    FROM [auth].[User] AS u WITH (UPDLOCK, HOLDLOCK)
    WHERE u.[PublicId] = @PublicId AND u.[Status] IN ('Active', 'Suspended')
      AND NOT EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur JOIN [auth].[Role] AS r ON r.[RoleId] = ur.[RoleId]
                      WHERE ur.[UserId] = u.[UserId] AND r.[RoleCode] <> 'Visitor');

    -- Refusals roll back first, so the caller's connection is never left with an open transaction
    IF @userId IS NULL
    BEGIN ROLLBACK TRANSACTION; THROW 50013, N'That visitor wasn''t found.', 1; END
    IF @status = @newStatus
    BEGIN ROLLBACK TRANSACTION; THROW 50018, N'The account already has that status.', 1; END

    UPDATE [auth].[User] SET [Status] = @newStatus, [UpdatedAtUtc] = SYSUTCDATETIME() WHERE [UserId] = @userId;

    INSERT [auth].[AccountStatusChange] ([UserId], [NewStatus], [Reason], [ChangedByUserId])
    VALUES (@userId, @newStatus, @Reason, @actor);

    COMMIT TRANSACTION;

    -- Only the id: personal data stays masked for swp_staff_admin, so the API reads the contact details itself
    SELECT @userId AS [UserId];
END;
GO
