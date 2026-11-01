-- Records every menu change in audit.ChangeLog (a changed link is security-sensitive: it could point visitors elsewhere).
CREATE TRIGGER [site].[trg_MenuItem_Audit]
    ON [site].[MenuItem]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));

    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'site.MenuItem', COALESCE(i.[MenuItemId], d.[MenuItemId]),
           CASE WHEN d.[MenuItemId] IS NULL THEN 'I' WHEN i.[MenuItemId] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'ItemKey=', COALESCE(i.[ItemKey], d.[ItemKey]),
                  CASE WHEN i.[MenuItemId] IS NOT NULL AND d.[MenuItemId] IS NOT NULL
                            AND EXISTS (SELECT i.[Url] EXCEPT SELECT d.[Url]) THEN N',Url' END,
                  CASE WHEN i.[MenuItemId] IS NOT NULL AND d.[MenuItemId] IS NOT NULL
                            AND EXISTS (SELECT i.[Label], i.[Visibility], i.[RequiredRoleId], i.[IsActive], i.[SortOrder]
                                        EXCEPT SELECT d.[Label], d.[Visibility], d.[RequiredRoleId], d.[IsActive], d.[SortOrder]) THEN N',Display' END),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[MenuItemId] = i.[MenuItemId];
END;
GO
