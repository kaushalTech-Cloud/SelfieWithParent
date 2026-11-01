-- Family albums ("tag your sibling"): a visitor starts an album from their selfie with a parent and sends the invite link
-- to a brother, sister or cousin, who adds their own selfie with the same parent. The album page (/albums/{PublicId})
-- shows the approved selfies in it. Only visitors with a selfie in the album see the invite code. Written only through
-- selfie.usp_StartAlbum / usp_JoinAlbum / usp_LeaveAlbum. Not row-level secured: nothing here is private (the selfies
-- in an album are shown only once approved, as in the gallery), and the procedures check the selfie is the caller's own.
CREATE TABLE [selfie].[FamilyAlbum]
(
    [AlbumId]          BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]         UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_FamilyAlbum_PublicId] DEFAULT (NEWID()),
    [InviteCode]       VARCHAR (12)        NOT NULL,     -- the /albums/join/{code} link
    [CreatedByUserId]  BIGINT              NULL,         -- NULL once that visitor deleted their account
    [CreatedAtUtc]     DATETIME2 (0)       NOT NULL CONSTRAINT [DF_FamilyAlbum_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_FamilyAlbum] PRIMARY KEY CLUSTERED ([AlbumId] ASC),
    CONSTRAINT [UQ_FamilyAlbum_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [UQ_FamilyAlbum_InviteCode] UNIQUE NONCLUSTERED ([InviteCode] ASC),
    CONSTRAINT [FK_FamilyAlbum_User] FOREIGN KEY ([CreatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_FamilyAlbum_InviteCode] CHECK (LEN([InviteCode]) = 10 AND [InviteCode] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9]%')
);
GO

-- The selfies in an album (a selfie is in one album at most). Deleting the selfie takes it out of the album.
CREATE TABLE [selfie].[AlbumSubmission]
(
    [AlbumId]       BIGINT          NOT NULL,
    [SubmissionId]  BIGINT          NOT NULL,
    [AddedAtUtc]    DATETIME2 (0)   NOT NULL CONSTRAINT [DF_AlbumSubmission_AddedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_AlbumSubmission] PRIMARY KEY CLUSTERED ([AlbumId] ASC, [SubmissionId] ASC),
    CONSTRAINT [UQ_AlbumSubmission_Submission] UNIQUE NONCLUSTERED ([SubmissionId] ASC),
    CONSTRAINT [FK_AlbumSubmission_Album] FOREIGN KEY ([AlbumId]) REFERENCES [selfie].[FamilyAlbum] ([AlbumId]) ON DELETE CASCADE,
    CONSTRAINT [FK_AlbumSubmission_Submission] FOREIGN KEY ([SubmissionId]) REFERENCES [selfie].[Submission] ([SubmissionId]) ON DELETE CASCADE
);
GO
