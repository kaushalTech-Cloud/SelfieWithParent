-- Roles: staff roles for the admin site (1-5) and Visitor (6), which every account gets automatically.
-- Rows are fixed reference data, loaded by Scripts\Script.PostDeployment.sql.
CREATE TABLE [auth].[Role]
(
    [RoleId]        SMALLINT        NOT NULL,
    [RoleCode]      VARCHAR (30)    NOT NULL,          -- stable code used by the app, e.g. 'Moderator'
    [Name]          NVARCHAR (60)   NOT NULL,
    [Description]   NVARCHAR (200)  NULL,
    [IsActive]      BIT             NOT NULL CONSTRAINT [DF_Role_IsActive] DEFAULT (1),
    [CreatedAtUtc]  DATETIME2 (0)   NOT NULL CONSTRAINT [DF_Role_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Role] PRIMARY KEY CLUSTERED ([RoleId] ASC),
    CONSTRAINT [UQ_Role_RoleCode] UNIQUE NONCLUSTERED ([RoleCode] ASC),
    CONSTRAINT [CK_Role_RoleCode] CHECK ([RoleCode] COLLATE Latin1_General_BIN2 NOT LIKE '%[^A-Za-z]%')
);
GO
