-- Records every role grant, change and removal in audit.ChangeLog (role changes are security-sensitive).
CREATE TRIGGER [auth].[trg_UserRole_Audit]
    ON [auth].[UserRole]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));

    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'auth.UserRole', i.[UserRoleId], 'I', CONCAT(N'UserId=', i.[UserId], N',RoleId=', i.[RoleId]), @actor, @scope
    FROM inserted AS i
    WHERE NOT EXISTS (SELECT 1 FROM deleted AS d WHERE d.[UserRoleId] = i.[UserRoleId]);

    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'auth.UserRole', d.[UserRoleId], 'D', CONCAT(N'UserId=', d.[UserId], N',RoleId=', d.[RoleId]), @actor, @scope
    FROM deleted AS d
    WHERE NOT EXISTS (SELECT 1 FROM inserted AS i WHERE i.[UserRoleId] = d.[UserRoleId]);

    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'auth.UserRole', i.[UserRoleId], 'U', CONCAT(N'UserId=', i.[UserId], N',RoleId=', i.[RoleId], N',ExpiresAtUtc'), @actor, @scope
    FROM inserted AS i
    JOIN deleted  AS d ON d.[UserRoleId] = i.[UserRoleId];
END;
GO
