-- Images uploaded in the admin site for content pages (e.g. the founder's photo). Shown at /api/v1/media/<PublicId>.
-- Only PNG, JPEG and WebP up to 2 MB (the API checks the file's real type, not just its name). No SVG uploads: it can carry script.
-- The website's own pictures (Scripts\Seed.SiteImages.sql) are SVG; they are set up by the database owner
-- (CreatedByUserId NULL, IsSystem = 1) and can't be deleted from the admin site.
CREATE TABLE [site].[Media]
(
    [MediaId]           BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]          UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_Media_PublicId] DEFAULT (NEWID()),
    [FileName]          NVARCHAR (150)      NOT NULL,     -- original name, for the admin list only
    [ContentType]       VARCHAR (20)        NOT NULL,
    [Data]              VARBINARY (MAX)     NOT NULL,
    [SizeBytes]         INT                 NOT NULL,
    [CreatedAtUtc]      DATETIME2 (0)       NOT NULL CONSTRAINT [DF_Media_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [CreatedByUserId]   BIGINT              NULL,
    [IsSystem]          BIT                 NOT NULL CONSTRAINT [DF_Media_IsSystem] DEFAULT (0),   -- a website picture (seeded)

    CONSTRAINT [PK_Media] PRIMARY KEY CLUSTERED ([MediaId] ASC),
    CONSTRAINT [UQ_Media_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_Media_CreatedBy] FOREIGN KEY ([CreatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_Media_ContentType] CHECK ([ContentType] IN ('image/png', 'image/jpeg', 'image/webp')
        OR ([ContentType] = 'image/svg+xml' AND [IsSystem] = 1 AND [CreatedByUserId] IS NULL)),
    CONSTRAINT [CK_Media_Size] CHECK ([SizeBytes] = DATALENGTH([Data]) AND [SizeBytes] BETWEEN 1 AND 2097152),
    CONSTRAINT [CK_Media_FileName] CHECK ([FileName] NOT LIKE '%<%' AND [FileName] NOT LIKE '%>%' AND LEN([FileName]) >= 1)
);
GO
