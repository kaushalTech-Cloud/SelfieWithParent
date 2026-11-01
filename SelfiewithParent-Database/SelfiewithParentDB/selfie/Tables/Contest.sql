-- Photo of the Week (and festival) contests: the most-liked selfie approved during the contest wins. Likes count until the
-- contest ends. Weekly contests (Monday 00:00 – Monday 00:00 UTC) are created by the contest job; festival contests by a
-- super admin / admin (selfie.usp_SaveContest). The job closes ended contests and records the winner
-- (selfie.usp_RunContests). The winner gets a badge, a certificate and a "Winner" photo frame on the site.
CREATE TABLE [selfie].[Contest]
(
    [ContestId]          BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]           UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_Contest_PublicId] DEFAULT (NEWID()),
    [Kind]               VARCHAR (10)        NOT NULL,     -- week | festival
    [Title]              NVARCHAR (80)       NOT NULL,     -- 'Photo of the Week' / e.g. 'Diwali 2026'
    [StartsAtUtc]        DATETIME2 (0)       NOT NULL,
    [EndsAtUtc]          DATETIME2 (0)       NOT NULL,     -- not included
    [WinnerSubmissionId] BIGINT              NULL,
    [WinnerLikes]        INT                 NULL,
    [ClosedAtUtc]        DATETIME2 (0)       NULL,         -- the winner (or no winner: nobody had a like) is decided
    [WinnerNotifiedAtUtc] DATETIME2 (0)      NULL,         -- the congratulations email went out
    [CreatedByUserId]    BIGINT              NULL,         -- NULL: a weekly contest made by the job
    [CreatedAtUtc]       DATETIME2 (0)       NOT NULL CONSTRAINT [DF_Contest_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Contest] PRIMARY KEY CLUSTERED ([ContestId] ASC),
    CONSTRAINT [UQ_Contest_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_Contest_Winner] FOREIGN KEY ([WinnerSubmissionId]) REFERENCES [selfie].[Submission] ([SubmissionId]) ON DELETE SET NULL,
    CONSTRAINT [FK_Contest_CreatedBy] FOREIGN KEY ([CreatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_Contest_Kind] CHECK ([Kind] IN ('week', 'festival')),
    CONSTRAINT [CK_Contest_Dates] CHECK ([EndsAtUtc] > [StartsAtUtc] AND DATEDIFF(DAY, [StartsAtUtc], [EndsAtUtc]) <= 31),
    CONSTRAINT [CK_Contest_Title] CHECK (LEN([Title]) >= 2 AND [Title] NOT LIKE '%[<>]%'),
    CONSTRAINT [CK_Contest_Winner] CHECK ([WinnerSubmissionId] IS NULL OR ([ClosedAtUtc] IS NOT NULL AND [WinnerLikes] >= 1))
);
GO

-- One weekly contest per week
CREATE UNIQUE NONCLUSTERED INDEX [UX_Contest_Week]
    ON [selfie].[Contest] ([StartsAtUtc]) WHERE [Kind] = 'week';
GO

CREATE NONCLUSTERED INDEX [IX_Contest_Winner]
    ON [selfie].[Contest] ([WinnerSubmissionId]) WHERE [WinnerSubmissionId] IS NOT NULL;
GO
