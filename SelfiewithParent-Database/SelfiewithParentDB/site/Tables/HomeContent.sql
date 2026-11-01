-- The home page's content, edited by super admins / admins in the admin site (Home page): the top slider, action tiles,
-- founder's message, impact numbers, questions, monthly themes, programme priorities, pledge and app links.
-- One JSON document per language ('en' is the base; other languages only hold what's translated). Anything not set here
-- shows the website's built-in default, so the home page is never blank. The API checks the JSON's shape before saving.
-- Written only through site.usp_SaveHomeContent; every change is recorded in audit.ChangeLog.
CREATE TABLE [site].[HomeContent]
(
    [LanguageCode]    VARCHAR (5)     NOT NULL,
    [ContentJson]     NVARCHAR (MAX)  NOT NULL,
    [UpdatedByUserId] BIGINT          NULL,
    [UpdatedAtUtc]    DATETIME2 (0)   NOT NULL CONSTRAINT [DF_HomeContent_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_HomeContent] PRIMARY KEY CLUSTERED ([LanguageCode] ASC),
    CONSTRAINT [FK_HomeContent_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_HomeContent_Language] CHECK ([LanguageCode] IN ('en', 'hi', 'bn', 'ar', 'es', 'fr')),
    CONSTRAINT [CK_HomeContent_Json] CHECK (ISJSON([ContentJson]) = 1 AND LEN([ContentJson]) <= 100000)
);
GO

-- Records every change (which language, who) in audit.ChangeLog — never the content.
CREATE TRIGGER [site].[trg_HomeContent_Audit]
    ON [site].[HomeContent]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'site.HomeContent', 0,
           CASE WHEN d.[LanguageCode] IS NULL THEN 'I' WHEN i.[LanguageCode] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'Language=', COALESCE(i.[LanguageCode], d.[LanguageCode])),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[LanguageCode] = i.[LanguageCode];
END;
GO
