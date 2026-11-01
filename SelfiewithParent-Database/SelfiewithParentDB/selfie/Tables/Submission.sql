-- A selfie / family photo / video shared by a signed-in visitor (the upload form on the website).
-- Created only through selfie.usp_CreateSubmission (status always starts as 'Pending'); reviewed only through
-- selfie.usp_ReviewSubmission (SuperAdmin / Admin / Moderator). The files are in selfie.SubmissionFile.
-- Row-level security keeps each submission to its owner; staff screens read them in System scope.
-- PII columns: YourName, ParentName, City, GuardianName, GuardianMobile.
-- The reference shown to the visitor is 'SWP-' + the id with 6 digits (e.g. SWP-000123), made by the procedures.
-- Kind 'frame': the owner's approved photo selfie in a photo frame, shared to the Photo Frames gallery (selfie.usp_ShareFrame);
-- its photo is the framed picture, the details are copied from the selfie it was made from.
-- Kind 'reel': the owner's approved photo selfie as a short video (made on the reel page), shared to the Videos gallery
-- (selfie.usp_ShareReel); its video is the reel, the details are copied from the selfie it was made from.
CREATE TABLE [selfie].[Submission]
(
    [SubmissionId]      BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]          UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_Submission_PublicId] DEFAULT (NEWID()),
    [UserId]            BIGINT              NOT NULL,
    [Kind]              VARCHAR (10)        NOT NULL,     -- real | ai | memory | family | thennow (an old photo + the same photo today) | frame | reel
    [YourName]          NVARCHAR (60)       MASKED WITH (FUNCTION = 'partial(1,"xxxxx",0)') NOT NULL,
    [ParentName]        NVARCHAR (60)       MASKED WITH (FUNCTION = 'partial(1,"xxxxx",0)') NOT NULL,   -- for 'family': the family's name
    [Relation]          VARCHAR (20)        NULL,         -- not for 'family'
    [FamilySize]        VARCHAR (5)         NULL,         -- 'family' only: 2..10, 11-15, 16+
    [Generations]       VARCHAR (2)         NULL,         -- 'family' only: 2, 3, 4+
    [MemoryYear]        SMALLINT            NULL,         -- 'memory' only: the year they passed
    [CountryCode]       CHAR (2)            NOT NULL,
    [StateName]         NVARCHAR (60)       NULL,
    [City]              NVARCHAR (60)       MASKED WITH (FUNCTION = 'default()') NULL,
    [IsAdult]           BIT                 NOT NULL,
    [GuardianName]      NVARCHAR (60)       MASKED WITH (FUNCTION = 'partial(1,"xxxxx",0)') NULL,   -- under 18 only
    [GuardianMobile]    VARCHAR (20)        MASKED WITH (FUNCTION = 'partial(0,"XXXXXX",4)') NULL,  -- under 18 only, e.g. +919876543210
    [Message]           NVARCHAR (300)      NULL,
    [ConsentedAtUtc]    DATETIME2 (0)       NOT NULL,     -- all consents ticked (shown publicly, own photo, terms; guardian when under 18)
    [Status]            VARCHAR (10)        NOT NULL CONSTRAINT [DF_Submission_Status] DEFAULT ('Pending'),   -- Pending | Approved | Rejected
    [ReviewNote]        NVARCHAR (300)      NULL,         -- the reason, when rejected
    [ReviewedByUserId]  BIGINT              NULL,
    [ReviewedAtUtc]     DATETIME2 (0)       NULL,
    [CreatedAtUtc]      DATETIME2 (0)       NOT NULL CONSTRAINT [DF_Submission_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [ThenYear]          SMALLINT            NULL,         -- 'thennow' only, optional: the year of the old photo
    [NowYear]           SMALLINT            NULL,         -- 'thennow' only, optional: the year of the new photo
    [IsFeatured]        BIT                 NOT NULL CONSTRAINT [DF_Submission_IsFeatured] DEFAULT (0),   -- picked by staff for Featured Stories
    [FeaturedAtUtc]     DATETIME2 (0)       NULL,
    [SourceSubmissionId] BIGINT             NULL,         -- 'frame' / 'reel' only: the selfie it was made from
    [FrameStyle]        VARCHAR (40)        NULL,         -- 'frame' only: e.g. 'arch-marigold' (design-colour) or 'festival-diwali'
    [Festival]          VARCHAR (20)        NULL,         -- 'frame' only: the festival / event, e.g. 'diwali' (NULL: an everyday frame)

    CONSTRAINT [PK_Submission] PRIMARY KEY CLUSTERED ([SubmissionId] ASC),
    CONSTRAINT [UQ_Submission_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_Submission_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [FK_Submission_ReviewedBy] FOREIGN KEY ([ReviewedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [FK_Submission_Source] FOREIGN KEY ([SourceSubmissionId]) REFERENCES [selfie].[Submission] ([SubmissionId]),
    CONSTRAINT [CK_Submission_Kind] CHECK ([Kind] IN ('real', 'ai', 'memory', 'family', 'thennow', 'frame', 'reel')),
    CONSTRAINT [CK_Submission_Frame] CHECK (
        ([Kind] = 'frame' AND [SourceSubmissionId] IS NOT NULL
            AND ISNULL([FrameStyle], '') COLLATE Latin1_General_BIN2 LIKE '[a-z]%-[a-z]%' AND [FrameStyle] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z-]%'
            AND (ISNULL([Festival], 'none') COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z]%' AND LEN(ISNULL([Festival], 'none')) >= 2))
        OR ([Kind] = 'reel' AND [SourceSubmissionId] IS NOT NULL AND [FrameStyle] IS NULL AND [Festival] IS NULL)
        OR ([Kind] NOT IN ('frame', 'reel') AND [SourceSubmissionId] IS NULL AND [FrameStyle] IS NULL AND [Festival] IS NULL)),
    CONSTRAINT [CK_Submission_ThenNow] CHECK (
        ([Kind] = 'thennow' AND ISNULL([ThenYear], 1900) BETWEEN 1900 AND 2100 AND ISNULL([NowYear], 2100) BETWEEN 1900 AND 2100
            AND ISNULL([ThenYear], 1900) <= ISNULL([NowYear], 2100))
        OR ([Kind] <> 'thennow' AND [ThenYear] IS NULL AND [NowYear] IS NULL)),
    -- Only approved submissions can be featured
    CONSTRAINT [CK_Submission_Featured] CHECK ([IsFeatured] = 0 OR ([Status] = 'Approved' AND [FeaturedAtUtc] IS NOT NULL)),
    CONSTRAINT [CK_Submission_Status] CHECK ([Status] IN ('Pending', 'Approved', 'Rejected')),
    CONSTRAINT [CK_Submission_Relation] CHECK (
        ([Kind] = 'family' AND [Relation] IS NULL)
        OR ([Kind] IN ('frame', 'reel') AND [Relation] IS NULL)   -- a frame / reel of a family photo
        OR ([Kind] <> 'family' AND [Relation] IN ('Mother', 'Father', 'Both parents', 'Grandmother', 'Grandfather', 'Grandparents', 'Step-parent', 'Guardian'))),
    CONSTRAINT [CK_Submission_Family] CHECK (
        ([Kind] = 'family' AND [FamilySize] IN ('2', '3', '4', '5', '6', '7', '8', '9', '10', '11-15', '16+') AND ISNULL([Generations], '2') IN ('2', '3', '4+'))
        OR ([Kind] <> 'family' AND [FamilySize] IS NULL AND [Generations] IS NULL)),
    CONSTRAINT [CK_Submission_MemoryYear] CHECK ([MemoryYear] IS NULL OR ([Kind] = 'memory' AND [MemoryYear] BETWEEN 1900 AND 2100)),
    CONSTRAINT [CK_Submission_Country] CHECK ([CountryCode] COLLATE Latin1_General_BIN2 LIKE '[A-Z][A-Z]'),
    -- Under 18: a parent / guardian with a mobile number has to be named (ISNULL: a CHECK lets NULL / unknown through)
    CONSTRAINT [CK_Submission_Guardian] CHECK (
        ([IsAdult] = 1 AND [GuardianName] IS NULL AND [GuardianMobile] IS NULL)
        OR ([IsAdult] = 0 AND LEN(ISNULL([GuardianName], N'')) >= 2 AND ISNULL([GuardianMobile], '') COLLATE Latin1_General_BIN2 LIKE '+[1-9]%'
            AND [GuardianMobile] COLLATE Latin1_General_BIN2 NOT LIKE '+%[^0-9]%' AND LEN([GuardianMobile]) >= 8)),
    CONSTRAINT [CK_Submission_Review] CHECK (
        ([Status] = 'Pending' AND [ReviewedAtUtc] IS NULL)
        OR ([Status] = 'Approved' AND [ReviewedAtUtc] IS NOT NULL)
        OR ([Status] = 'Rejected' AND [ReviewedAtUtc] IS NOT NULL AND LEN(ISNULL([ReviewNote], N'')) >= 5)),
    -- Text is shown as text; refusing markup here is a second line of defence
    CONSTRAINT [CK_Submission_NoMarkup] CHECK (
        CONCAT([YourName], [ParentName], [StateName], [City], [GuardianName], [Message], [ReviewNote]) NOT LIKE '%[<>]%'
        AND LEN([YourName]) >= 1 AND LEN([ParentName]) >= 1)
);
GO

CREATE NONCLUSTERED INDEX [IX_Submission_Status]
    ON [selfie].[Submission] ([Status], [CreatedAtUtc]);
GO

CREATE NONCLUSTERED INDEX [IX_Submission_User]
    ON [selfie].[Submission] ([UserId], [CreatedAtUtc]);
GO

CREATE NONCLUSTERED INDEX [IX_Submission_Source]
    ON [selfie].[Submission] ([SourceSubmissionId]) WHERE [SourceSubmissionId] IS NOT NULL;
GO
