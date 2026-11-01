-- Records every password set, change, removal and lock in audit.ChangeLog.
-- Only what happened is logged ("PasswordHash changed", "FailedAttempts"), never the hash itself.
CREATE TRIGGER [auth].[trg_UserPassword_Audit]
    ON [auth].[UserPassword]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));

    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'auth.UserPassword', i.[UserId], 'I', IIF(i.[PasswordHash] IS NULL, NULL, N'PasswordHash'), @actor, @scope
    FROM inserted AS i
    WHERE NOT EXISTS (SELECT 1 FROM deleted AS d WHERE d.[UserId] = i.[UserId]);

    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ActorUserId], [AccessScope])
    SELECT N'auth.UserPassword', d.[UserId], 'D', @actor, @scope
    FROM deleted AS d
    WHERE NOT EXISTS (SELECT 1 FROM inserted AS i WHERE i.[UserId] = d.[UserId]);

    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'auth.UserPassword', i.[UserId], 'U', c.[Cols], @actor, @scope
    FROM inserted AS i
    JOIN deleted  AS d ON d.[UserId] = i.[UserId]
    CROSS APPLY (SELECT STUFF(CONCAT(
        IIF(ISNULL(i.[PasswordHash], '') <> ISNULL(d.[PasswordHash], ''),
            IIF(i.[PasswordHash] IS NULL, N',PasswordHash removed', N',PasswordHash changed'), N''),
        IIF(i.[FailedAttempts] <> d.[FailedAttempts], N',FailedAttempts', N''),
        IIF(ISNULL(i.[LockedUntilUtc], '19000101') <> ISNULL(d.[LockedUntilUtc], '19000101'), N',LockedUntilUtc', N'')
    ), 1, 1, N'') AS [Cols]) AS c
    WHERE c.[Cols] IS NOT NULL;
END;
GO
