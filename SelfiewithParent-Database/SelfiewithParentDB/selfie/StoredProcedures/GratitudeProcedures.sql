-- Gratitude streaks and public profiles: a visitor's own rows only (session-context UserId; row-level security).
-- Errors 50070-50079 are shown to the user.

-- "This week I called / visited / took a selfie / sent a message". @WeekStart is this week's Monday (India time,
-- worked out by the API); only this week or last week (a late Sunday check-in) can be marked — no filling in old weeks.
CREATE PROCEDURE [selfie].[usp_GratitudeCheckIn]
    @WeekStart DATE,
    @Kind      VARCHAR (10),
    @Note      NVARCHAR (140)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50070, N'Please sign in again.', 1;
    DECLARE @today DATE = CAST(DATEADD(MINUTE, 330, SYSUTCDATETIME()) AS DATE);   -- India time
    IF @WeekStart > @today OR @WeekStart < DATEADD(DAY, -13, @today)
        THROW 50072, N'Only this week can be marked.', 1;
    SET @Note = NULLIF(LTRIM(RTRIM(@Note)), N'');
    UPDATE [selfie].[GratitudeCheckIn] SET [Kind] = @Kind, [Note] = @Note WHERE [UserId] = @me AND [WeekStart] = @WeekStart;
    IF @@ROWCOUNT = 0
        INSERT [selfie].[GratitudeCheckIn] ([UserId], [WeekStart], [Kind], [Note]) VALUES (@me, @WeekStart, @Kind, @Note);
END;
GO

-- Weekly streak reminder on / off (the visitor's own choice; also from the email's "switch off" link).
CREATE PROCEDURE [selfie].[usp_SetStreakNudges]
    @On BIT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL
        THROW 50070, N'Please sign in again.', 1;
    UPDATE [selfie].[ReminderSetting] SET [StreakNudges] = @On, [UpdatedAtUtc] = SYSUTCDATETIME() WHERE [UserId] = @me;
    IF @@ROWCOUNT = 0
        INSERT [selfie].[ReminderSetting] ([UserId], [EmailReminders], [ThenNowNudges], [StreakNudges]) VALUES (@me, 1, 1, @On);
END;
GO

-- Creates or changes the visitor's public profile. The address (handle) must be free; a few words are reserved.
CREATE PROCEDURE [selfie].[usp_SaveMyProfile]
    @Handle      VARCHAR (30),
    @IsPublic    BIT,
    @DisplayName NVARCHAR (60),
    @Bio         NVARCHAR (160),
    @ShowStreak  BIT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50070, N'Please sign in again.', 1;
    SET @Handle = LOWER(LTRIM(RTRIM(@Handle)));
    IF @Handle IN ('admin', 'staff', 'support', 'help', 'about', 'selfie', 'selfies', 'parents', 'login', 'account', 'me', 'api', 'www', 'team', 'official')
        THROW 50073, N'That address is reserved. Please choose another.', 1;
    -- Another visitor's profile is invisible to this account (row-level security), so ask through the unique key
    BEGIN TRY
        UPDATE [selfie].[Profile] SET [Handle] = @Handle, [IsPublic] = @IsPublic, [DisplayName] = LTRIM(RTRIM(@DisplayName)),
               [Bio] = NULLIF(LTRIM(RTRIM(@Bio)), N''), [ShowStreak] = @ShowStreak, [UpdatedAtUtc] = SYSUTCDATETIME()
         WHERE [UserId] = @me;
        IF @@ROWCOUNT = 0
            INSERT [selfie].[Profile] ([UserId], [Handle], [IsPublic], [DisplayName], [Bio], [ShowStreak])
            VALUES (@me, @Handle, @IsPublic, LTRIM(RTRIM(@DisplayName)), NULLIF(LTRIM(RTRIM(@Bio)), N''), @ShowStreak);
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50073, N'That address is taken. Please choose another.', 1;
        THROW;
    END CATCH;
END;
GO
