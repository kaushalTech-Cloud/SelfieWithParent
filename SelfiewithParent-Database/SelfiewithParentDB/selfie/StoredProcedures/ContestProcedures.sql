-- Photo of the Week / festival contests. Errors 50030-50039 are shown to the user.

-- A super admin / admin adds (@PublicId NULL) or changes a festival contest, e.g. 'Diwali 2026', 1–8 November.
-- A contest that has already been decided can't be changed. Runs as swp_staff_admin; returns the contest's public id.
CREATE PROCEDURE [selfie].[usp_SaveContest]
    @PublicId    UNIQUEIDENTIFIER,
    @Title       NVARCHAR (80),
    @StartsAtUtc DATETIME2 (0),
    @EndsAtUtc   DATETIME2 (0)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50034, N'Only a super admin or admin can manage contests.', 1;
    SET @Title = NULLIF(LTRIM(RTRIM(@Title)), N'');
    IF @Title IS NULL OR @StartsAtUtc IS NULL OR @EndsAtUtc IS NULL OR @EndsAtUtc <= @StartsAtUtc
        THROW 50032, N'Give the contest a name, and an end after its start.', 1;
    IF DATEDIFF(DAY, @StartsAtUtc, @EndsAtUtc) > 31
        THROW 50032, N'A contest can last up to 31 days.', 1;
    IF @PublicId IS NULL
    BEGIN
        DECLARE @new TABLE ([PublicId] UNIQUEIDENTIFIER);
        INSERT [selfie].[Contest] ([Kind], [Title], [StartsAtUtc], [EndsAtUtc], [CreatedByUserId])
        OUTPUT inserted.[PublicId] INTO @new
        VALUES ('festival', @Title, @StartsAtUtc, @EndsAtUtc, @actor);
        SELECT [PublicId] FROM @new;
        RETURN;
    END;
    IF NOT EXISTS (SELECT 1 FROM [selfie].[Contest] WHERE [PublicId] = @PublicId AND [Kind] = 'festival')
        THROW 50031, N'That contest wasn''t found.', 1;
    IF EXISTS (SELECT 1 FROM [selfie].[Contest] WHERE [PublicId] = @PublicId AND [ClosedAtUtc] IS NOT NULL)
        THROW 50035, N'That contest has already been decided.', 1;
    UPDATE [selfie].[Contest] SET [Title] = @Title, [StartsAtUtc] = @StartsAtUtc, [EndsAtUtc] = @EndsAtUtc WHERE [PublicId] = @PublicId;
    SELECT @PublicId AS [PublicId];
END;
GO

-- A super admin / admin removes a festival contest that hasn't been decided yet.
CREATE PROCEDURE [selfie].[usp_DeleteContest]
    @PublicId UNIQUEIDENTIFIER
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50034, N'Only a super admin or admin can manage contests.', 1;
    IF EXISTS (SELECT 1 FROM [selfie].[Contest] WHERE [PublicId] = @PublicId AND [ClosedAtUtc] IS NOT NULL)
        THROW 50035, N'That contest has already been decided.', 1;
    DELETE [selfie].[Contest] WHERE [PublicId] = @PublicId AND [Kind] = 'festival';
    IF @@ROWCOUNT = 0
        THROW 50031, N'That contest wasn''t found.', 1;
END;
GO

-- The contest job (System scope only): makes sure this week's Photo of the Week exists, and decides every contest that
-- has ended. The winner is the most-liked selfie, AI-made, family or Then & Now photo approved during the contest; likes
-- count until the contest ends, the owner's own like doesn't count, and at least one like is needed. A tie goes to the
-- one approved first. @Now is for tests; the job leaves it empty.
CREATE PROCEDURE [selfie].[usp_RunContests]
    @Now DATETIME2 (0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF ISNULL(CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20)), N'') <> N'System'
        THROW 50034, N'Only the contest job can run contests.', 1;
    SET @Now = ISNULL(@Now, SYSUTCDATETIME());

    -- This week's contest (Monday 00:00 UTC; 1900-01-01 was a Monday)
    DECLARE @monday DATETIME2 (0) = DATEADD(DAY, (DATEDIFF(DAY, '19000101', @Now) / 7) * 7, CAST('19000101' AS DATETIME2 (0)));
    IF NOT EXISTS (SELECT 1 FROM [selfie].[Contest] WHERE [Kind] = 'week' AND [StartsAtUtc] = @monday)
        INSERT [selfie].[Contest] ([Kind], [Title], [StartsAtUtc], [EndsAtUtc]) VALUES ('week', N'Photo of the Week', @monday, DATEADD(DAY, 7, @monday));

    -- Decide ended contests
    DECLARE @id BIGINT, @start DATETIME2 (0), @end DATETIME2 (0), @winner BIGINT, @likes INT;
    DECLARE ended CURSOR LOCAL FAST_FORWARD FOR
        SELECT [ContestId], [StartsAtUtc], [EndsAtUtc] FROM [selfie].[Contest] WHERE [ClosedAtUtc] IS NULL AND [EndsAtUtc] <= @Now ORDER BY [EndsAtUtc];
    OPEN ended;
    FETCH NEXT FROM ended INTO @id, @start, @end;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @winner = NULL, @likes = NULL;
        SELECT TOP (1) @winner = s.[SubmissionId], @likes = COUNT(l.[UserId])
        FROM [selfie].[Submission] AS s
        JOIN [selfie].[SubmissionLike] AS l ON l.[SubmissionId] = s.[SubmissionId] AND l.[CreatedAtUtc] < @end AND l.[UserId] <> s.[UserId]
        WHERE s.[Status] = 'Approved' AND s.[Kind] IN ('real', 'ai', 'family', 'thennow')
          AND s.[ReviewedAtUtc] >= @start AND s.[ReviewedAtUtc] < @end
          AND EXISTS (SELECT 1 FROM [selfie].[SubmissionFile] AS f WHERE f.[SubmissionId] = s.[SubmissionId] AND f.[Role] = 'main')
        GROUP BY s.[SubmissionId], s.[ReviewedAtUtc]
        ORDER BY COUNT(l.[UserId]) DESC, s.[ReviewedAtUtc], s.[SubmissionId];
        UPDATE [selfie].[Contest] SET [WinnerSubmissionId] = @winner, [WinnerLikes] = @likes, [ClosedAtUtc] = SYSUTCDATETIME() WHERE [ContestId] = @id;
        FETCH NEXT FROM ended INTO @id, @start, @end;
    END;
    CLOSE ended;
    DEALLOCATE ended;
END;
GO

-- The contest job (System scope only) records that the winner's congratulations email went out.
CREATE PROCEDURE [selfie].[usp_MarkWinnerNotified]
    @PublicId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20)), N'') <> N'System'
        THROW 50034, N'Only the contest job can do this.', 1;
    UPDATE [selfie].[Contest] SET [WinnerNotifiedAtUtc] = SYSUTCDATETIME() WHERE [PublicId] = @PublicId AND [WinnerSubmissionId] IS NOT NULL;
END;
GO
