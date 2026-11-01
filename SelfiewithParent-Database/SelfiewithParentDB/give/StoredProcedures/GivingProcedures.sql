-- Giving: the only ways the website can change the Support page, campaigns and donations. Errors 50060-50069 are
-- shown to the user. Staff procedures check the caller's role in the database (session-context UserId).

-- The Support page's words, per language. Active SuperAdmin or Admin. @ContentJson NULL: back to the built-in text.
CREATE PROCEDURE [give].[usp_SaveSupportContent]
    @LanguageCode VARCHAR (5),
    @ContentJson  NVARCHAR (MAX)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50060, N'Only a super admin or admin can edit the Support page.', 1;
    IF @LanguageCode NOT IN ('en', 'hi', 'bn', 'ar', 'es', 'fr')
        THROW 50063, N'Choose a language.', 1;
    IF @ContentJson IS NULL
    BEGIN
        DELETE [give].[SupportContent] WHERE [LanguageCode] = @LanguageCode;
        RETURN;
    END;
    IF ISJSON(@ContentJson) <> 1
        THROW 50063, N'The Support page content isn''t valid.', 1;
    UPDATE [give].[SupportContent] SET [ContentJson] = @ContentJson, [UpdatedByUserId] = @actor, [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [LanguageCode] = @LanguageCode;
    IF @@ROWCOUNT = 0
        INSERT [give].[SupportContent] ([LanguageCode], [ContentJson], [UpdatedByUserId]) VALUES (@LanguageCode, @ContentJson, @actor);
END;
GO

-- Adds (@PublicId NULL) or changes a campaign. Active SuperAdmin or Admin. Returns its public id.
CREATE PROCEDURE [give].[usp_SaveCampaign]
    @PublicId       UNIQUEIDENTIFIER,
    @Slug           VARCHAR (60),
    @Title          NVARCHAR (120),
    @Summary        NVARCHAR (300),
    @Story          NVARCHAR (4000),
    @Image          VARCHAR (80),
    @GoalAmount     DECIMAL (12, 2),
    @OfflineRaised  DECIMAL (12, 2),
    @StartsAtUtc    DATETIME2 (0),
    @EndsAtUtc      DATETIME2 (0),
    @Status         VARCHAR (10),
    @IsFeatured     BIT,
    @SortOrder      INT
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50060, N'Only a super admin or admin can manage campaigns.', 1;
    SET @Slug = LOWER(LTRIM(RTRIM(@Slug)));
    IF EXISTS (SELECT 1 FROM [give].[Campaign] WHERE [Slug] = @Slug AND (@PublicId IS NULL OR [PublicId] <> @PublicId))
        THROW 50063, N'Another campaign already uses that web address.', 1;
    IF @PublicId IS NULL
    BEGIN
        DECLARE @new TABLE ([PublicId] UNIQUEIDENTIFIER);
        INSERT [give].[Campaign] ([Slug], [Title], [Summary], [Story], [Image], [GoalAmount], [OfflineRaised], [StartsAtUtc], [EndsAtUtc], [Status], [IsFeatured], [SortOrder])
        OUTPUT inserted.[PublicId] INTO @new
        VALUES (@Slug, @Title, @Summary, @Story, @Image, @GoalAmount, ISNULL(@OfflineRaised, 0), @StartsAtUtc, @EndsAtUtc, @Status, @IsFeatured, ISNULL(@SortOrder, 0));
        SELECT [PublicId] FROM @new;
        RETURN;
    END;
    UPDATE [give].[Campaign]
       SET [Slug] = @Slug, [Title] = @Title, [Summary] = @Summary, [Story] = @Story, [Image] = @Image, [GoalAmount] = @GoalAmount,
           [OfflineRaised] = ISNULL(@OfflineRaised, 0), [StartsAtUtc] = @StartsAtUtc, [EndsAtUtc] = @EndsAtUtc, [Status] = @Status,
           [IsFeatured] = @IsFeatured, [SortOrder] = ISNULL(@SortOrder, 0), [UpdatedAtUtc] = SYSUTCDATETIME()
     WHERE [PublicId] = @PublicId;
    IF @@ROWCOUNT = 0
        THROW 50061, N'That campaign wasn''t found.', 1;
    SELECT @PublicId AS [PublicId];
END;
GO

-- Deletes a campaign that has no donations yet (one with donations can be closed instead). SuperAdmin or Admin.
CREATE PROCEDURE [give].[usp_DeleteCampaign]
    @PublicId UNIQUEIDENTIFIER
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50060, N'Only a super admin or admin can manage campaigns.', 1;
    DECLARE @id INT = (SELECT [CampaignId] FROM [give].[Campaign] WHERE [PublicId] = @PublicId);
    IF @id IS NULL
        THROW 50061, N'That campaign wasn''t found.', 1;
    IF EXISTS (SELECT 1 FROM [give].[Donation] WHERE [CampaignId] = @id)
        THROW 50063, N'This campaign has donations, so it can''t be deleted. Close it instead.', 1;
    DELETE [give].[Campaign] WHERE [CampaignId] = @id;
END;
GO

-- A visitor starts an online donation (the API has created the payment gateway's order first). Anyone may give, signed
-- in or not; the signed-in visitor's id is taken from the read-only session context. Status starts as 'Created': it only
-- becomes 'Paid' through give.usp_SetDonationPaid, after the API has verified the gateway's signature.
CREATE PROCEDURE [give].[usp_CreateDonation]
    @CampaignPublicId UNIQUEIDENTIFIER,
    @Amount           DECIMAL (12, 2),
    @DonorName        NVARCHAR (100),
    @Email            NVARCHAR (254),
    @Phone            VARCHAR (20),
    @Pan              CHAR (10),
    @InHonourOf       NVARCHAR (100),
    @Message          NVARCHAR (300),
    @ShowOnWall       BIT,
    @WallName         NVARCHAR (60),
    @GatewayOrderId   VARCHAR (60)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT), @campaign INT = NULL;
    IF @CampaignPublicId IS NOT NULL
    BEGIN
        SET @campaign = (SELECT [CampaignId] FROM [give].[Campaign] WHERE [PublicId] = @CampaignPublicId AND [Status] = 'Active'
                           AND ([EndsAtUtc] IS NULL OR [EndsAtUtc] > SYSUTCDATETIME()));
        IF @campaign IS NULL
            THROW 50061, N'That campaign isn''t taking donations now.', 1;
    END;
    -- Stops a script from filling the table with unpaid donations
    IF (SELECT COUNT(*) FROM [give].[Donation] WHERE [Email] = @Email AND [CreatedAtUtc] > DATEADD(HOUR, -1, SYSUTCDATETIME()) AND [Status] = 'Created') >= 10
        THROW 50062, N'Too many tries. Please wait a little and try again.', 1;
    DECLARE @new TABLE ([PublicId] UNIQUEIDENTIFIER);
    INSERT [give].[Donation] ([CampaignId], [UserId], [Amount], [DonorName], [Email], [Phone], [Pan], [InHonourOf], [Message], [ShowOnWall], [WallName],
        [Method], [GatewayOrderId], [Status])
    OUTPUT inserted.[PublicId] INTO @new
    VALUES (@campaign, @me, @Amount, LTRIM(RTRIM(@DonorName)), LOWER(LTRIM(RTRIM(@Email))), NULLIF(LTRIM(RTRIM(@Phone)), ''), NULLIF(UPPER(LTRIM(RTRIM(@Pan))), ''),
        NULLIF(LTRIM(RTRIM(@InHonourOf)), N''), NULLIF(LTRIM(RTRIM(@Message)), N''), ISNULL(@ShowOnWall, 0), NULLIF(LTRIM(RTRIM(@WallName)), N''),
        'razorpay', @GatewayOrderId, 'Created');
    SELECT [PublicId] FROM @new;
END;
GO

-- The next receipt number: SWP-2026-000001 (by financial year would be the accountant's choice; calendar year here).
CREATE FUNCTION [give].[fn_NextReceiptNo] ()
RETURNS VARCHAR (24)
AS
BEGIN
    DECLARE @prefix VARCHAR (10) = CONCAT('SWP-', YEAR(SYSUTCDATETIME()), '-');
    DECLARE @last INT = (SELECT MAX(TRY_CAST(RIGHT([ReceiptNo], 6) AS INT)) FROM [give].[Donation] WHERE [ReceiptNo] LIKE @prefix + '%');
    RETURN CONCAT(@prefix, RIGHT(CONCAT('000000', ISNULL(@last, 0) + 1), 6));
END;
GO

-- The payment gateway confirmed a payment (the API verified its signature first). Only from the API's system access.
-- Idempotent: the checkout and the webhook may both report the same payment. The amount must match what was ordered.
-- Returns the donation and whether this call just marked it paid (so the receipt email is sent once).
CREATE PROCEDURE [give].[usp_SetDonationPaid]
    @GatewayOrderId   VARCHAR (60),
    @GatewayPaymentId VARCHAR (60),
    @AmountPaid       DECIMAL (12, 2)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF ISNULL(CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20)), N'') <> N'System'
        THROW 50060, N'Only the payment check can mark a donation paid.', 1;
    DECLARE @id BIGINT, @amount DECIMAL (12, 2), @status VARCHAR (10), @justPaid BIT = 0;
    BEGIN TRANSACTION;
    SELECT @id = [DonationId], @amount = [Amount], @status = [Status] FROM [give].[Donation] WITH (UPDLOCK, HOLDLOCK) WHERE [GatewayOrderId] = @GatewayOrderId;
    IF @id IS NULL BEGIN ROLLBACK; THROW 50061, N'That donation wasn''t found.', 1; END;
    IF @AmountPaid <> @amount BEGIN ROLLBACK; THROW 50063, N'The amount paid doesn''t match the donation.', 1; END;
    IF @status IN ('Created', 'Failed')
    BEGIN
        UPDATE [give].[Donation] SET [Status] = 'Paid', [GatewayPaymentId] = @GatewayPaymentId, [PaidAtUtc] = SYSUTCDATETIME(),
               [ReceiptNo] = [give].[fn_NextReceiptNo](), [StatusNote] = NULL
         WHERE [DonationId] = @id;
        SET @justPaid = 1;
    END;
    COMMIT;
    SELECT [PublicId], [ReceiptNo], [Amount], [DonorName], [Email], [Pan], [InHonourOf], [PaidAtUtc], @justPaid AS [JustPaid],
           (SELECT c.[Title] FROM [give].[Campaign] AS c WHERE c.[CampaignId] = d.[CampaignId]) AS [CampaignTitle]
    FROM [give].[Donation] AS d WHERE [DonationId] = @id;
END;
GO

-- The gateway reported a failed payment (or the visitor closed the checkout). Only from the API's system access;
-- never changes a paid donation.
CREATE PROCEDURE [give].[usp_SetDonationFailed]
    @GatewayOrderId VARCHAR (60),
    @Reason         NVARCHAR (300)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20)), N'') <> N'System'
        THROW 50060, N'Only the payment check can change a donation.', 1;
    UPDATE [give].[Donation] SET [Status] = 'Failed', [StatusNote] = LEFT(REPLACE(REPLACE(@Reason, '<', ''), '>', ''), 300)
     WHERE [GatewayOrderId] = @GatewayOrderId AND [Status] = 'Created';
END;
GO

-- The receipt email went out.
CREATE PROCEDURE [give].[usp_MarkReceiptSent]
    @PublicId UNIQUEIDENTIFIER
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    IF ISNULL(CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20)), N'') <> N'System'
        THROW 50060, N'Only the website can record that.', 1;
    UPDATE [give].[Donation] SET [ReceiptSentAtUtc] = SYSUTCDATETIME() WHERE [PublicId] = @PublicId AND [Status] = 'Paid';
END;
GO

-- Staff record a donation received offline (cash, bank transfer, cheque, UPI to the account): paid straight away, with a
-- receipt number. SuperAdmin or Admin. Returns the public id and receipt number.
CREATE PROCEDURE [give].[usp_RecordOfflineDonation]
    @CampaignPublicId UNIQUEIDENTIFIER,
    @Amount           DECIMAL (12, 2),
    @Method           VARCHAR (10),
    @Reference        NVARCHAR (100),
    @DonorName        NVARCHAR (100),
    @Email            NVARCHAR (254),
    @Phone            VARCHAR (20),
    @Pan              CHAR (10),
    @InHonourOf       NVARCHAR (100),
    @ShowOnWall       BIT,
    @WallName         NVARCHAR (60),
    @PaidAtUtc        DATETIME2 (0)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50060, N'Only a super admin or admin can record donations.', 1;
    IF @Method NOT IN ('cash', 'bank', 'cheque', 'upi')
        THROW 50063, N'Choose how it was paid.', 1;
    DECLARE @campaign INT = NULL;
    IF @CampaignPublicId IS NOT NULL
    BEGIN
        SET @campaign = (SELECT [CampaignId] FROM [give].[Campaign] WHERE [PublicId] = @CampaignPublicId);
        IF @campaign IS NULL THROW 50061, N'That campaign wasn''t found.', 1;
    END;
    DECLARE @new TABLE ([PublicId] UNIQUEIDENTIFIER, [ReceiptNo] VARCHAR (24));
    INSERT [give].[Donation] ([CampaignId], [Amount], [DonorName], [Email], [Phone], [Pan], [InHonourOf], [ShowOnWall], [WallName],
        [Method], [Reference], [Status], [ReceiptNo], [PaidAtUtc], [RecordedByUserId])
    OUTPUT inserted.[PublicId], inserted.[ReceiptNo] INTO @new
    VALUES (@campaign, @Amount, LTRIM(RTRIM(@DonorName)), LOWER(LTRIM(RTRIM(@Email))), NULLIF(LTRIM(RTRIM(@Phone)), ''), NULLIF(UPPER(LTRIM(RTRIM(@Pan))), ''),
        NULLIF(LTRIM(RTRIM(@InHonourOf)), N''), ISNULL(@ShowOnWall, 0), NULLIF(LTRIM(RTRIM(@WallName)), N''),
        @Method, NULLIF(LTRIM(RTRIM(@Reference)), N''), 'Paid', [give].[fn_NextReceiptNo](), ISNULL(@PaidAtUtc, SYSUTCDATETIME()), @actor);
    SELECT [PublicId], [ReceiptNo] FROM @new;
END;
GO

-- Staff mark a paid donation refunded (the money itself is refunded in the payment gateway's dashboard / by bank).
-- SuperAdmin or Admin; a note is required.
CREATE PROCEDURE [give].[usp_RefundDonation]
    @PublicId UNIQUEIDENTIFIER,
    @Note     NVARCHAR (300)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF NOT EXISTS (SELECT 1 FROM [auth].[fn_ActiveRoles](@actor) WHERE [RoleCode] IN ('SuperAdmin', 'Admin'))
        THROW 50060, N'Only a super admin or admin can mark refunds.', 1;
    IF LEN(LTRIM(RTRIM(ISNULL(@Note, N'')))) < 5
        THROW 50063, N'Say why it was refunded (at least 5 characters).', 1;
    UPDATE [give].[Donation] SET [Status] = 'Refunded', [StatusNote] = LTRIM(RTRIM(@Note)), [RecordedByUserId] = @actor
     WHERE [PublicId] = @PublicId AND [Status] = 'Paid';
    IF @@ROWCOUNT = 0
        THROW 50061, N'Only a paid donation can be marked refunded.', 1;
END;
GO
