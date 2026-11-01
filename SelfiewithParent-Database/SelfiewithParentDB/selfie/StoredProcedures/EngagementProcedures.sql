-- Bringing visitors back: likes, family date reminders and the reminder job's log. Errors 50030-50039 are shown to the user.

-- A signed-in visitor likes (or unlikes) an approved selfie / photo frame. Their own like only (session-context UserId;
-- row-level security). Returns the submission's like count.
CREATE PROCEDURE [selfie].[usp_SetLike]
    @PublicId UNIQUEIDENTIFIER,
    @Liked    BIT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50030, N'Please sign in again.', 1;
    -- The selfie belongs to someone else, so look it up in a way row-level security allows: through its public view
    DECLARE @id BIGINT = (SELECT [SubmissionId] FROM [selfie].[fn_ApprovedSubmission](@PublicId));
    IF @id IS NULL
        THROW 50031, N'That selfie isn''t in the gallery.', 1;
    IF @Liked = 1 AND NOT EXISTS (SELECT 1 FROM [selfie].[SubmissionLike] WHERE [SubmissionId] = @id AND [UserId] = @me)
        INSERT [selfie].[SubmissionLike] ([SubmissionId], [UserId]) VALUES (@id, @me);
    IF @Liked = 0
        DELETE [selfie].[SubmissionLike] WHERE [SubmissionId] = @id AND [UserId] = @me;
    SELECT [Likes] FROM [selfie].[fn_ApprovedSubmission](@PublicId);
END;
GO

-- A signed-in visitor adds (@PublicId NULL) or changes one of their family dates. Up to 20 per account.
-- Returns the date's public id.
CREATE PROCEDURE [selfie].[usp_SaveFamilyDate]
    @PublicId  UNIQUEIDENTIFIER,
    @Name      NVARCHAR (60),
    @Relation  VARCHAR (20),
    @Occasion  VARCHAR (12),
    @DateMonth TINYINT,
    @DateDay   TINYINT,
    @DateYear  SMALLINT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50030, N'Please sign in again.', 1;
    SET @Name = NULLIF(LTRIM(RTRIM(@Name)), N'');
    IF @Name IS NULL
        THROW 50032, N'Add their name.', 1;
    IF @DateYear IS NOT NULL AND @DateYear > YEAR(SYSUTCDATETIME())
        THROW 50032, N'The year can''t be in the future.', 1;
    IF @PublicId IS NULL
    BEGIN
        IF (SELECT COUNT(*) FROM [selfie].[FamilyDate] WHERE [UserId] = @me) >= 20
            THROW 50039, N'You can save up to 20 family dates.', 1;
        DECLARE @new TABLE ([PublicId] UNIQUEIDENTIFIER);
        INSERT [selfie].[FamilyDate] ([UserId], [Name], [Relation], [Occasion], [DateMonth], [DateDay], [DateYear])
        OUTPUT inserted.[PublicId] INTO @new
        VALUES (@me, @Name, @Relation, @Occasion, @DateMonth, @DateDay, @DateYear);
        SELECT [PublicId] FROM @new;
        RETURN;
    END;
    UPDATE [selfie].[FamilyDate]
       SET [Name] = @Name, [Relation] = @Relation, [Occasion] = @Occasion, [DateMonth] = @DateMonth, [DateDay] = @DateDay,
           [DateYear] = @DateYear, [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [PublicId] = @PublicId AND [UserId] = @me;
    IF @@ROWCOUNT = 0
        THROW 50031, N'That date wasn''t found.', 1;
    SELECT @PublicId AS [PublicId];
END;
GO

-- A signed-in visitor removes one of their family dates.
CREATE PROCEDURE [selfie].[usp_DeleteFamilyDate]
    @PublicId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL
        THROW 50030, N'Please sign in again.', 1;
    DELETE [selfie].[FamilyDate] WHERE [PublicId] = @PublicId AND [UserId] = @me;
    IF @@ROWCOUNT = 0
        THROW 50031, N'That date wasn''t found.', 1;
END;
GO

-- A visitor's reminder choices: from My account (signed in), or from the "switch off" link in a reminder email (the API
-- checks the link's signature and then calls this for that account).
CREATE PROCEDURE [selfie].[usp_SetReminderSettings]
    @EmailReminders BIT,
    @ThenNowNudges  BIT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL
        THROW 50030, N'Please sign in again.', 1;
    UPDATE [selfie].[ReminderSetting]
       SET [EmailReminders] = @EmailReminders, [ThenNowNudges] = @ThenNowNudges, [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [UserId] = @me;
    IF @@ROWCOUNT = 0
        INSERT [selfie].[ReminderSetting] ([UserId], [EmailReminders], [ThenNowNudges]) VALUES (@me, @EmailReminders, @ThenNowNudges);
END;
GO

-- The background reminder job claims a reminder before sending it (System scope only). Returns 1 when it was claimed now
-- (send it), 0 when it was already sent. @Release = 1 gives a claim back when the email couldn't be sent (tried again later).
CREATE PROCEDURE [selfie].[usp_LogReminder]
    @UserId  BIGINT,
    @Kind    VARCHAR (10),
    @RefId   BIGINT,
    @ForDate DATE,
    @Release BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20)), N'') <> N'System'
        THROW 50034, N'Only the reminder job can log reminders.', 1;
    IF @Release = 1
    BEGIN
        DELETE [selfie].[ReminderLog] WHERE [UserId] = @UserId AND [Kind] = @Kind AND [RefId] = @RefId AND [ForDate] = @ForDate;
        SELECT CAST(0 AS BIT) AS [Claimed];
        RETURN;
    END;
    BEGIN TRY
        INSERT [selfie].[ReminderLog] ([UserId], [Kind], [RefId], [ForDate]) VALUES (@UserId, @Kind, @RefId, @ForDate);
        SELECT CAST(1 AS BIT) AS [Claimed];
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627) SELECT CAST(0 AS BIT) AS [Claimed];   -- already sent (or being sent)
        ELSE THROW;
    END CATCH;
END;
GO
