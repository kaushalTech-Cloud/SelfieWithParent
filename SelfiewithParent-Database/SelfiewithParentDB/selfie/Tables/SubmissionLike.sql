-- A like (heart) on an approved selfie / photo frame: one per signed-in visitor per submission (liked again = unliked).
-- Written only through selfie.usp_SetLike (the visitor's own like). Row-level security keeps each row to its owner;
-- the counts are read in System scope.
CREATE TABLE [selfie].[SubmissionLike]
(
    [SubmissionId]  BIGINT          NOT NULL,
    [UserId]        BIGINT          NOT NULL,
    [CreatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_SubmissionLike_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_SubmissionLike] PRIMARY KEY CLUSTERED ([SubmissionId] ASC, [UserId] ASC),
    CONSTRAINT [FK_SubmissionLike_Submission] FOREIGN KEY ([SubmissionId]) REFERENCES [selfie].[Submission] ([SubmissionId]) ON DELETE CASCADE,
    CONSTRAINT [FK_SubmissionLike_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId])
);
GO

CREATE NONCLUSTERED INDEX [IX_SubmissionLike_User]
    ON [selfie].[SubmissionLike] ([UserId]);
GO
