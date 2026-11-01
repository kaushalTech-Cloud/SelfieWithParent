/*
One-time upgrade of the public About menu to the page-builder pages (/about, /founder, /journey, /what-we-do).
Runs only while the items still have their original links, so changes made later in the admin site are never undone.
*/
SET NOCOUNT ON;

DECLARE @main SMALLINT = (SELECT [MenuId] FROM [site].[Menu] WHERE [MenuCode] = 'main');
DECLARE @about INT = (SELECT [MenuItemId] FROM [site].[MenuItem] WHERE [MenuId] = @main AND [ItemKey] = 'about');

IF @about IS NOT NULL AND EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [MenuId] = @main AND [ItemKey] = 'about.story' AND [Url] = '/#about')
BEGIN
    UPDATE [site].[MenuItem] SET [Label] = N'About Us', [Url] = N'/about', [SortOrder] = 10, [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [MenuId] = @main AND [ItemKey] = 'about.story';
    UPDATE l SET l.[Label] = s.[Label]
    FROM [site].[MenuItemLabel] AS l
    JOIN [site].[MenuItem] AS i ON i.[MenuItemId] = l.[MenuItemId] AND i.[MenuId] = @main AND i.[ItemKey] = 'about.story'
    JOIN (VALUES ('hi', N'हमारे बारे में'), ('bn', N'আমাদের সম্পর্কে'), ('ar', N'من نحن'), ('es', N'Sobre nosotros'), ('fr', N'À propos de nous')) AS s ([LanguageCode], [Label]) ON s.[LanguageCode] = l.[LanguageCode];

    INSERT [site].[MenuItem] ([MenuId], [ItemKey], [ParentMenuItemId], [ItemType], [Label], [Url], [Visibility], [SortOrder])
    SELECT @main, s.[ItemKey], @about, 'Link', s.[Label], s.[Url], 'Always', s.[SortOrder]
    FROM (VALUES ('about.founder', N'Our Founder', N'/founder', 13), ('about.journey', N'Our Journey', N'/journey', 16)) AS s ([ItemKey], [Label], [Url], [SortOrder])
    WHERE NOT EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [MenuId] = @main AND [ItemKey] = s.[ItemKey]);

    INSERT [site].[MenuItemLabel] ([MenuItemId], [LanguageCode], [Label])
    SELECT i.[MenuItemId], s.[LanguageCode], s.[Label]
    FROM (VALUES ('about.founder', 'hi', N'हमारे संस्थापक'), ('about.founder', 'bn', N'আমাদের প্রতিষ্ঠাতা'), ('about.founder', 'ar', N'مؤسِّسنا'), ('about.founder', 'es', N'Nuestro fundador'), ('about.founder', 'fr', N'Notre fondateur'), ('about.journey', 'hi', N'हमारा सफ़र'), ('about.journey', 'bn', N'আমাদের যাত্রা'), ('about.journey', 'ar', N'رحلتنا'), ('about.journey', 'es', N'Nuestro camino'), ('about.journey', 'fr', N'Notre parcours')
    ) AS s ([ItemKey], [LanguageCode], [Label])
    JOIN [site].[MenuItem] AS i ON i.[MenuId] = @main AND i.[ItemKey] = s.[ItemKey]
    WHERE NOT EXISTS (SELECT 1 FROM [site].[MenuItemLabel] AS x WHERE x.[MenuItemId] = i.[MenuItemId] AND x.[LanguageCode] = s.[LanguageCode]);
END

IF EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [MenuId] = @main AND [ItemKey] = 'about.what-we-do' AND [Url] = '/#priorities')
    UPDATE [site].[MenuItem] SET [Url] = N'/what-we-do', [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [MenuId] = @main AND [ItemKey] = 'about.what-we-do';
GO
