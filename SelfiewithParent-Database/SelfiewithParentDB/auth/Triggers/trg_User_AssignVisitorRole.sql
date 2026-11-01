-- Gives every new account the Visitor role (RoleId 6).
-- The website connection is denied writes to auth.UserRole; this trigger is owned by dbo like the table,
-- so the database can do it on the website's behalf without the website ever being able to grant roles.
CREATE TRIGGER [auth].[trg_User_AssignVisitorRole]
    ON [auth].[User]
    AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT [auth].[UserRole] ([UserId], [RoleId])
    SELECT i.[UserId], 6
    FROM inserted AS i
    WHERE NOT EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur WHERE ur.[UserId] = i.[UserId] AND ur.[RoleId] = 6);
END;
GO
