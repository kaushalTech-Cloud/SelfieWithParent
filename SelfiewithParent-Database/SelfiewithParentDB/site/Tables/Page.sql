-- A content page built in the admin site (About us, Our founder, ...). It is shown at '/<Slug>' on the website
-- once published. The content itself (title + blocks) is in site.PageContent, one row per language.
-- Written only through the site.usp_* page procedures (SuperAdmin / Admin), never directly by the website.
CREATE TABLE [site].[Page]
(
    [PageId]            INT             IDENTITY (1, 1) NOT NULL,
    [Slug]              VARCHAR (60)    NOT NULL,     -- web address: lower-case words joined by single hyphens, e.g. 'about', 'what-we-do'
    [IsPublished]       BIT             NOT NULL CONSTRAINT [DF_Page_IsPublished] DEFAULT (0),
    [CreatedAtUtc]      DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Page_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [CreatedByUserId]   BIGINT          NULL,         -- NULL = set up by the database owner (seed)
    [UpdatedAtUtc]      DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Page_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedByUserId]   BIGINT          NULL,

    CONSTRAINT [PK_Page] PRIMARY KEY CLUSTERED ([PageId] ASC),
    CONSTRAINT [UQ_Page_Slug] UNIQUE NONCLUSTERED ([Slug] ASC),
    CONSTRAINT [FK_Page_CreatedBy] FOREIGN KEY ([CreatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [FK_Page_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    -- a-z, 0-9 and single hyphens, not at the start or end
    CONSTRAINT [CK_Page_Slug] CHECK ([Slug] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9-]%'
        AND [Slug] NOT LIKE '-%' AND [Slug] NOT LIKE '%-' AND [Slug] NOT LIKE '%--%' AND LEN([Slug]) >= 2)
);
GO
