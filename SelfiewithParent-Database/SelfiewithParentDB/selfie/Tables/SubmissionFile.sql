-- The photo(s) and video of a submission, stored in the database.
--   main   : the selfie / family photo (PNG, JPEG or WebP, up to 10 MB)
--   source : 'ai' only, optional — the original photo the AI image was made from (up to 10 MB)
--   then   : 'thennow' only — the old photo (main is the same picture today), up to 10 MB
--   video  : MP4, WebM or MOV, up to 50 MB (instead of the photo; a family can share both)
--   voice  : optional voice note with a photo or AI-made photo (not with a video or a family share): WebM / Ogg / MP3 /
--            M4A / WAV audio, up to 5 MB (about a minute)
-- The API checks each file's real type from its first bytes. UserId repeats the owner for row-level security.
CREATE TABLE [selfie].[SubmissionFile]
(
    [FileId]        BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]      UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_SubmissionFile_PublicId] DEFAULT (NEWID()),
    [SubmissionId]  BIGINT              NOT NULL,
    [UserId]        BIGINT              NOT NULL,
    [Role]          VARCHAR (10)        NOT NULL,
    [ContentType]   VARCHAR (20)        NOT NULL,
    [FileName]      NVARCHAR (150)      NULL,         -- original name, for staff only
    [Data]          VARBINARY (MAX)     NOT NULL,
    [SizeBytes]     INT                 NOT NULL,
    [CreatedAtUtc]  DATETIME2 (0)       NOT NULL CONSTRAINT [DF_SubmissionFile_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_SubmissionFile] PRIMARY KEY CLUSTERED ([FileId] ASC),
    CONSTRAINT [UQ_SubmissionFile_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [UQ_SubmissionFile_Role] UNIQUE NONCLUSTERED ([SubmissionId] ASC, [Role] ASC),
    CONSTRAINT [FK_SubmissionFile_Submission] FOREIGN KEY ([SubmissionId]) REFERENCES [selfie].[Submission] ([SubmissionId]) ON DELETE CASCADE,
    CONSTRAINT [FK_SubmissionFile_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_SubmissionFile_Type] CHECK (
        ([Role] IN ('main', 'source', 'then') AND [ContentType] IN ('image/png', 'image/jpeg', 'image/webp') AND [SizeBytes] <= 10485760)
        OR ([Role] = 'video' AND [ContentType] IN ('video/mp4', 'video/webm', 'video/quicktime') AND [SizeBytes] <= 52428800)
        OR ([Role] = 'voice' AND [ContentType] IN ('audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav') AND [SizeBytes] <= 5242880)),
    CONSTRAINT [CK_SubmissionFile_Size] CHECK ([SizeBytes] = DATALENGTH([Data]) AND [SizeBytes] >= 1),
    CONSTRAINT [CK_SubmissionFile_FileName] CHECK ([FileName] IS NULL OR [FileName] NOT LIKE '%[<>]%')
);
GO
