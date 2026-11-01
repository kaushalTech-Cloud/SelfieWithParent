-- A page's content in one language. English ('en') holds the full page: the ordered list of blocks with their
-- layout, links, icons and images. Other languages hold only translated text, matched to the English blocks / items
-- by their "id"; anything not translated shows the English text. The API validates the JSON before saving.
CREATE TABLE [site].[PageContent]
(
    [PageId]            INT             NOT NULL,
    [LanguageCode]      VARCHAR (5)     NOT NULL,
    [Title]             NVARCHAR (120)  NOT NULL,     -- browser tab / share title
    [Description]       NVARCHAR (300)  NULL,         -- search engines / share previews
    [BlocksJson]        NVARCHAR (MAX)  NOT NULL,     -- JSON array of blocks
    [UpdatedAtUtc]      DATETIME2 (0)   NOT NULL CONSTRAINT [DF_PageContent_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedByUserId]   BIGINT          NULL,

    CONSTRAINT [PK_PageContent] PRIMARY KEY CLUSTERED ([PageId] ASC, [LanguageCode] ASC),
    CONSTRAINT [FK_PageContent_Page] FOREIGN KEY ([PageId]) REFERENCES [site].[Page] ([PageId]) ON DELETE CASCADE,
    CONSTRAINT [FK_PageContent_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_PageContent_Language] CHECK ([LanguageCode] IN ('en', 'hi', 'bn', 'ar', 'es', 'fr')),
    CONSTRAINT [CK_PageContent_Json] CHECK (ISJSON([BlocksJson]) = 1 AND LEFT(LTRIM([BlocksJson]), 1) = '['),
    CONSTRAINT [CK_PageContent_Size] CHECK (LEN([BlocksJson]) <= 200000),
    CONSTRAINT [CK_PageContent_NoMarkup] CHECK ([Title] NOT LIKE '%<%' AND ISNULL([Description], N'') NOT LIKE '%<%')
);
GO
