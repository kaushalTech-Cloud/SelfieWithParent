-- Site settings that staff switch in the admin site, e.g. 'frames.auto-approve' (1: photo frames shared by visitors go
-- straight to the Photo Frames gallery; 0: they wait in the review queue), and the public contact details
-- ('contact.email', 'contact.phone', 'contact.address'; empty = not shown), the website's features ('feature.then-now', …,
-- 'feature.support'; 0 = switched off: gone from menus, buttons and pages) and contact lines ('show.contact-email', …).
-- Changed only through site.usp_SetSetting (SuperAdmin / Admin); every change is recorded in audit.ChangeLog.
CREATE TABLE [site].[Setting]
(
    [SettingId]       SMALLINT        IDENTITY (1, 1) NOT NULL,
    [SettingKey]      VARCHAR (50)    NOT NULL,
    [Value]           NVARCHAR (200)  NOT NULL,
    [UpdatedByUserId] BIGINT          NULL,           -- NULL: the starting value from the deployment
    [UpdatedAtUtc]    DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Setting_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Setting] PRIMARY KEY CLUSTERED ([SettingId] ASC),
    CONSTRAINT [UQ_Setting_SettingKey] UNIQUE NONCLUSTERED ([SettingKey] ASC),
    CONSTRAINT [FK_Setting_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_Setting_SettingKey] CHECK ([SettingKey] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9.-]%'),
    -- On / off switches: 'feature.*' (a whole website feature) and 'show.*' (a contact line in the top bar / footer) too
    CONSTRAINT [CK_Setting_OnOff] CHECK (([SettingKey] NOT IN ('frames.auto-approve', 'donations.enabled') AND [SettingKey] NOT LIKE 'feature.%' AND [SettingKey] NOT LIKE 'show.%')
        OR [Value] IN (N'0', N'1')),
    -- Shown as text on the website; refusing markup is a second line of defence
    CONSTRAINT [CK_Setting_NoMarkup] CHECK ([Value] NOT LIKE '%[<>]%')
);
GO

-- Records every settings change (which setting, its new value, who) in audit.ChangeLog.
CREATE TRIGGER [site].[trg_Setting_Audit]
    ON [site].[Setting]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'site.Setting', COALESCE(i.[SettingId], d.[SettingId]),
           CASE WHEN d.[SettingId] IS NULL THEN 'I' WHEN i.[SettingId] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'Key=', COALESCE(i.[SettingKey], d.[SettingKey]), N',Value=', i.[Value]),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[SettingId] = i.[SettingId];
END;
GO
