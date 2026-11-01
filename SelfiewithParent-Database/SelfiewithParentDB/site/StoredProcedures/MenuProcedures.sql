-- Public menus (header 'main', footer 'footer'): the only way the website can change them.
-- Staff menus (the admin sidebar) can't be changed here: they stay with the database owner.
-- Same rules as the page procedures: active SuperAdmin or Admin only, run as swp_staff_admin, audited by trigger.
-- The table's own checks still apply (safe links only: site paths, https, mailto, tel).

CREATE PROCEDURE [site].[usp_SaveMenuItem]
    @MenuItemId       INT,              -- NULL = add a new item
    @MenuCode         VARCHAR (30),
    @ParentMenuItemId INT,              -- NULL = top level; otherwise a top-level Dropdown in the same menu
    @ItemKey          VARCHAR (50),
    @ItemType         VARCHAR (10),
    @Label            NVARCHAR (100),   -- English
    @Url              NVARCHAR (300),
    @ActionCode       VARCHAR (30),
    @Icon             VARCHAR (40),
    @Visibility       VARCHAR (10),
    @OpensNewTab      BIT,
    @IsActive         BIT,
    @SortOrder        SMALLINT,
    @LabelsJson       NVARCHAR (MAX)    -- {"hi": "...", "bn": "...", ...}; missing / empty = shows English
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage menus.', 1;

    DECLARE @menuId SMALLINT = (SELECT [MenuId] FROM [site].[Menu] WHERE [MenuCode] = @MenuCode AND [Audience] = 'Public');
    IF @menuId IS NULL
        THROW 50025, N'That menu can''t be changed here.', 1;
    IF @MenuItemId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [MenuItemId] = @MenuItemId AND [MenuId] = @menuId)
        THROW 50025, N'That menu item wasn''t found.', 1;
    IF @ParentMenuItemId IS NOT NULL AND (@ParentMenuItemId = @MenuItemId OR NOT EXISTS (
            SELECT 1 FROM [site].[MenuItem]
            WHERE [MenuItemId] = @ParentMenuItemId AND [MenuId] = @menuId AND [ItemType] = 'Dropdown' AND [ParentMenuItemId] IS NULL))
        THROW 50023, N'Items can only go inside a top-level dropdown of the same menu.', 1;
    IF @ParentMenuItemId IS NOT NULL AND @ItemType = 'Dropdown'
        THROW 50023, N'A dropdown can''t go inside another dropdown.', 1;
    IF @MenuItemId IS NOT NULL AND @ItemType <> 'Dropdown'
       AND EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [ParentMenuItemId] = @MenuItemId)
        THROW 50024, N'This dropdown still has items in it. Move or delete them first.', 1;
    IF @MenuItemId IS NOT NULL AND @ParentMenuItemId IS NOT NULL
       AND EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [ParentMenuItemId] = @MenuItemId)
        THROW 50023, N'A dropdown with items can''t go inside another dropdown.', 1;
    IF @LabelsJson IS NOT NULL AND ISJSON(@LabelsJson) <> 1
        THROW 50023, N'The translated labels aren''t valid.', 1;
    IF EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [MenuId] = @menuId AND [ItemKey] = @ItemKey AND [MenuItemId] <> ISNULL(@MenuItemId, -1))
        THROW 50022, N'Another item in this menu already uses that key.', 1;

    DECLARE @id INT = @MenuItemId;
    BEGIN TRY
        BEGIN TRANSACTION;
        IF @id IS NULL
        BEGIN
            DECLARE @new TABLE ([MenuItemId] INT);
            INSERT [site].[MenuItem] ([MenuId], [ItemKey], [ParentMenuItemId], [ItemType], [Label], [Url], [ActionCode], [Icon],
                                      [Visibility], [RequiredRoleId], [OpensNewTab], [SortOrder], [IsActive])
            OUTPUT inserted.[MenuItemId] INTO @new
            VALUES (@menuId, @ItemKey, @ParentMenuItemId, @ItemType, @Label, @Url, @ActionCode, @Icon,
                    @Visibility, NULL, @OpensNewTab, @SortOrder, @IsActive);
            SELECT @id = [MenuItemId] FROM @new;
        END
        ELSE
            UPDATE [site].[MenuItem]
               SET [ItemKey] = @ItemKey, [ParentMenuItemId] = @ParentMenuItemId, [ItemType] = @ItemType, [Label] = @Label,
                   [Url] = @Url, [ActionCode] = @ActionCode, [Icon] = @Icon, [Visibility] = @Visibility,
                   [OpensNewTab] = @OpensNewTab, [SortOrder] = @SortOrder, [IsActive] = @IsActive, [UpdatedAtUtc] = SYSUTCDATETIME()
             WHERE [MenuItemId] = @id;

        DELETE [site].[MenuItemLabel] WHERE [MenuItemId] = @id;
        INSERT [site].[MenuItemLabel] ([MenuItemId], [LanguageCode], [Label])
        SELECT @id, j.[key], LTRIM(RTRIM(j.[value]))
        FROM OPENJSON(ISNULL(@LabelsJson, N'{}')) AS j
        WHERE j.[type] = 1 AND j.[key] IN ('hi', 'bn', 'ar', 'es', 'fr') AND LEN(LTRIM(RTRIM(j.[value]))) > 0;

        UPDATE [site].[Menu] SET [UpdatedAtUtc] = SYSUTCDATETIME() WHERE [MenuId] = @menuId;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- never leave the caller with an open transaction
        THROW;
    END CATCH;
    SELECT @id AS [MenuItemId];
END;
GO

CREATE PROCEDURE [site].[usp_DeleteMenuItem]
    @MenuItemId INT
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage menus.', 1;
    IF NOT EXISTS (SELECT 1 FROM [site].[MenuItem] AS i JOIN [site].[Menu] AS m ON m.[MenuId] = i.[MenuId]
                   WHERE i.[MenuItemId] = @MenuItemId AND m.[Audience] = 'Public')
        THROW 50025, N'That menu item wasn''t found.', 1;
    IF EXISTS (SELECT 1 FROM [site].[MenuItem] WHERE [ParentMenuItemId] = @MenuItemId)
        THROW 50024, N'This dropdown still has items in it. Move or delete them first.', 1;
    DELETE [site].[MenuItem] WHERE [MenuItemId] = @MenuItemId;   -- labels go with it (ON DELETE CASCADE)
END;
GO

-- Moves items: [{"id": 12, "parentId": null, "sortOrder": 10}, ...]. Every id must belong to the menu.
CREATE PROCEDURE [site].[usp_ReorderMenu]
    @MenuCode  VARCHAR (30),
    @ItemsJson NVARCHAR (MAX)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50020, N'Only a super admin or admin can manage menus.', 1;
    DECLARE @menuId SMALLINT = (SELECT [MenuId] FROM [site].[Menu] WHERE [MenuCode] = @MenuCode AND [Audience] = 'Public');
    IF @menuId IS NULL
        THROW 50025, N'That menu can''t be changed here.', 1;
    IF ISJSON(@ItemsJson) <> 1
        THROW 50023, N'The new order isn''t valid.', 1;

    DECLARE @moves TABLE ([MenuItemId] INT PRIMARY KEY, [ParentMenuItemId] INT NULL, [SortOrder] SMALLINT NOT NULL);
    INSERT @moves SELECT j.[id], j.[parentId], j.[sortOrder]
    FROM OPENJSON(@ItemsJson) WITH ([id] INT '$.id', [parentId] INT '$.parentId', [sortOrder] SMALLINT '$.sortOrder') AS j;

    IF EXISTS (SELECT 1 FROM @moves AS m LEFT JOIN [site].[MenuItem] AS i ON i.[MenuItemId] = m.[MenuItemId] AND i.[MenuId] = @menuId
               WHERE i.[MenuItemId] IS NULL OR m.[SortOrder] IS NULL)
        THROW 50025, N'That menu item wasn''t found.', 1;
    -- Check the menu as it would be AFTER the move: every item's parent must be a top-level dropdown of this menu,
    -- and dropdowns themselves stay at the top level (one level of nesting only)
    DECLARE @after TABLE ([MenuItemId] INT PRIMARY KEY, [ParentMenuItemId] INT NULL, [ItemType] VARCHAR (10) NOT NULL);
    INSERT @after
    SELECT i.[MenuItemId], IIF(m.[MenuItemId] IS NULL, i.[ParentMenuItemId], m.[ParentMenuItemId]), i.[ItemType]
    FROM [site].[MenuItem] AS i LEFT JOIN @moves AS m ON m.[MenuItemId] = i.[MenuItemId]
    WHERE i.[MenuId] = @menuId;
    IF EXISTS (SELECT 1 FROM @after AS a LEFT JOIN @after AS p ON p.[MenuItemId] = a.[ParentMenuItemId]
               WHERE a.[ParentMenuItemId] IS NOT NULL
                 AND (p.[MenuItemId] IS NULL OR p.[ItemType] <> 'Dropdown' OR p.[ParentMenuItemId] IS NOT NULL
                      OR a.[ItemType] = 'Dropdown' OR a.[ParentMenuItemId] = a.[MenuItemId]))
        THROW 50023, N'Items can only go inside a top-level dropdown of the same menu.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;
        UPDATE i SET i.[ParentMenuItemId] = m.[ParentMenuItemId], i.[SortOrder] = m.[SortOrder], i.[UpdatedAtUtc] = SYSUTCDATETIME()
        FROM [site].[MenuItem] AS i JOIN @moves AS m ON m.[MenuItemId] = i.[MenuItemId];
        UPDATE [site].[Menu] SET [UpdatedAtUtc] = SYSUTCDATETIME() WHERE [MenuId] = @menuId;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;   -- never leave the caller with an open transaction
        THROW;
    END CATCH;
END;
GO
