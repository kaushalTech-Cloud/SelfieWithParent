-- Gratitude streaks: once a week a visitor says how they stayed in touch with their parent (a call, a visit, a selfie,
-- a message). Weeks run Monday to Sunday in India time (the API works out the week). One row per visitor per week; the
-- streak is the number of weeks in a row. Written only through selfie.usp_GratitudeCheckIn (their own row).
CREATE TABLE [selfie].[GratitudeCheckIn]
(
    [UserId]        BIGINT          NOT NULL,
    [WeekStart]     DATE            NOT NULL,      -- the Monday
    [Kind]          VARCHAR (10)    NOT NULL,      -- call | visit | selfie | message
    [Note]          NVARCHAR (140)  NULL,          -- private: only the visitor sees it
    [CreatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_GratitudeCheckIn_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_GratitudeCheckIn] PRIMARY KEY CLUSTERED ([UserId] ASC, [WeekStart] DESC),
    CONSTRAINT [FK_GratitudeCheckIn_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_GratitudeCheckIn_Kind] CHECK ([Kind] IN ('call', 'visit', 'selfie', 'message')),
    CONSTRAINT [CK_GratitudeCheckIn_Monday] CHECK (DATEDIFF(DAY, '19000101', [WeekStart]) % 7 = 0),   -- 1 Jan 1900 was a Monday
    CONSTRAINT [CK_GratitudeCheckIn_NoMarkup] CHECK ([Note] IS NULL OR [Note] NOT LIKE '%[<>]%')
);
GO

-- A visitor's public profile page (/p/{handle}): off until they switch it on. Shows the name they choose, a short bio,
-- their profile photo, their approved selfies / frames / reels, contest wins and gratitude streak — never contact details.
-- Written only through selfie.usp_SaveMyProfile (their own row).
CREATE TABLE [selfie].[Profile]
(
    [UserId]        BIGINT          NOT NULL,
    [Handle]        VARCHAR (30)    NOT NULL,
    [IsPublic]      BIT             NOT NULL CONSTRAINT [DF_Profile_IsPublic] DEFAULT (0),
    [DisplayName]   NVARCHAR (60)   NOT NULL,
    [Bio]           NVARCHAR (160)  NULL,
    [ShowStreak]    BIT             NOT NULL CONSTRAINT [DF_Profile_ShowStreak] DEFAULT (1),
    [UpdatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Profile_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Profile] PRIMARY KEY CLUSTERED ([UserId] ASC),
    CONSTRAINT [UQ_Profile_Handle] UNIQUE NONCLUSTERED ([Handle] ASC),
    CONSTRAINT [FK_Profile_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_Profile_Handle] CHECK (LEN([Handle]) >= 3 AND [Handle] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9-]%' AND [Handle] NOT LIKE '-%' AND [Handle] NOT LIKE '%-'),
    CONSTRAINT [CK_Profile_Text] CHECK (LEN([DisplayName]) >= 2 AND CONCAT([DisplayName], [Bio]) NOT LIKE '%[<>]%')
);
GO
