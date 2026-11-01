-- One entry in a menu: a link, a dropdown (with child items), a button, a divider or an action (e.g. sign out).
-- Label is the English text; other languages are in site.MenuItemLabel.
CREATE TABLE [site].[MenuItem]
(
    [MenuItemId]        INT             IDENTITY (1, 1) NOT NULL,
    [MenuId]            SMALLINT        NOT NULL,
    [ItemKey]           VARCHAR (50)    NOT NULL,     -- stable id within the menu, e.g. 'selfie.upload-family'
    [ParentMenuItemId]  INT             NULL,         -- set for items inside a dropdown
    [ItemType]          VARCHAR (10)    NOT NULL,     -- Link | Dropdown | Button | Divider | Action
    [Label]             NVARCHAR (100)  NOT NULL,     -- English
    [Url]               NVARCHAR (300)  NULL,         -- site path ('/selfies', '/#about', '/upload?kind=family') or https / mailto / tel
    [ActionCode]        VARCHAR (30)    NULL,         -- for ItemType 'Action', e.g. 'signout'
    [Icon]              VARCHAR (40)    NULL,         -- Bootstrap icon class, e.g. 'bi-upload'
    [Visibility]        VARCHAR (10)    NOT NULL CONSTRAINT [DF_MenuItem_Visibility] DEFAULT ('Always'),  -- Always | SignedIn | SignedOut
    [RequiredRoleId]    SMALLINT        NULL,         -- only users with this role see it (SuperAdmin sees everything)
    [OpensNewTab]       BIT             NOT NULL CONSTRAINT [DF_MenuItem_OpensNewTab] DEFAULT (0),
    [SortOrder]         SMALLINT        NOT NULL,
    [IsActive]          BIT             NOT NULL CONSTRAINT [DF_MenuItem_IsActive] DEFAULT (1),
    [CreatedAtUtc]      DATETIME2 (0)   NOT NULL CONSTRAINT [DF_MenuItem_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAtUtc]      DATETIME2 (0)   NOT NULL CONSTRAINT [DF_MenuItem_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_MenuItem] PRIMARY KEY CLUSTERED ([MenuItemId] ASC),
    CONSTRAINT [UQ_MenuItem_Menu_Key] UNIQUE NONCLUSTERED ([MenuId] ASC, [ItemKey] ASC),
    CONSTRAINT [FK_MenuItem_Menu] FOREIGN KEY ([MenuId]) REFERENCES [site].[Menu] ([MenuId]),
    CONSTRAINT [FK_MenuItem_Parent] FOREIGN KEY ([ParentMenuItemId]) REFERENCES [site].[MenuItem] ([MenuItemId]),
    CONSTRAINT [FK_MenuItem_RequiredRole] FOREIGN KEY ([RequiredRoleId]) REFERENCES [auth].[Role] ([RoleId]),

    CONSTRAINT [CK_MenuItem_ItemKey] CHECK ([ItemKey] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9.-]%'),
    CONSTRAINT [CK_MenuItem_ItemType] CHECK ([ItemType] IN ('Link', 'Dropdown', 'Button', 'Divider', 'Action')),
    CONSTRAINT [CK_MenuItem_Visibility] CHECK ([Visibility] IN ('Always', 'SignedIn', 'SignedOut')),
    CONSTRAINT [CK_MenuItem_NotOwnParent] CHECK ([ParentMenuItemId] IS NULL OR [ParentMenuItemId] <> [MenuItemId]),

    -- Links and buttons need a safe address. Only site paths, https, mailto and tel are allowed:
    -- this blocks 'javascript:' / 'data:' links and protocol-relative '//other-site' links.
    CONSTRAINT [CK_MenuItem_UrlRequired] CHECK (
        ([ItemType] IN ('Link', 'Button') AND [Url] IS NOT NULL)
        OR ([ItemType] IN ('Dropdown', 'Divider', 'Action') AND [Url] IS NULL)),
    CONSTRAINT [CK_MenuItem_UrlSafe] CHECK (
        [Url] IS NULL
        OR (([Url] LIKE '/%' AND [Url] NOT LIKE '//%')
            OR [Url] LIKE 'https://_%'
            OR [Url] LIKE 'mailto:_%'
            OR [Url] LIKE 'tel:_%')),
    CONSTRAINT [CK_MenuItem_UrlNoScript] CHECK ([Url] IS NULL OR ([Url] NOT LIKE '%<%' AND [Url] NOT LIKE '%>%' AND [Url] NOT LIKE '%"%' AND [Url] NOT LIKE '%javascript:%')),

    CONSTRAINT [CK_MenuItem_Action] CHECK (
        ([ItemType] = 'Action' AND [ActionCode] IN ('signout'))
        OR ([ItemType] <> 'Action' AND [ActionCode] IS NULL)),
    CONSTRAINT [CK_MenuItem_Icon] CHECK ([Icon] IS NULL OR [Icon] COLLATE Latin1_General_BIN2 LIKE 'bi-[a-z0-9]%' AND [Icon] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9-]%')
);
GO

CREATE NONCLUSTERED INDEX [IX_MenuItem_Menu_Order]
    ON [site].[MenuItem] ([MenuId] ASC, [ParentMenuItemId] ASC, [SortOrder] ASC)
    INCLUDE ([ItemKey], [ItemType], [Label], [Url], [ActionCode], [Icon], [Visibility], [RequiredRoleId], [OpensNewTab], [IsActive]);
GO
