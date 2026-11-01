-- Records every profile photo added, replaced and removed in audit.ChangeLog (never the photo itself).
CREATE TRIGGER [auth].[trg_ProfilePhoto_Audit]
    ON [auth].[ProfilePhoto]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'auth.ProfilePhoto', COALESCE(i.[UserId], d.[UserId]),
           CASE WHEN d.[UserId] IS NULL THEN 'I' WHEN i.[UserId] IS NULL THEN 'D' ELSE 'U' END,
           IIF(i.[UserId] IS NULL, NULL, CONCAT(N'ContentType=', i.[ContentType], N',SizeBytes=', i.[SizeBytes])),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[UserId] = i.[UserId];
END;
GO
