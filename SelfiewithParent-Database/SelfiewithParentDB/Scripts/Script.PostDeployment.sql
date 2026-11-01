/*
Post-deployment script: loads fixed reference data. Safe to run on every publish (MERGE).
*/
SET NOCOUNT ON;

MERGE [auth].[Role] AS t
USING (VALUES
    (1, 'SuperAdmin',     N'Super admin',     N'Full access to the admin site, including managing staff roles.'),
    (2, 'Admin',          N'Admin',           N'Manages content, winners, schools and campaign settings.'),
    (3, 'Moderator',      N'Moderator',       N'Reviews uploads: approve, reject or feature.'),
    (4, 'Support',        N'Support',         N'Helps visitors. Read-only, personal data masked.'),
    (5, 'PrivacyOfficer', N'Privacy officer', N'Handles download / delete-my-data requests and reads the audit log.'),
    (6, 'Visitor',        N'Visitor',         N'Registered visitor who shares family photos, videos and stories. Given automatically to every account.')
) AS s ([RoleId], [RoleCode], [Name], [Description])
    ON t.[RoleId] = s.[RoleId]
WHEN MATCHED AND (t.[RoleCode] <> s.[RoleCode] OR t.[Name] <> s.[Name] OR ISNULL(t.[Description], N'') <> s.[Description]) THEN
    UPDATE SET t.[RoleCode] = s.[RoleCode], t.[Name] = s.[Name], t.[Description] = s.[Description]
WHEN NOT MATCHED BY TARGET THEN
    INSERT ([RoleId], [RoleCode], [Name], [Description]) VALUES (s.[RoleId], s.[RoleCode], s.[Name], s.[Description]);
GO

-- Every existing account gets the Visitor role (new accounts get it from auth.trg_User_AssignVisitorRole)
INSERT [auth].[UserRole] ([UserId], [RoleId])
SELECT u.[UserId], 6
FROM [auth].[User] AS u
WHERE NOT EXISTS (SELECT 1 FROM [auth].[UserRole] AS ur WHERE ur.[UserId] = u.[UserId] AND ur.[RoleId] = 6);
GO

-- The website's own pictures, stored in site.Media (insert-only, fixed ids)
:r .\Seed.SiteImages.sql

-- Site settings and their starting values (insert-only: what staff set later is kept)
INSERT [site].[Setting] ([SettingKey], [Value])
SELECT s.[SettingKey], s.[Value]
FROM (VALUES ('frames.auto-approve', N'0'), ('donations.enabled', N'0'), ('contact.email', N'hello@selfiewithparent.org'), ('contact.phone', N'+91-00000-00000'),
             ('contact.address', N''),
             ('feature.then-now', N'1'), ('feature.memories', N'1'), ('feature.family-tree', N'1'), ('feature.contest', N'1'), ('feature.photo-frames', N'1'),
             ('feature.reels', N'1'), ('feature.parents-voices', N'1'), ('feature.support', N'1'), ('feature.streaks', N'1'), ('feature.profiles', N'1'), ('feature.albums', N'1'),
             ('show.contact-email', N'1'), ('show.contact-phone', N'1'), ('show.contact-address', N'1')) AS s ([SettingKey], [Value])
WHERE NOT EXISTS (SELECT 1 FROM [site].[Setting] AS x WHERE x.[SettingKey] = s.[SettingKey]);
GO

-- Navigation menus (insert-only; edits made later in the database are kept)
:r .\Seed.Menus.sql

-- One-time: About menu -> page-builder pages (only while it still has its original links)
:r .\Upgrade.AboutMenu.sql

-- One-time: admin sidebar pages -> accordion groups (only while no admin page is in a group yet)
:r .\Upgrade.AdminMenuGroups.sql

-- Content pages built with the page builder: the About pages (insert-only; admin edits are kept)
:r .\Seed.Pages.sql

-- Pages that still point at the website's picture files (img/...) use the pictures in the database instead
:r .\Upgrade.SiteImages.sql
