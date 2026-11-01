-- Why an account was made inactive / active again, by whom, and whether the person was emailed.
-- Written only by auth.usp_SetVisitorActive (the website can read it but never write it directly), and append-only:
-- rows can't be changed or removed (see trigger below). The reason is shown to the visitor in the email.
CREATE TABLE [auth].[AccountStatusChange]
(
    [AccountStatusChangeId] BIGINT          IDENTITY (1, 1) NOT NULL,
    [UserId]                BIGINT          NOT NULL,
    [NewStatus]             VARCHAR (13)    NOT NULL,          -- Active | Suspended
    [Reason]                NVARCHAR (500)  NOT NULL,
    [ChangedByUserId]       BIGINT          NOT NULL,          -- the super admin
    [ChangedAtUtc]          DATETIME2 (0)   NOT NULL CONSTRAINT [DF_AccountStatusChange_ChangedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_AccountStatusChange] PRIMARY KEY CLUSTERED ([AccountStatusChangeId] ASC),
    CONSTRAINT [FK_AccountStatusChange_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [FK_AccountStatusChange_ChangedBy] FOREIGN KEY ([ChangedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_AccountStatusChange_NewStatus] CHECK ([NewStatus] IN ('Active', 'Suspended')),
    CONSTRAINT [CK_AccountStatusChange_Reason] CHECK (LEN(LTRIM(RTRIM([Reason]))) >= 10)
);
GO

CREATE NONCLUSTERED INDEX [IX_AccountStatusChange_User]
    ON [auth].[AccountStatusChange] ([UserId] ASC, [ChangedAtUtc] DESC);
GO

-- Tamper protection: the history can never be changed or removed
CREATE TRIGGER [auth].[trg_AccountStatusChange_PreventChanges]
    ON [auth].[AccountStatusChange]
    INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50002, N'auth.AccountStatusChange is append-only: entries cannot be updated or deleted.', 1;
END;
GO
