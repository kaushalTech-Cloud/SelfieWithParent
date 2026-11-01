-- Parents' Voices: a parent whose children left them (moved away, stopped calling, or left them alone) tells their story,
-- with a photo, a video and / or a voice note. Written by the parent, or by family / a friend / a volunteer with the
-- parent's agreement. Created only through selfie.usp_CreateParentStory (always 'Pending'); staff review every story
-- through selfie.usp_ReviewParentStory before anyone else sees it. Nothing that could find the parent is shown: the name
-- they chose (or "A mother from Pune" when anonymous), age and town only — never an address or phone number.
CREATE TABLE [selfie].[ParentStory]
(
    [StoryId]           BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]          UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_ParentStory_PublicId] DEFAULT (NEWID()),
    [UserId]            BIGINT              NOT NULL,     -- the account that shared it
    [WrittenBy]         VARCHAR (10)        NOT NULL,     -- parent | family | friend (a friend, neighbour or volunteer)
    [ParentRole]        VARCHAR (10)        NOT NULL,     -- mother | father | both
    [ShownName]         NVARCHAR (60)       NULL,         -- the name to show; NULL when anonymous
    [Age]               TINYINT             NULL,
    [CountryCode]       CHAR (2)            NOT NULL,
    [StateName]         NVARCHAR (60)       NULL,
    [City]              NVARCHAR (60)       NULL,
    [Title]             NVARCHAR (120)      NOT NULL,
    [Story]             NVARCHAR (3000)     NOT NULL,
    [Wish]              NVARCHAR (300)      NULL,         -- "If my children read this…"
    [Status]            VARCHAR (10)        NOT NULL CONSTRAINT [DF_ParentStory_Status] DEFAULT ('Pending'),
    [ReviewNote]        NVARCHAR (300)      NULL,
    [ReviewedByUserId]  BIGINT              NULL,
    [ReviewedAtUtc]     DATETIME2 (0)       NULL,
    [IsFeatured]        BIT                 NOT NULL CONSTRAINT [DF_ParentStory_IsFeatured] DEFAULT (0),
    [ConsentedAtUtc]    DATETIME2 (0)       NOT NULL,     -- the parent agreed to share it (themselves, or told the writer so)
    [CreatedAtUtc]      DATETIME2 (0)       NOT NULL CONSTRAINT [DF_ParentStory_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_ParentStory] PRIMARY KEY CLUSTERED ([StoryId] ASC),
    CONSTRAINT [UQ_ParentStory_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_ParentStory_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [FK_ParentStory_Reviewer] FOREIGN KEY ([ReviewedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_ParentStory_WrittenBy] CHECK ([WrittenBy] IN ('parent', 'family', 'friend')),
    CONSTRAINT [CK_ParentStory_ParentRole] CHECK ([ParentRole] IN ('mother', 'father', 'both')),
    CONSTRAINT [CK_ParentStory_Age] CHECK ([Age] IS NULL OR [Age] BETWEEN 40 AND 120),
    CONSTRAINT [CK_ParentStory_Country] CHECK ([CountryCode] COLLATE Latin1_General_BIN2 LIKE '[A-Z][A-Z]'),
    CONSTRAINT [CK_ParentStory_Text] CHECK (LEN([Title]) >= 3 AND LEN([Story]) >= 40),
    CONSTRAINT [CK_ParentStory_Status] CHECK ([Status] IN ('Pending', 'Approved', 'Rejected')),
    CONSTRAINT [CK_ParentStory_Featured] CHECK ([IsFeatured] = 0 OR [Status] = 'Approved'),
    CONSTRAINT [CK_ParentStory_Review] CHECK (
        ([Status] = 'Pending' AND [ReviewedByUserId] IS NULL AND [ReviewedAtUtc] IS NULL)
        OR ([Status] <> 'Pending' AND [ReviewedAtUtc] IS NOT NULL)),
    CONSTRAINT [CK_ParentStory_NoMarkup] CHECK (
        CONCAT([ShownName], [StateName], [City], [Title], [Story], [Wish], [ReviewNote]) NOT LIKE '%[<>]%')
);
GO

CREATE NONCLUSTERED INDEX [IX_ParentStory_Status] ON [selfie].[ParentStory] ([Status], [ReviewedAtUtc] DESC);
GO
CREATE NONCLUSTERED INDEX [IX_ParentStory_User] ON [selfie].[ParentStory] ([UserId], [CreatedAtUtc]);
GO

-- The photo, video and voice note of a parent's story, stored in the database (same limits as selfies). The API checks
-- each file's real type from its first bytes. UserId repeats the owner for row-level security.
CREATE TABLE [selfie].[ParentStoryFile]
(
    [FileId]        BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]      UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_ParentStoryFile_PublicId] DEFAULT (NEWID()),
    [StoryId]       BIGINT              NOT NULL,
    [UserId]        BIGINT              NOT NULL,
    [Role]          VARCHAR (10)        NOT NULL,     -- main (photo) | video | voice
    [ContentType]   VARCHAR (20)        NOT NULL,
    [FileName]      NVARCHAR (150)      NULL,         -- original name, for staff only
    [Data]          VARBINARY (MAX)     NOT NULL,
    [SizeBytes]     INT                 NOT NULL,
    [CreatedAtUtc]  DATETIME2 (0)       NOT NULL CONSTRAINT [DF_ParentStoryFile_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_ParentStoryFile] PRIMARY KEY CLUSTERED ([FileId] ASC),
    CONSTRAINT [UQ_ParentStoryFile_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [UQ_ParentStoryFile_Role] UNIQUE NONCLUSTERED ([StoryId] ASC, [Role] ASC),
    CONSTRAINT [FK_ParentStoryFile_Story] FOREIGN KEY ([StoryId]) REFERENCES [selfie].[ParentStory] ([StoryId]) ON DELETE CASCADE,
    CONSTRAINT [FK_ParentStoryFile_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_ParentStoryFile_Type] CHECK (
        ([Role] = 'main' AND [ContentType] IN ('image/png', 'image/jpeg', 'image/webp') AND [SizeBytes] <= 10485760)
        OR ([Role] = 'video' AND [ContentType] IN ('video/mp4', 'video/webm', 'video/quicktime') AND [SizeBytes] <= 52428800)
        OR ([Role] = 'voice' AND [ContentType] IN ('audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav') AND [SizeBytes] <= 5242880))
);
GO

-- "Send love": one per visitor per approved story.
CREATE TABLE [selfie].[ParentStoryLove]
(
    [StoryId]       BIGINT          NOT NULL,
    [UserId]        BIGINT          NOT NULL,
    [CreatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_ParentStoryLove_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_ParentStoryLove] PRIMARY KEY CLUSTERED ([StoryId] ASC, [UserId] ASC),
    CONSTRAINT [FK_ParentStoryLove_Story] FOREIGN KEY ([StoryId]) REFERENCES [selfie].[ParentStory] ([StoryId]) ON DELETE CASCADE,
    CONSTRAINT [FK_ParentStoryLove_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId])
);
GO
