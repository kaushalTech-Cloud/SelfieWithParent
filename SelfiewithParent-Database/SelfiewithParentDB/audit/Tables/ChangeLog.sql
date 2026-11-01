-- Append-only record of every change to protected tables.
-- Stores WHICH columns changed and WHO changed them — never the personal values themselves.
-- Written only by table triggers; rows can't be updated or deleted (see trigger below).
CREATE TABLE [audit].[ChangeLog]
(
    [ChangeLogId]     BIGINT          IDENTITY (1, 1) NOT NULL,
    [TableName]       SYSNAME         NOT NULL,
    [RowKey]          BIGINT          NOT NULL,                 -- primary key of the changed row
    [Action]          CHAR (1)        NOT NULL,                 -- I = insert, U = update, D = delete
    [ChangedColumns]  NVARCHAR (1000) NULL,                     -- comma-separated column names (updates)
    [ActorUserId]     BIGINT          NULL,                     -- signed-in visitor, from session context
    [AccessScope]     NVARCHAR (20)   NULL,                     -- e.g. 'System' for sign-in / background jobs
    [DbPrincipal]     NVARCHAR (128)  NOT NULL CONSTRAINT [DF_ChangeLog_DbPrincipal] DEFAULT (ORIGINAL_LOGIN()),
    [AppName]         NVARCHAR (128)  NULL CONSTRAINT [DF_ChangeLog_AppName] DEFAULT (APP_NAME()),
    [ChangedAtUtc]    DATETIME2 (3)   NOT NULL CONSTRAINT [DF_ChangeLog_ChangedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_ChangeLog] PRIMARY KEY CLUSTERED ([ChangeLogId] ASC),
    CONSTRAINT [CK_ChangeLog_Action] CHECK ([Action] IN ('I', 'U', 'D'))
);
GO

CREATE NONCLUSTERED INDEX [IX_ChangeLog_Table_Row]
    ON [audit].[ChangeLog] ([TableName] ASC, [RowKey] ASC, [ChangedAtUtc] ASC);
GO

-- Tamper protection: log entries can never be changed or removed
CREATE TRIGGER [audit].[trg_ChangeLog_PreventChanges]
    ON [audit].[ChangeLog]
    INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50001, N'audit.ChangeLog is append-only: entries cannot be updated or deleted.', 1;
END;
GO
