-- Content pages: the only way the website can create / change / delete them.
-- Every procedure: the caller (read-only session context, set by the API for the signed-in user) must be an active
-- SuperAdmin or Admin. They run as the login-less user swp_staff_admin (the website login can only read the site schema).
-- Changes are recorded in audit.ChangeLog by the table triggers. Errors 50020-50029 are reported to the editor.

CREATE PROCEDURE [site].[usp_CreatePage]
    @Slug   VARCHAR (60),
    @Title  NVARCHAR (120)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage pages.', 1;
    IF EXISTS (SELECT 1 FROM [site].[Page] WHERE [Slug] = @Slug)
        THROW 50022, N'Another page already uses that web address.', 1;

    DECLARE @new TABLE ([PageId] INT);
    BEGIN TRY
        BEGIN TRANSACTION;
        INSERT [site].[Page] ([Slug], [CreatedByUserId], [UpdatedByUserId]) OUTPUT inserted.[PageId] INTO @new VALUES (@Slug, @actor, @actor);
        INSERT [site].[PageContent] ([PageId], [LanguageCode], [Title], [BlocksJson], [UpdatedByUserId])
        SELECT [PageId], 'en', @Title, N'[]', @actor FROM @new;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- never leave the caller with an open transaction
        THROW;
    END CATCH;
    SELECT [PageId] FROM @new;
END;
GO

CREATE PROCEDURE [site].[usp_UpdatePage]
    @PageId      INT,
    @Slug        VARCHAR (60),
    @IsPublished BIT
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage pages.', 1;
    IF NOT EXISTS (SELECT 1 FROM [site].[Page] WHERE [PageId] = @PageId)
        THROW 50021, N'That page wasn''t found.', 1;
    IF EXISTS (SELECT 1 FROM [site].[Page] WHERE [Slug] = @Slug AND [PageId] <> @PageId)
        THROW 50022, N'Another page already uses that web address.', 1;

    UPDATE [site].[Page]
       SET [Slug] = @Slug, [IsPublished] = @IsPublished, [UpdatedAtUtc] = SYSUTCDATETIME(), [UpdatedByUserId] = @actor
     WHERE [PageId] = @PageId;
END;
GO

CREATE PROCEDURE [site].[usp_SavePageContent]
    @PageId       INT,
    @LanguageCode VARCHAR (5),
    @Title        NVARCHAR (120),
    @Description  NVARCHAR (300),
    @BlocksJson   NVARCHAR (MAX)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage pages.', 1;
    IF NOT EXISTS (SELECT 1 FROM [site].[Page] WHERE [PageId] = @PageId)
        THROW 50021, N'That page wasn''t found.', 1;
    IF ISJSON(@BlocksJson) <> 1 OR LEFT(LTRIM(@BlocksJson), 1) <> '['
        THROW 50023, N'The page content isn''t valid.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;
        UPDATE [site].[PageContent]
           SET [Title] = @Title, [Description] = NULLIF(LTRIM(RTRIM(@Description)), N''), [BlocksJson] = @BlocksJson,
               [UpdatedAtUtc] = SYSUTCDATETIME(), [UpdatedByUserId] = @actor
         WHERE [PageId] = @PageId AND [LanguageCode] = @LanguageCode;
        IF @@ROWCOUNT = 0
            INSERT [site].[PageContent] ([PageId], [LanguageCode], [Title], [Description], [BlocksJson], [UpdatedByUserId])
            VALUES (@PageId, @LanguageCode, @Title, NULLIF(LTRIM(RTRIM(@Description)), N''), @BlocksJson, @actor);
        UPDATE [site].[Page] SET [UpdatedAtUtc] = SYSUTCDATETIME(), [UpdatedByUserId] = @actor WHERE [PageId] = @PageId;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- never leave the caller with an open transaction
        THROW;
    END CATCH;
END;
GO

-- Removes one translation (the page then shows English in that language). English itself can't be removed.
CREATE PROCEDURE [site].[usp_DeletePageContent]
    @PageId       INT,
    @LanguageCode VARCHAR (5)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage pages.', 1;
    IF @LanguageCode = 'en'
        THROW 50026, N'The English version can''t be removed.', 1;
    DELETE [site].[PageContent] WHERE [PageId] = @PageId AND [LanguageCode] = @LanguageCode;
END;
GO

CREATE PROCEDURE [site].[usp_DeletePage]
    @PageId INT
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage pages.', 1;
    IF NOT EXISTS (SELECT 1 FROM [site].[Page] WHERE [PageId] = @PageId)
        THROW 50021, N'That page wasn''t found.', 1;
    DELETE [site].[Page] WHERE [PageId] = @PageId;   -- its content rows go with it (ON DELETE CASCADE)
END;
GO
