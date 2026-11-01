/*
One-time upgrade of the admin sidebar to accordion groups: Review, Website, People, Reports (Dashboard stays on its own).
Seed.Menus.sql adds the (empty) groups; this moves the existing pages into them. Runs only while no admin page sits inside
a group yet, so changes made later are never undone.
*/
SET NOCOUNT ON;

DECLARE @admin SMALLINT = (SELECT [MenuId] FROM [site].[Menu] WHERE [MenuCode] = 'admin');

IF @admin IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [MenuId] = @admin AND [ParentMenuItemId] IS NOT NULL)
   AND (SELECT COUNT(*) FROM [site].[MenuItem] WHERE [MenuId] = @admin AND [ItemKey] IN ('review', 'website', 'people', 'reports') AND [ItemType] = 'Dropdown') = 4
BEGIN
    UPDATE i SET i.[ParentMenuItemId] = g.[MenuItemId], i.[UpdatedAtUtc] = SYSUTCDATETIME()
    FROM [site].[MenuItem] AS i
    JOIN (VALUES ('queue', 'review'), ('parent-stories', 'review'), ('uploads', 'review'), ('winners', 'review'),
                 ('home', 'website'), ('pages', 'website'), ('menus', 'website'), ('support-page', 'website'), ('features', 'website'),
                 ('visitors', 'people'), ('messages', 'people'), ('staff', 'people'),
                 ('activity', 'reports'), ('donations', 'reports')) AS s ([ItemKey], [GroupKey]) ON s.[ItemKey] = i.[ItemKey]
    JOIN [site].[MenuItem] AS g ON g.[MenuId] = @admin AND g.[ItemKey] = s.[GroupKey]
    WHERE i.[MenuId] = @admin AND i.[ItemType] = 'Link';
END
GO
