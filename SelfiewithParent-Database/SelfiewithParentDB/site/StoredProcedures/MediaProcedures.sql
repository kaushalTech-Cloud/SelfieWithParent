-- Images for content pages. Same rules as the page procedures (active SuperAdmin or Admin, run as swp_staff_admin).
-- The API checks the file's real type and size before calling; the table checks them again.

CREATE PROCEDURE [site].[usp_SaveMedia]
    @FileName    NVARCHAR (150),
    @ContentType VARCHAR (20),
    @Data        VARBINARY (MAX)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can upload images.', 1;

    DECLARE @new TABLE ([PublicId] UNIQUEIDENTIFIER);
    INSERT [site].[Media] ([FileName], [ContentType], [Data], [SizeBytes], [CreatedByUserId])
    OUTPUT inserted.[PublicId] INTO @new
    VALUES (@FileName, @ContentType, @Data, DATALENGTH(@Data), @actor);
    SELECT [PublicId] FROM @new;
END;
GO

CREATE PROCEDURE [site].[usp_DeleteMedia]
    @PublicId UNIQUEIDENTIFIER
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can delete images.', 1;
    IF NOT EXISTS (SELECT 1 FROM [site].[Media] WHERE [PublicId] = @PublicId)
        THROW 50021, N'That image wasn''t found.', 1;
    IF EXISTS (SELECT 1 FROM [site].[Media] WHERE [PublicId] = @PublicId AND [IsSystem] = 1)
        THROW 50027, N'Website pictures can''t be deleted.', 1;
    DELETE [site].[Media] WHERE [PublicId] = @PublicId;
END;
GO
