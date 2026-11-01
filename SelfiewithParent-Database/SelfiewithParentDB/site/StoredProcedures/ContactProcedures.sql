-- The website's contact form and its inbox in the admin site. Errors 50020-50029 are shown to the user.

-- Anyone sends a message with the contact form (the API calls this in System scope for visitors who aren't signed in,
-- or as the signed-in visitor). Spam limits: 3 messages per email address per hour, 300 per hour in all.
CREATE PROCEDURE [site].[usp_SendContactMessage]
    @Name    NVARCHAR (60),
    @Email   NVARCHAR (254),
    @Subject NVARCHAR (100),
    @Message NVARCHAR (1000)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    SET @Name = NULLIF(LTRIM(RTRIM(@Name)), N'');
    SET @Email = LOWER(NULLIF(LTRIM(RTRIM(@Email)), N''));
    SET @Subject = NULLIF(LTRIM(RTRIM(@Subject)), N'');
    SET @Message = NULLIF(LTRIM(RTRIM(@Message)), N'');
    IF @Name IS NULL OR @Email IS NULL OR @Message IS NULL
        THROW 50023, N'Please fill in your name, email and message.', 1;
    IF (SELECT COUNT(*) FROM [site].[ContactMessage] WHERE [Email] = @Email AND [CreatedAtUtc] > DATEADD(HOUR, -1, SYSUTCDATETIME())) >= 3
        OR (SELECT COUNT(*) FROM [site].[ContactMessage] WHERE [CreatedAtUtc] > DATEADD(HOUR, -1, SYSUTCDATETIME())) >= 300
        THROW 50026, N'Thanks — we already have your message. Please try again in an hour.', 1;
    DECLARE @new TABLE ([PublicId] UNIQUEIDENTIFIER);
    INSERT [site].[ContactMessage] ([Name], [Email], [Subject], [Message], [UserId])
    OUTPUT inserted.[PublicId] INTO @new
    VALUES (@Name, @Email, @Subject, @Message, IIF(EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me), @me, NULL));
    SELECT [PublicId] FROM @new;
END;
GO

-- A super admin / admin marks a message Read, back to New, or Archived.
CREATE PROCEDURE [site].[usp_SetContactMessageStatus]
    @PublicId UNIQUEIDENTIFIER,
    @Status   VARCHAR (10)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage messages.', 1;
    IF @Status NOT IN ('New', 'Read', 'Archived')
        THROW 50023, N'Choose New, Read or Archived.', 1;
    UPDATE [site].[ContactMessage]
       SET [Status] = @Status,
           [ReadAtUtc] = IIF(@Status = 'New', NULL, ISNULL([ReadAtUtc], SYSUTCDATETIME())),
           [ReadByUserId] = IIF(@Status = 'New', NULL, ISNULL([ReadByUserId], @actor))
     WHERE [PublicId] = @PublicId;
    IF @@ROWCOUNT = 0
        THROW 50025, N'That message wasn''t found.', 1;
END;
GO
