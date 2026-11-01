-- A candle lit on the Memory Wall: one per signed-in visitor per approved "in loving memory" tribute (lit again = put out).
-- Written only through selfie.usp_SetCandle (the visitor's own candle). Row-level security keeps each row to its owner;
-- the wall's counts are read in System scope.
CREATE TABLE [selfie].[Candle]
(
    [SubmissionId]  BIGINT          NOT NULL,
    [UserId]        BIGINT          NOT NULL,
    [CreatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Candle_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Candle] PRIMARY KEY CLUSTERED ([SubmissionId] ASC, [UserId] ASC),
    CONSTRAINT [FK_Candle_Submission] FOREIGN KEY ([SubmissionId]) REFERENCES [selfie].[Submission] ([SubmissionId]) ON DELETE CASCADE,
    CONSTRAINT [FK_Candle_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId])
);
GO
