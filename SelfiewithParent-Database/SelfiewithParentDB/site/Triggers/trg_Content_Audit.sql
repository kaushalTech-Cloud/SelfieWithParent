-- Records every change to content pages and uploaded images in audit.ChangeLog (who changed what, never the content).
CREATE TRIGGER [site].[trg_Page_Audit]
    ON [site].[Page]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'site.Page', COALESCE(i.[PageId], d.[PageId]),
           CASE WHEN d.[PageId] IS NULL THEN 'I' WHEN i.[PageId] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'Slug=', COALESCE(i.[Slug], d.[Slug]),
                  CASE WHEN i.[PageId] IS NOT NULL AND d.[PageId] IS NOT NULL AND i.[Slug] <> d.[Slug] THEN CONCAT(N',was=', d.[Slug]) END,
                  CASE WHEN i.[PageId] IS NOT NULL AND d.[PageId] IS NOT NULL AND i.[IsPublished] <> d.[IsPublished]
                       THEN IIF(i.[IsPublished] = 1, N',Published', N',Unpublished') END),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[PageId] = i.[PageId];
END;
GO

CREATE TRIGGER [site].[trg_PageContent_Audit]
    ON [site].[PageContent]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'site.PageContent', COALESCE(i.[PageId], d.[PageId]),
           CASE WHEN d.[PageId] IS NULL THEN 'I' WHEN i.[PageId] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'Language=', COALESCE(i.[LanguageCode], d.[LanguageCode])),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[PageId] = i.[PageId] AND d.[LanguageCode] = i.[LanguageCode];
END;
GO

CREATE TRIGGER [site].[trg_Media_Audit]
    ON [site].[Media]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'site.Media', COALESCE(i.[MediaId], d.[MediaId]),
           CASE WHEN d.[MediaId] IS NULL THEN 'I' WHEN i.[MediaId] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'Type=', COALESCE(i.[ContentType], d.[ContentType]), N',Bytes=', COALESCE(i.[SizeBytes], d.[SizeBytes])),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[MediaId] = i.[MediaId];
END;
GO
