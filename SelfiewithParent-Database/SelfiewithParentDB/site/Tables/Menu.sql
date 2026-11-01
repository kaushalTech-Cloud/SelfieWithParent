-- A navigation menu: the public header, the public footer, the admin sidebar.
CREATE TABLE [site].[Menu]
(
    [MenuId]        SMALLINT        IDENTITY (1, 1) NOT NULL,
    [MenuCode]      VARCHAR (30)    NOT NULL,      -- used by the API / UI, e.g. 'main', 'footer', 'admin'
    [Name]          NVARCHAR (60)   NOT NULL,
    [Audience]      VARCHAR (10)    NOT NULL CONSTRAINT [DF_Menu_Audience] DEFAULT ('Public'),  -- Public | Staff
    [IsActive]      BIT             NOT NULL CONSTRAINT [DF_Menu_IsActive] DEFAULT (1),
    [CreatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Menu_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Menu_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Menu] PRIMARY KEY CLUSTERED ([MenuId] ASC),
    CONSTRAINT [UQ_Menu_MenuCode] UNIQUE NONCLUSTERED ([MenuCode] ASC),
    CONSTRAINT [CK_Menu_MenuCode] CHECK ([MenuCode] COLLATE Latin1_General_BIN2 NOT LIKE '%[^a-z0-9-]%'),
    CONSTRAINT [CK_Menu_Audience] CHECK ([Audience] IN ('Public', 'Staff'))
);
GO
