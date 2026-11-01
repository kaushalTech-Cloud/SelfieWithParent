-- A message sent with the website's contact form ("Get in touch"). Anyone can send one (signed in or not); super admins
-- and admins read them in the admin site (Messages), with a notification while any are new.
-- Written only through site.usp_SendContactMessage; status changed only through site.usp_SetContactMessageStatus.
-- PII columns: Name, Email.
CREATE TABLE [site].[ContactMessage]
(
    [ContactMessageId] BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]         UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_ContactMessage_PublicId] DEFAULT (NEWID()),
    [Name]             NVARCHAR (60)       MASKED WITH (FUNCTION = 'partial(1,"xxxxx",0)') NOT NULL,
    [Email]            NVARCHAR (254)      MASKED WITH (FUNCTION = 'email()') NOT NULL,
    [Subject]          NVARCHAR (100)      NULL,
    [Message]          NVARCHAR (1000)     NOT NULL,
    [UserId]           BIGINT              NULL,          -- the sender's account, when they were signed in
    [Status]           VARCHAR (10)        NOT NULL CONSTRAINT [DF_ContactMessage_Status] DEFAULT ('New'),   -- New | Read | Archived
    [CreatedAtUtc]     DATETIME2 (0)       NOT NULL CONSTRAINT [DF_ContactMessage_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [ReadAtUtc]        DATETIME2 (0)       NULL,
    [ReadByUserId]     BIGINT              NULL,

    CONSTRAINT [PK_ContactMessage] PRIMARY KEY CLUSTERED ([ContactMessageId] ASC),
    CONSTRAINT [UQ_ContactMessage_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_ContactMessage_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]) ON DELETE SET NULL,
    CONSTRAINT [FK_ContactMessage_ReadBy] FOREIGN KEY ([ReadByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_ContactMessage_Status] CHECK ([Status] IN ('New', 'Read', 'Archived')),
    CONSTRAINT [CK_ContactMessage_Email] CHECK ([Email] LIKE '%_@_%._%' AND [Email] NOT LIKE '% %'),
    -- Name and subject are shown as text; refusing markup is a second line of defence (the message may contain any text)
    CONSTRAINT [CK_ContactMessage_Text] CHECK (LEN([Name]) >= 1 AND LEN([Message]) >= 1 AND CONCAT([Name], [Subject]) NOT LIKE '%[<>]%')
);
GO

CREATE NONCLUSTERED INDEX [IX_ContactMessage_Status]
    ON [site].[ContactMessage] ([Status], [CreatedAtUtc]);
GO

-- Records every status change (not the message itself) in audit.ChangeLog.
CREATE TRIGGER [site].[trg_ContactMessage_Audit]
    ON [site].[ContactMessage]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'site.ContactMessage', COALESCE(i.[ContactMessageId], d.[ContactMessageId]),
           CASE WHEN d.[ContactMessageId] IS NULL THEN 'I' WHEN i.[ContactMessageId] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'Status=', i.[Status]),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[ContactMessageId] = i.[ContactMessageId];
END;
GO
