-- Selfie submissions: the only ways the website can create or review them. Errors 50030-50039 are shown to the user.

-- A signed-in visitor shares a photo and / or video (and, with a photo, an optional voice note). The owner is the read-only session-context UserId (never a
-- parameter) and the status always starts as 'Pending'. Submission and files are saved together or not at all.
-- Runs as the caller: row-level security only lets it write rows for that account.
CREATE PROCEDURE [selfie].[usp_CreateSubmission]
    @Kind           VARCHAR (10),
    @YourName       NVARCHAR (60),
    @ParentName     NVARCHAR (60),
    @Relation       VARCHAR (20),
    @FamilySize     VARCHAR (5),
    @Generations    VARCHAR (2),
    @MemoryYear     SMALLINT,
    @CountryCode    CHAR (2),
    @StateName      NVARCHAR (60),
    @City           NVARCHAR (60),
    @IsAdult        BIT,
    @GuardianName   NVARCHAR (60),
    @GuardianMobile VARCHAR (20),
    @Message        NVARCHAR (300),
    @MainType       VARCHAR (20),      -- photo (NULL when only a video is shared)
    @MainData       VARBINARY (MAX),
    @MainName       NVARCHAR (150),
    @SourceType     VARCHAR (20),      -- 'ai' only, optional
    @SourceData     VARBINARY (MAX),
    @SourceName     NVARCHAR (150),
    @VideoType      VARCHAR (20),      -- video (NULL when only a photo is shared)
    @VideoData      VARBINARY (MAX),
    @VideoName      NVARCHAR (150),
    @VoiceType      VARCHAR (20) = NULL,   -- optional voice note: only with a photo, not with a video or a family share
    @VoiceData      VARBINARY (MAX) = NULL,
    @VoiceName      NVARCHAR (150) = NULL,
    @ThenType       VARCHAR (20) = NULL,   -- 'thennow' only: the old photo (the main photo is the same picture today)
    @ThenData       VARBINARY (MAX) = NULL,
    @ThenName       NVARCHAR (150) = NULL,
    @ThenYear       SMALLINT = NULL,
    @NowYear        SMALLINT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50030, N'Please sign in again.', 1;
    IF @MainData IS NULL AND @VideoData IS NULL
        THROW 50032, N'Add a photo or a video.', 1;
    IF @Kind <> 'family' AND @MainData IS NOT NULL AND @VideoData IS NOT NULL
        THROW 50032, N'Share a photo or a video (only family submissions can have both).', 1;
    IF @SourceData IS NOT NULL AND (@Kind <> 'ai' OR @MainData IS NULL)
        THROW 50032, N'An original photo can only go with an AI-made photo.', 1;
    IF @Kind = 'thennow' AND (@MainData IS NULL OR @ThenData IS NULL OR @VideoData IS NOT NULL)
        THROW 50032, N'Then & Now needs the old photo and the new photo.', 1;
    IF @ThenData IS NOT NULL AND @Kind <> 'thennow'
        THROW 50032, N'An old photo only goes with Then & Now.', 1;
    IF @VoiceData IS NOT NULL AND (@MainData IS NULL OR @VideoData IS NOT NULL OR @Kind = 'family')
        THROW 50032, N'A voice note can only go with a photo or an AI-made photo.', 1;
    -- A few submissions a day per account is plenty; this stops a script from filling the database
    IF (SELECT COUNT(*) FROM [selfie].[Submission] WHERE [UserId] = @me AND [CreatedAtUtc] > DATEADD(DAY, -1, SYSUTCDATETIME())) >= 10
        THROW 50033, N'You''ve shared 10 times today. Please try again tomorrow.', 1;

    DECLARE @new TABLE ([SubmissionId] BIGINT, [PublicId] UNIQUEIDENTIFIER);
    BEGIN TRY
        BEGIN TRANSACTION;
        INSERT [selfie].[Submission] ([UserId], [Kind], [YourName], [ParentName], [Relation], [FamilySize], [Generations], [MemoryYear],
            [CountryCode], [StateName], [City], [IsAdult], [GuardianName], [GuardianMobile], [Message], [ConsentedAtUtc], [ThenYear], [NowYear])
        OUTPUT inserted.[SubmissionId], inserted.[PublicId] INTO @new
        VALUES (@me, @Kind, @YourName, @ParentName, @Relation, @FamilySize, @Generations, @MemoryYear,
            @CountryCode, @StateName, @City, @IsAdult, @GuardianName, @GuardianMobile, @Message, SYSUTCDATETIME(),
            IIF(@Kind = 'thennow', @ThenYear, NULL), IIF(@Kind = 'thennow', @NowYear, NULL));

        INSERT [selfie].[SubmissionFile] ([SubmissionId], [UserId], [Role], [ContentType], [FileName], [Data], [SizeBytes])
        SELECT n.[SubmissionId], @me, f.[Role], f.[ContentType], f.[FileName], f.[Data], DATALENGTH(f.[Data])
        FROM @new AS n
        CROSS APPLY (VALUES ('main', @MainType, @MainName, @MainData), ('source', @SourceType, @SourceName, @SourceData),
                            ('video', @VideoType, @VideoName, @VideoData), ('voice', @VoiceType, @VoiceName, @VoiceData),
                            ('then', @ThenType, @ThenName, @ThenData)) AS f ([Role], [ContentType], [FileName], [Data])
        WHERE f.[Data] IS NOT NULL;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- never leave the caller with an open transaction
        THROW;
    END CATCH;

    SELECT n.[PublicId], CONCAT('SWP-', RIGHT(CONCAT('000000', n.[SubmissionId]), 6)) AS [Reference] FROM @new AS n;
END;
GO

-- The owner of an approved photo selfie shares it in a photo frame (the framed picture made on the frame page) to the
-- Photo Frames gallery. Only their own selfie: it runs as the caller, and row-level security only shows the caller their
-- own rows. The details are copied from the selfie. It starts as 'Pending' (staff review it like any upload), or — when
-- staff have switched on site setting 'frames.auto-approve' — 'Approved' straight away (staff can still take it down).
-- Returns the reference and the status.
CREATE PROCEDURE [selfie].[usp_ShareFrame]
    @SourcePublicId UNIQUEIDENTIFIER,
    @FrameStyle     VARCHAR (40),
    @Festival       VARCHAR (20),
    @PictureType    VARCHAR (20),
    @PictureData    VARBINARY (MAX),
    @PictureName    NVARCHAR (150)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50030, N'Please sign in again.', 1;
    IF @PictureData IS NULL
        THROW 50032, N'Add the framed picture.', 1;
    DECLARE @source BIGINT = (
        SELECT s.[SubmissionId] FROM [selfie].[Submission] AS s
        WHERE s.[PublicId] = @SourcePublicId AND s.[UserId] = @me AND s.[Status] = 'Approved' AND s.[Kind] <> 'frame'
          AND EXISTS (SELECT 1 FROM [selfie].[SubmissionFile] AS f WHERE f.[SubmissionId] = s.[SubmissionId] AND f.[Role] = 'main'));
    IF @source IS NULL
        THROW 50037, N'Only your own approved photo selfie can be shared in a frame.', 1;
    IF EXISTS (SELECT 1 FROM [selfie].[Submission] WHERE [SourceSubmissionId] = @source AND [FrameStyle] = @FrameStyle AND [Status] IN ('Pending', 'Approved'))
        THROW 50038, N'You''ve already shared this frame.', 1;
    IF (SELECT COUNT(*) FROM [selfie].[Submission] WHERE [UserId] = @me AND [CreatedAtUtc] > DATEADD(DAY, -1, SYSUTCDATETIME())) >= 10
        THROW 50033, N'You''ve shared 10 times today. Please try again tomorrow.', 1;

    DECLARE @auto BIT = IIF(EXISTS (SELECT 1 FROM [site].[Setting] WHERE [SettingKey] = 'frames.auto-approve' AND [Value] = N'1'), 1, 0);
    DECLARE @new TABLE ([SubmissionId] BIGINT, [PublicId] UNIQUEIDENTIFIER, [Status] VARCHAR (10));
    BEGIN TRY
        BEGIN TRANSACTION;
        INSERT [selfie].[Submission] ([UserId], [Kind], [YourName], [ParentName], [Relation], [CountryCode], [StateName], [City],
            [IsAdult], [GuardianName], [GuardianMobile], [Message], [ConsentedAtUtc], [SourceSubmissionId], [FrameStyle], [Festival],
            [Status], [ReviewNote], [ReviewedAtUtc])
        OUTPUT inserted.[SubmissionId], inserted.[PublicId], inserted.[Status] INTO @new
        SELECT @me, 'frame', s.[YourName], s.[ParentName], s.[Relation], s.[CountryCode], s.[StateName], s.[City],
            s.[IsAdult], s.[GuardianName], s.[GuardianMobile], s.[Message], SYSUTCDATETIME(), s.[SubmissionId], @FrameStyle, @Festival,
            IIF(@auto = 1, 'Approved', 'Pending'), IIF(@auto = 1, N'Auto-approved (photo frames)', NULL), IIF(@auto = 1, SYSUTCDATETIME(), NULL)
        FROM [selfie].[Submission] AS s WHERE s.[SubmissionId] = @source;

        INSERT [selfie].[SubmissionFile] ([SubmissionId], [UserId], [Role], [ContentType], [FileName], [Data], [SizeBytes])
        SELECT n.[SubmissionId], @me, 'main', @PictureType, @PictureName, @PictureData, DATALENGTH(@PictureData) FROM @new AS n;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- never leave the caller with an open transaction
        THROW;
    END CATCH;

    SELECT n.[PublicId], CONCAT('SWP-', RIGHT(CONCAT('000000', n.[SubmissionId]), 6)) AS [Reference], n.[Status] FROM @new AS n;
END;
GO

-- The owner of an approved photo selfie shares its reel (the short video made on the reel page) to the Videos gallery.
-- Only their own selfie (runs as the caller; row-level security only shows the caller their own rows), one reel at a
-- time (one staff took down can be shared again). The details are copied from the selfie. It's approved straight away:
-- the photo in it was already reviewed (staff can still take it down in the review queue).
CREATE PROCEDURE [selfie].[usp_ShareReel]
    @SourcePublicId UNIQUEIDENTIFIER,
    @VideoType      VARCHAR (20),
    @VideoData      VARBINARY (MAX),
    @VideoName      NVARCHAR (150)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50030, N'Please sign in again.', 1;
    IF @VideoData IS NULL
        THROW 50032, N'Add the reel.', 1;
    DECLARE @source BIGINT = (
        SELECT s.[SubmissionId] FROM [selfie].[Submission] AS s
        WHERE s.[PublicId] = @SourcePublicId AND s.[UserId] = @me AND s.[Status] = 'Approved' AND s.[Kind] NOT IN ('frame', 'reel')
          AND EXISTS (SELECT 1 FROM [selfie].[SubmissionFile] AS f WHERE f.[SubmissionId] = s.[SubmissionId] AND f.[Role] = 'main'));
    IF @source IS NULL
        THROW 50037, N'Only your own approved photo selfie can be shared as a reel.', 1;
    IF EXISTS (SELECT 1 FROM [selfie].[Submission] WHERE [SourceSubmissionId] = @source AND [Kind] = 'reel' AND [Status] IN ('Pending', 'Approved'))
        THROW 50038, N'You''ve already shared a reel of this selfie.', 1;
    IF (SELECT COUNT(*) FROM [selfie].[Submission] WHERE [UserId] = @me AND [CreatedAtUtc] > DATEADD(DAY, -1, SYSUTCDATETIME())) >= 10
        THROW 50033, N'You''ve shared 10 times today. Please try again tomorrow.', 1;

    DECLARE @new TABLE ([SubmissionId] BIGINT, [PublicId] UNIQUEIDENTIFIER);
    BEGIN TRY
        BEGIN TRANSACTION;
        INSERT [selfie].[Submission] ([UserId], [Kind], [YourName], [ParentName], [Relation], [CountryCode], [StateName], [City],
            [IsAdult], [GuardianName], [GuardianMobile], [Message], [ConsentedAtUtc], [SourceSubmissionId], [Status], [ReviewNote], [ReviewedAtUtc])
        OUTPUT inserted.[SubmissionId], inserted.[PublicId] INTO @new
        SELECT @me, 'reel', s.[YourName], s.[ParentName], s.[Relation], s.[CountryCode], s.[StateName], s.[City],
            s.[IsAdult], s.[GuardianName], s.[GuardianMobile], s.[Message], SYSUTCDATETIME(), s.[SubmissionId],
            'Approved', N'Auto-approved (reel of an approved selfie)', SYSUTCDATETIME()
        FROM [selfie].[Submission] AS s WHERE s.[SubmissionId] = @source;
        INSERT [selfie].[SubmissionFile] ([SubmissionId], [UserId], [Role], [ContentType], [FileName], [Data], [SizeBytes])
        SELECT n.[SubmissionId], @me, 'video', @VideoType, @VideoName, @VideoData, DATALENGTH(@VideoData) FROM @new AS n;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- never leave the caller with an open transaction
        THROW;
    END CATCH;

    SELECT n.[PublicId], CONCAT('SWP-', RIGHT(CONCAT('000000', n.[SubmissionId]), 6)) AS [Reference] FROM @new AS n;
END;
GO

-- Staff approve or reject a submission (a reason of at least 5 characters is needed to reject). A decision can be changed.
-- The caller must be an active SuperAdmin, Admin or Moderator (id from the read-only session context).
-- Runs as the login-less user swp_staff_admin, so it can update a row that belongs to the visitor.
-- Returns the owner's id and the submission's reference, so the API can tell the visitor.
CREATE PROCEDURE [selfie].[usp_ReviewSubmission]
    @PublicId UNIQUEIDENTIFIER,
    @Status   VARCHAR (10),
    @Note     NVARCHAR (300)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin', 'Moderator'))
        THROW 50034, N'Only a super admin, admin or moderator can review submissions.', 1;
    IF @Status NOT IN ('Approved', 'Rejected', 'Pending')
        THROW 50032, N'Choose approve or reject.', 1;
    SET @Note = NULLIF(LTRIM(RTRIM(@Note)), N'');
    IF @Status = 'Rejected' AND (@Note IS NULL OR LEN(@Note) < 5)
        THROW 50032, N'Give a reason (at least 5 characters) when rejecting.', 1;
    IF NOT EXISTS (SELECT 1 FROM [selfie].[Submission] WHERE [PublicId] = @PublicId)
        THROW 50031, N'That submission wasn''t found.', 1;

    UPDATE [selfie].[Submission]
       SET [Status] = @Status,
           [ReviewNote] = IIF(@Status = 'Pending', NULL, @Note),
           [ReviewedByUserId] = IIF(@Status = 'Pending', NULL, @actor),
           [ReviewedAtUtc] = IIF(@Status = 'Pending', NULL, SYSUTCDATETIME()),
           -- no longer approved: no longer featured
           [IsFeatured] = IIF(@Status = 'Approved', [IsFeatured], 0),
           [FeaturedAtUtc] = IIF(@Status = 'Approved', [FeaturedAtUtc], NULL)
     WHERE [PublicId] = @PublicId;

    SELECT [UserId], CONCAT('SWP-', RIGHT(CONCAT('000000', [SubmissionId]), 6)) AS [Reference] FROM [selfie].[Submission] WHERE [PublicId] = @PublicId;
END;
GO

-- Deleting an account: removes everything the account shared (submissions and their photos / videos), its likes,
-- candles, family dates and reminders.
-- Only the signed-in account's own rows (session-context UserId; row-level security). Runs as the caller; the website
-- has no DELETE permission on the selfie schema, but the procedure and tables share an owner.
CREATE PROCEDURE [selfie].[usp_DeleteMySubmissions]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL
        THROW 50030, N'Please sign in again.', 1;
    DELETE [selfie].[Candle] WHERE [UserId] = @me;       -- candles they lit on the Memory Wall
    DELETE [selfie].[SubmissionLike] WHERE [UserId] = @me;   -- likes they gave
    DELETE [selfie].[FamilyDate] WHERE [UserId] = @me;   -- family dates and reminder choices / history
    DELETE [selfie].[ReminderSetting] WHERE [UserId] = @me;
    DELETE [selfie].[ReminderLog] WHERE [UserId] = @me;
    UPDATE [selfie].[FamilyAlbum] SET [CreatedByUserId] = NULL WHERE [CreatedByUserId] = @me;   -- family albums they started stay for the others
    DELETE [selfie].[Submission] WHERE [UserId] = @me;   -- files and candles on them go too (ON DELETE CASCADE), and their place in family albums
    DELETE a FROM [selfie].[FamilyAlbum] AS a WHERE NOT EXISTS (SELECT 1 FROM [selfie].[AlbumSubmission] AS x WHERE x.[AlbumId] = a.[AlbumId]);   -- albums nobody is left in
    DELETE [selfie].[ParentStoryLove] WHERE [UserId] = @me;   -- Parents' Voices: love they sent, and the stories they shared
    DELETE [selfie].[ParentStory] WHERE [UserId] = @me;       -- (their files and the love on them go too)
    DELETE [selfie].[GratitudeCheckIn] WHERE [UserId] = @me;  -- gratitude streak
    DELETE [selfie].[Profile] WHERE [UserId] = @me;           -- public profile
END;
GO

-- Staff feature (or unfeature) an approved submission for Featured Stories. Same reviewers as usp_ReviewSubmission.
CREATE PROCEDURE [selfie].[usp_SetFeatured]
    @PublicId   UNIQUEIDENTIFIER,
    @IsFeatured BIT
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin', 'Moderator'))
        THROW 50034, N'Only a super admin, admin or moderator can feature submissions.', 1;
    IF NOT EXISTS (SELECT 1 FROM [selfie].[Submission] WHERE [PublicId] = @PublicId)
        THROW 50031, N'That submission wasn''t found.', 1;
    IF @IsFeatured = 1 AND NOT EXISTS (SELECT 1 FROM [selfie].[Submission] WHERE [PublicId] = @PublicId AND [Status] = 'Approved')
        THROW 50035, N'Only an approved submission can be featured.', 1;
    UPDATE [selfie].[Submission]
       SET [IsFeatured] = @IsFeatured, [FeaturedAtUtc] = IIF(@IsFeatured = 1, ISNULL([FeaturedAtUtc], SYSUTCDATETIME()), NULL)
     WHERE [PublicId] = @PublicId;
END;
GO

-- A signed-in visitor lights (or puts out) their candle on an approved "in loving memory" tribute.
-- Their own candle only (session-context UserId; row-level security). Returns the tribute's candle count.
CREATE PROCEDURE [selfie].[usp_SetCandle]
    @PublicId UNIQUEIDENTIFIER,
    @Lit      BIT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50030, N'Please sign in again.', 1;
    -- The tribute belongs to someone else, so look it up in a way row-level security allows: through the public view of it
    DECLARE @id BIGINT = (SELECT [SubmissionId] FROM [selfie].[fn_ApprovedMemory](@PublicId));
    IF @id IS NULL
        THROW 50036, N'That tribute isn''t on the Memory Wall.', 1;
    IF @Lit = 1 AND NOT EXISTS (SELECT 1 FROM [selfie].[Candle] WHERE [SubmissionId] = @id AND [UserId] = @me)
        INSERT [selfie].[Candle] ([SubmissionId], [UserId]) VALUES (@id, @me);
    IF @Lit = 0
        DELETE [selfie].[Candle] WHERE [SubmissionId] = @id AND [UserId] = @me;
    SELECT [Candles] FROM [selfie].[fn_ApprovedMemory](@PublicId);
END;
GO
