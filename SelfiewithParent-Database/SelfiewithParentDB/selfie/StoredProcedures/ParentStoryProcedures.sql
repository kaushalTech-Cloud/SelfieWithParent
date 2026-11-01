-- Parents' Voices: the only ways the website can create, review or send love to a parent's story.
-- Errors 50050-50059 are shown to the user.

-- An APPROVED parent's story and how much love it has. Used by selfie.usp_SetParentStoryLove, which runs as the visitor:
-- row-level security would hide another visitor's story from a direct query, so this runs as the login-less user
-- swp_staff_admin and returns only the id and the count — nothing personal.
CREATE FUNCTION [selfie].[fn_ApprovedParentStory] (@PublicId UNIQUEIDENTIFIER)
RETURNS @r TABLE ([StoryId] BIGINT, [Loves] INT)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    INSERT @r
    SELECT s.[StoryId], (SELECT COUNT(*) FROM [selfie].[ParentStoryLove] AS l WHERE l.[StoryId] = s.[StoryId])
    FROM [selfie].[ParentStory] AS s
    WHERE s.[PublicId] = @PublicId AND s.[Status] = 'Approved';
    RETURN;
END;
GO

-- A signed-in visitor shares a parent's story (their own, or one they write with the parent's agreement), with an
-- optional photo, video and voice note. The owner is the session-context UserId (never a parameter); it always starts as
-- 'Pending'. Story and files are saved together or not at all. Runs as the caller (row-level security).
CREATE PROCEDURE [selfie].[usp_CreateParentStory]
    @WrittenBy      VARCHAR (10),
    @ParentRole     VARCHAR (10),
    @ShownName      NVARCHAR (60),     -- NULL: anonymous ("A mother from …")
    @Age            TINYINT,
    @CountryCode    CHAR (2),
    @StateName      NVARCHAR (60),
    @City           NVARCHAR (60),
    @Title          NVARCHAR (120),
    @Story          NVARCHAR (3000),
    @Wish           NVARCHAR (300),
    @PhotoType      VARCHAR (20) = NULL,
    @PhotoData      VARBINARY (MAX) = NULL,
    @PhotoName      NVARCHAR (150) = NULL,
    @VideoType      VARCHAR (20) = NULL,
    @VideoData      VARBINARY (MAX) = NULL,
    @VideoName      NVARCHAR (150) = NULL,
    @VoiceType      VARCHAR (20) = NULL,
    @VoiceData      VARBINARY (MAX) = NULL,
    @VoiceName      NVARCHAR (150) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50050, N'Please sign in again.', 1;
    SET @Title = NULLIF(LTRIM(RTRIM(@Title)), N'');
    SET @Story = NULLIF(LTRIM(RTRIM(@Story)), N'');
    IF @Title IS NULL OR LEN(@Title) < 3
        THROW 50052, N'Give the story a short title.', 1;
    IF @Story IS NULL OR LEN(@Story) < 40
        THROW 50052, N'Please write a little more of the story (at least 40 characters).', 1;
    -- A few stories a day per account is plenty; this stops a script from filling the database
    IF (SELECT COUNT(*) FROM [selfie].[ParentStory] WHERE [UserId] = @me AND [CreatedAtUtc] > DATEADD(DAY, -1, SYSUTCDATETIME())) >= 5
        THROW 50053, N'You''ve shared 5 stories today. Please try again tomorrow.', 1;

    DECLARE @new TABLE ([StoryId] BIGINT, [PublicId] UNIQUEIDENTIFIER);
    BEGIN TRY
        BEGIN TRANSACTION;
        INSERT [selfie].[ParentStory] ([UserId], [WrittenBy], [ParentRole], [ShownName], [Age], [CountryCode], [StateName], [City],
            [Title], [Story], [Wish], [ConsentedAtUtc])
        OUTPUT inserted.[StoryId], inserted.[PublicId] INTO @new
        VALUES (@me, @WrittenBy, @ParentRole, NULLIF(LTRIM(RTRIM(@ShownName)), N''), @Age, @CountryCode,
            NULLIF(LTRIM(RTRIM(@StateName)), N''), NULLIF(LTRIM(RTRIM(@City)), N''), @Title, @Story, NULLIF(LTRIM(RTRIM(@Wish)), N''),
            SYSUTCDATETIME());

        INSERT [selfie].[ParentStoryFile] ([StoryId], [UserId], [Role], [ContentType], [FileName], [Data], [SizeBytes])
        SELECT n.[StoryId], @me, f.[Role], f.[ContentType], f.[FileName], f.[Data], DATALENGTH(f.[Data])
        FROM @new AS n
        CROSS APPLY (VALUES ('main', @PhotoType, @PhotoName, @PhotoData), ('video', @VideoType, @VideoName, @VideoData),
                            ('voice', @VoiceType, @VoiceName, @VoiceData)) AS f ([Role], [ContentType], [FileName], [Data])
        WHERE f.[Data] IS NOT NULL;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;

    SELECT n.[PublicId], CONCAT('PV-', RIGHT(CONCAT('000000', n.[StoryId]), 6)) AS [Reference] FROM @new AS n;
END;
GO

-- Staff approve / reject a parent's story (or put it back to pending), and feature it at the top of Parents' Voices.
-- Super admins, admins and moderators; the role is checked here again.
CREATE PROCEDURE [selfie].[usp_ReviewParentStory]
    @PublicId UNIQUEIDENTIFIER,
    @Status   VARCHAR (10),
    @Note     NVARCHAR (300),
    @Featured BIT = NULL          -- NULL: leave as it is
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin', 'Moderator'))
        THROW 50054, N'Only a super admin, admin or moderator can review stories.', 1;
    IF @Status NOT IN ('Approved', 'Rejected', 'Pending')
        THROW 50052, N'Choose approve or reject.', 1;
    SET @Note = NULLIF(LTRIM(RTRIM(@Note)), N'');
    IF @Status = 'Rejected' AND (@Note IS NULL OR LEN(@Note) < 5)
        THROW 50052, N'Give a reason (at least 5 characters) when rejecting.', 1;
    IF @Featured = 1 AND @Status <> 'Approved'
        THROW 50052, N'Only an approved story can be featured.', 1;
    IF NOT EXISTS (SELECT 1 FROM [selfie].[ParentStory] WHERE [PublicId] = @PublicId)
        THROW 50051, N'That story wasn''t found.', 1;

    UPDATE [selfie].[ParentStory]
       SET [Status] = @Status,
           [ReviewNote] = IIF(@Status = 'Pending', NULL, @Note),
           [ReviewedByUserId] = IIF(@Status = 'Pending', NULL, @actor),
           [ReviewedAtUtc] = IIF(@Status = 'Pending', NULL, SYSUTCDATETIME()),
           [IsFeatured] = IIF(@Status = 'Approved', COALESCE(@Featured, [IsFeatured]), 0)
     WHERE [PublicId] = @PublicId;

    SELECT [UserId], CONCAT('PV-', RIGHT(CONCAT('000000', [StoryId]), 6)) AS [Reference] FROM [selfie].[ParentStory] WHERE [PublicId] = @PublicId;
END;
GO

-- A signed-in visitor sends (or takes back) their love on an approved story. Their own row only (row-level security).
-- Returns the story's love count.
CREATE PROCEDURE [selfie].[usp_SetParentStoryLove]
    @PublicId UNIQUEIDENTIFIER,
    @Loved    BIT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50050, N'Please sign in again.', 1;
    DECLARE @id BIGINT = (SELECT [StoryId] FROM [selfie].[fn_ApprovedParentStory](@PublicId));
    IF @id IS NULL
        THROW 50051, N'That story isn''t on Parents'' Voices.', 1;
    IF @Loved = 1 AND NOT EXISTS (SELECT 1 FROM [selfie].[ParentStoryLove] WHERE [StoryId] = @id AND [UserId] = @me)
        INSERT [selfie].[ParentStoryLove] ([StoryId], [UserId]) VALUES (@id, @me);
    IF @Loved = 0
        DELETE [selfie].[ParentStoryLove] WHERE [StoryId] = @id AND [UserId] = @me;
    SELECT [Loves] FROM [selfie].[fn_ApprovedParentStory](@PublicId);
END;
GO

-- Records every parent's story created, reviewed or removed in audit.ChangeLog (who did what, never the story itself).
CREATE TRIGGER [selfie].[trg_ParentStory_Audit]
    ON [selfie].[ParentStory]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'selfie.ParentStory', COALESCE(i.[StoryId], d.[StoryId]),
           CASE WHEN d.[StoryId] IS NULL THEN 'I' WHEN i.[StoryId] IS NULL THEN 'D' ELSE 'U' END,
           CASE WHEN d.[StoryId] IS NULL THEN CONCAT(N'WrittenBy=', i.[WrittenBy])
                WHEN i.[StoryId] IS NOT NULL AND i.[Status] <> d.[Status] THEN CONCAT(N'Status=', i.[Status], N',was=', d.[Status])
                WHEN i.[StoryId] IS NOT NULL AND i.[IsFeatured] <> d.[IsFeatured] THEN CONCAT(N'IsFeatured=', i.[IsFeatured]) END,
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[StoryId] = i.[StoryId];
END;
GO
