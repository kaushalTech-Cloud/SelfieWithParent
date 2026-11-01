-- The Support page's words (hero, impact amounts, ways to help, trust details, where the money goes, reports, partners,
-- FAQs), edited in the admin site. One JSON document per language ('en' is the base); anything not set shows the
-- website's built-in default, so the page is never blank. Written only through give.usp_SaveSupportContent.
CREATE TABLE [give].[SupportContent]
(
    [LanguageCode]    VARCHAR (5)     NOT NULL,
    [ContentJson]     NVARCHAR (MAX)  NOT NULL,
    [UpdatedByUserId] BIGINT          NULL,
    [UpdatedAtUtc]    DATETIME2 (0)   NOT NULL CONSTRAINT [DF_SupportContent_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_SupportContent] PRIMARY KEY CLUSTERED ([LanguageCode] ASC),
    CONSTRAINT [FK_SupportContent_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_SupportContent_Language] CHECK ([LanguageCode] IN ('en', 'hi', 'bn', 'ar', 'es', 'fr')),
    CONSTRAINT [CK_SupportContent_Json] CHECK (ISJSON([ContentJson]) = 1 AND LEN([ContentJson]) <= 100000)
);
GO

-- A fundraising campaign ("Diwali with our elders", "Free health camp in Pune"): a goal, a story, a picture, dates.
-- Raised = paid donations to it + money staff record as received offline (OfflineRaised).
CREATE TABLE [give].[Campaign]
(
    [CampaignId]     INT                IDENTITY (1, 1) NOT NULL,
    [PublicId]       UNIQUEIDENTIFIER   NOT NULL CONSTRAINT [DF_Campaign_PublicId] DEFAULT (NEWID()),
    [Slug]           VARCHAR (60)       NOT NULL,
    [Title]          NVARCHAR (120)     NOT NULL,
    [Summary]        NVARCHAR (300)     NULL,
    [Story]          NVARCHAR (4000)    NULL,
    [Image]          VARCHAR (80)       NULL,     -- img/… (built in) or media/{guid} (uploaded in the admin site)
    [GoalAmount]     DECIMAL (12, 2)    NOT NULL,
    [OfflineRaised]  DECIMAL (12, 2)    NOT NULL CONSTRAINT [DF_Campaign_OfflineRaised] DEFAULT (0),
    [Currency]       CHAR (3)           NOT NULL CONSTRAINT [DF_Campaign_Currency] DEFAULT ('INR'),
    [StartsAtUtc]    DATETIME2 (0)      NULL,
    [EndsAtUtc]      DATETIME2 (0)      NULL,
    [Status]         VARCHAR (10)       NOT NULL CONSTRAINT [DF_Campaign_Status] DEFAULT ('Draft'),   -- Draft | Active | Paused | Closed
    [IsFeatured]     BIT                NOT NULL CONSTRAINT [DF_Campaign_IsFeatured] DEFAULT (0),
    [SortOrder]      INT                NOT NULL CONSTRAINT [DF_Campaign_SortOrder] DEFAULT (0),
    [CreatedAtUtc]   DATETIME2 (0)      NOT NULL CONSTRAINT [DF_Campaign_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAtUtc]   DATETIME2 (0)      NOT NULL CONSTRAINT [DF_Campaign_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Campaign] PRIMARY KEY CLUSTERED ([CampaignId] ASC),
    CONSTRAINT [UQ_Campaign_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [UQ_Campaign_Slug] UNIQUE NONCLUSTERED ([Slug] ASC),
    CONSTRAINT [CK_Campaign_Slug] CHECK ([Slug] NOT LIKE '%[^a-z0-9-]%' AND LEN([Slug]) >= 3),
    CONSTRAINT [CK_Campaign_Status] CHECK ([Status] IN ('Draft', 'Active', 'Paused', 'Closed')),
    CONSTRAINT [CK_Campaign_Amounts] CHECK ([GoalAmount] > 0 AND [GoalAmount] <= 1000000000 AND [OfflineRaised] >= 0),
    CONSTRAINT [CK_Campaign_Currency] CHECK ([Currency] = 'INR'),
    CONSTRAINT [CK_Campaign_Dates] CHECK ([EndsAtUtc] IS NULL OR [StartsAtUtc] IS NULL OR [EndsAtUtc] > [StartsAtUtc]),
    CONSTRAINT [CK_Campaign_Image] CHECK ([Image] IS NULL OR [Image] LIKE 'img/%' OR [Image] LIKE 'media/%'),
    CONSTRAINT [CK_Campaign_NoMarkup] CHECK (CONCAT([Title], [Summary], [Story]) NOT LIKE '%[<>]%')
);
GO

-- A donation. Online: created when the visitor starts paying (Status 'Created', with the payment gateway's order id),
-- marked 'Paid' only after the API has verified the gateway's signature (checkout or webhook). Offline (cash, bank
-- transfer, cheque, UPI to the account): recorded by staff, 'Paid' straight away. The website never sees card or bank
-- details — the gateway's checkout handles them. PAN only for an 80G tax receipt.
CREATE TABLE [give].[Donation]
(
    [DonationId]        BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]          UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_Donation_PublicId] DEFAULT (NEWID()),
    [CampaignId]        INT                 NULL,           -- NULL: wherever it's needed most
    [UserId]            BIGINT              NULL,           -- the signed-in visitor, if any
    [Amount]            DECIMAL (12, 2)     NOT NULL,
    [Currency]          CHAR (3)            NOT NULL CONSTRAINT [DF_Donation_Currency] DEFAULT ('INR'),
    [DonorName]         NVARCHAR (100)      NOT NULL,
    [Email]             NVARCHAR (254)      NOT NULL,
    [Phone]             VARCHAR (20)        NULL,
    [Pan]               CHAR (10)           NULL,
    [InHonourOf]        NVARCHAR (100)      NULL,           -- "In honour of Maa" / "In loving memory of Papa"
    [Message]           NVARCHAR (300)      NULL,
    [ShowOnWall]        BIT                 NOT NULL CONSTRAINT [DF_Donation_ShowOnWall] DEFAULT (0),
    [WallName]          NVARCHAR (60)       NULL,           -- the name on the donor wall (NULL: "Anonymous")
    [Method]            VARCHAR (10)        NOT NULL,       -- razorpay | cash | bank | cheque | upi
    [GatewayOrderId]    VARCHAR (60)        NULL,
    [GatewayPaymentId]  VARCHAR (60)        NULL,
    [Reference]         NVARCHAR (100)      NULL,           -- offline: cheque number / bank reference
    [Status]            VARCHAR (10)        NOT NULL CONSTRAINT [DF_Donation_Status] DEFAULT ('Created'),   -- Created | Paid | Failed | Refunded
    [ReceiptNo]         VARCHAR (24)        NULL,
    [StatusNote]        NVARCHAR (300)      NULL,
    [RecordedByUserId]  BIGINT              NULL,           -- staff who recorded an offline donation / a refund
    [PaidAtUtc]         DATETIME2 (0)       NULL,
    [ReceiptSentAtUtc]  DATETIME2 (0)       NULL,
    [CreatedAtUtc]      DATETIME2 (0)       NOT NULL CONSTRAINT [DF_Donation_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_Donation] PRIMARY KEY CLUSTERED ([DonationId] ASC),
    CONSTRAINT [UQ_Donation_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_Donation_Campaign] FOREIGN KEY ([CampaignId]) REFERENCES [give].[Campaign] ([CampaignId]),
    CONSTRAINT [FK_Donation_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [FK_Donation_RecordedBy] FOREIGN KEY ([RecordedByUserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_Donation_Amount] CHECK ([Amount] >= 1 AND [Amount] <= 10000000),
    CONSTRAINT [CK_Donation_Currency] CHECK ([Currency] = 'INR'),
    CONSTRAINT [CK_Donation_Method] CHECK ([Method] IN ('razorpay', 'cash', 'bank', 'cheque', 'upi')),
    CONSTRAINT [CK_Donation_Status] CHECK ([Status] IN ('Created', 'Paid', 'Failed', 'Refunded')),
    CONSTRAINT [CK_Donation_Online] CHECK ([Method] <> 'razorpay' OR [GatewayOrderId] IS NOT NULL),
    CONSTRAINT [CK_Donation_Paid] CHECK ([Status] NOT IN ('Paid', 'Refunded') OR ([PaidAtUtc] IS NOT NULL AND [ReceiptNo] IS NOT NULL)),
    CONSTRAINT [CK_Donation_Pan] CHECK ([Pan] IS NULL OR [Pan] COLLATE Latin1_General_BIN2 LIKE '[A-Z][A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9][A-Z]'),
    CONSTRAINT [CK_Donation_Email] CHECK ([Email] LIKE '%_@_%._%'),
    CONSTRAINT [CK_Donation_NoMarkup] CHECK (CONCAT([DonorName], [InHonourOf], [Message], [WallName], [Reference], [StatusNote]) NOT LIKE '%[<>]%')
);
GO

CREATE UNIQUE NONCLUSTERED INDEX [UX_Donation_GatewayOrder] ON [give].[Donation] ([GatewayOrderId]) WHERE [GatewayOrderId] IS NOT NULL;
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Donation_Receipt] ON [give].[Donation] ([ReceiptNo]) WHERE [ReceiptNo] IS NOT NULL;
GO
CREATE NONCLUSTERED INDEX [IX_Donation_Status] ON [give].[Donation] ([Status], [PaidAtUtc] DESC) INCLUDE ([CampaignId], [Amount]);
GO

-- Records every change to campaigns and donations in audit.ChangeLog (who did what, never donors' details).
CREATE TRIGGER [give].[trg_Donation_Audit]
    ON [give].[Donation]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'give.Donation', COALESCE(i.[DonationId], d.[DonationId]),
           CASE WHEN d.[DonationId] IS NULL THEN 'I' WHEN i.[DonationId] IS NULL THEN 'D' ELSE 'U' END,
           CASE WHEN d.[DonationId] IS NULL THEN CONCAT(N'Method=', i.[Method], N',Amount=', i.[Amount], N',Status=', i.[Status])
                WHEN i.[DonationId] IS NOT NULL AND i.[Status] <> d.[Status] THEN CONCAT(N'Status=', i.[Status], N',was=', d.[Status]) END,
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[DonationId] = i.[DonationId];
END;
GO

CREATE TRIGGER [give].[trg_Campaign_Audit]
    ON [give].[Campaign]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'give.Campaign', COALESCE(i.[CampaignId], d.[CampaignId]),
           CASE WHEN d.[CampaignId] IS NULL THEN 'I' WHEN i.[CampaignId] IS NULL THEN 'D' ELSE 'U' END,
           CONCAT(N'Status=', COALESCE(i.[Status], d.[Status])),
           TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT), CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20))
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[CampaignId] = i.[CampaignId];
END;
GO
