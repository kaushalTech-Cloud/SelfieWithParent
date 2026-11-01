-- Site settings: the only way the website can change them. Active SuperAdmin or Admin only (id from the read-only
-- session context), run as swp_staff_admin, audited by trigger. Only known settings can be set.
CREATE PROCEDURE [site].[usp_SetSetting]
    @SettingKey VARCHAR (50),
    @Value      NVARCHAR (200)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can change settings.', 1;
    IF @SettingKey NOT IN ('frames.auto-approve', 'donations.enabled', 'contact.email', 'contact.phone', 'contact.address',
        'feature.then-now', 'feature.memories', 'feature.family-tree', 'feature.contest', 'feature.photo-frames', 'feature.reels', 'feature.parents-voices', 'feature.support', 'feature.streaks', 'feature.profiles', 'feature.albums', 'show.contact-email', 'show.contact-phone', 'show.contact-address')
        THROW 50025, N'That setting wasn''t found.', 1;
    SET @Value = LTRIM(RTRIM(ISNULL(@Value, N'')));
    IF @SettingKey = 'contact.email' AND @Value <> N'' AND (@Value NOT LIKE '%_@_%._%' OR @Value LIKE '% %')
        THROW 50023, N'Enter a valid email address.', 1;
    IF @SettingKey = 'contact.phone' AND @Value COLLATE Latin1_General_BIN2 LIKE '%[^0-9+ ()-]%'
        THROW 50023, N'A phone number can only have digits, spaces, +, - and brackets.', 1;
    IF @Value LIKE '%[<>]%'
        THROW 50023, N'Text can''t contain < or >.', 1;

    UPDATE [site].[Setting] SET [Value] = @Value, [UpdatedByUserId] = @actor, [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [SettingKey] = @SettingKey;
    IF @@ROWCOUNT = 0
        INSERT [site].[Setting] ([SettingKey], [Value], [UpdatedByUserId]) VALUES (@SettingKey, @Value, @actor);
END;
GO
