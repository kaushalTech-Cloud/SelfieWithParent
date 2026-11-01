-- Which account holds which staff role.
-- The website connection (swp_app) can read a visitor's own rows but can never insert, change or delete them,
-- so a compromised website cannot promote anyone to staff. Changes are recorded in audit.ChangeLog.
CREATE TABLE [auth].[UserRole]
(
    [UserRoleId]        BIGINT          IDENTITY (1, 1) NOT NULL,
    [UserId]            BIGINT          NOT NULL,
    [RoleId]            SMALLINT        NOT NULL,
    [AssignedAtUtc]     DATETIME2 (0)   NOT NULL CONSTRAINT [DF_UserRole_AssignedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [AssignedByUserId]  BIGINT          NULL,           -- staff member who granted it (NULL = set up by the database owner)
    [ExpiresAtUtc]      DATETIME2 (0)   NULL,           -- optional end date for temporary access

    CONSTRAINT [PK_UserRole] PRIMARY KEY CLUSTERED ([UserRoleId] ASC),
    CONSTRAINT [UQ_UserRole_User_Role] UNIQUE NONCLUSTERED ([UserId] ASC, [RoleId] ASC),
    CONSTRAINT [FK_UserRole_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [FK_UserRole_Role] FOREIGN KEY ([RoleId]) REFERENCES [auth].[Role] ([RoleId]),
    CONSTRAINT [FK_UserRole_AssignedBy] FOREIGN KEY ([AssignedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_UserRole_Expiry] CHECK ([ExpiresAtUtc] IS NULL OR [ExpiresAtUtc] > [AssignedAtUtc])
);
GO

CREATE NONCLUSTERED INDEX [IX_UserRole_RoleId]
    ON [auth].[UserRole] ([RoleId] ASC);
GO
