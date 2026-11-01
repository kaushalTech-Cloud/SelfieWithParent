-- The home page's content (site.HomeContent). Active SuperAdmin or Admin only (id from the read-only session context);
-- runs as swp_staff_admin; audited by trigger. The API has already checked the JSON's shape.
-- @ContentJson NULL removes the language's content (the website shows its built-in defaults again).
CREATE PROCEDURE [site].[usp_SaveHomeContent]
    @LanguageCode VARCHAR (5),
    @ContentJson  NVARCHAR (MAX)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can edit the home page.', 1;
    IF @LanguageCode NOT IN ('en', 'hi', 'bn', 'ar', 'es', 'fr')
        THROW 50023, N'Choose a language.', 1;
    IF @ContentJson IS NULL
    BEGIN
        DELETE [site].[HomeContent] WHERE [LanguageCode] = @LanguageCode;
        RETURN;
    END;
    IF ISJSON(@ContentJson) <> 1
        THROW 50023, N'The home page content isn''t valid.', 1;
    UPDATE [site].[HomeContent] SET [ContentJson] = @ContentJson, [UpdatedByUserId] = @actor, [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [LanguageCode] = @LanguageCode;
    IF @@ROWCOUNT = 0
        INSERT [site].[HomeContent] ([LanguageCode], [ContentJson], [UpdatedByUserId]) VALUES (@LanguageCode, @ContentJson, @actor);
END;
GO
