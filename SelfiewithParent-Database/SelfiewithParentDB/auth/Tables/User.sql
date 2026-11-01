-- Registered visitors: registration details and personal data (PII).
-- PII columns: MobileNumber, Email, FullName, GoogleSubjectId, City.
--   * Masked (Dynamic Data Masking) for anyone without the UNMASK permission.
--   * On account deletion the PII columns are set to NULL and Status = 'Deleted'.
-- Times are UTC. UserId is internal only — use PublicId in URLs and APIs.
CREATE TABLE [auth].[User]
(
    [UserId]                 BIGINT            IDENTITY (1, 1) NOT NULL,
    [PublicId]               UNIQUEIDENTIFIER  NOT NULL CONSTRAINT [DF_User_PublicId] DEFAULT (NEWSEQUENTIALID()),

    -- Sign-in identity
    [SignUpMethod]           VARCHAR (10)      NOT NULL,                       -- 'Mobile' | 'Google'
    [MobileCountryCode]      VARCHAR (5)       NULL,                           -- dial code, e.g. '+91'
    [MobileNumber]           VARCHAR (15)      MASKED WITH (FUNCTION = 'partial(0,"XXXXXX",4)') NULL,  -- digits only, without country code
    [MobileVerifiedAtUtc]    DATETIME2 (0)     NULL,
    [Email]                  NVARCHAR (254)    MASKED WITH (FUNCTION = 'email()') NULL,
    [EmailVerifiedAtUtc]     DATETIME2 (0)     NULL,
    [GoogleSubjectId]        VARCHAR (64)      MASKED WITH (FUNCTION = 'default()') NULL,              -- Google account id ("sub")

    -- Profile (filled in once, after the first sign-in)
    [FullName]               NVARCHAR (60)     MASKED WITH (FUNCTION = 'partial(1,"xxxxx",0)') NULL,
    [CountryCode]            CHAR (2)          NULL,                           -- ISO 3166-1 alpha-2, e.g. 'IN'
    [StateName]              NVARCHAR (60)     NULL,                           -- Indian state / UT, or region elsewhere
    [City]                   NVARCHAR (60)     MASKED WITH (FUNCTION = 'default()') NULL,
    [PreferredLanguage]      VARCHAR (5)       NOT NULL CONSTRAINT [DF_User_PreferredLanguage] DEFAULT ('en'),

    -- Eligibility and opt-ins
    [IsAdultConfirmed]       BIT               NOT NULL CONSTRAINT [DF_User_IsAdultConfirmed] DEFAULT (0),
    [AdultConfirmedAtUtc]    DATETIME2 (0)     NULL,
    [WhatsAppOptIn]          BIT               NOT NULL CONSTRAINT [DF_User_WhatsAppOptIn] DEFAULT (0),
    [WhatsAppOptInAtUtc]     DATETIME2 (0)     NULL,

    -- Lifecycle
    [Status]                 VARCHAR (13)      NOT NULL CONSTRAINT [DF_User_Status] DEFAULT ('Active'),  -- Active | Suspended | PendingDelete | Deleted
    [ProfileCompletedAtUtc]  DATETIME2 (0)     NULL,
    [LastSignInAtUtc]        DATETIME2 (0)     NULL,
    [CreatedAtUtc]           DATETIME2 (0)     NOT NULL CONSTRAINT [DF_User_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAtUtc]           DATETIME2 (0)     NOT NULL CONSTRAINT [DF_User_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [DeletedAtUtc]           DATETIME2 (0)     NULL,
    [RowVersion]             ROWVERSION        NOT NULL,

    CONSTRAINT [PK_User] PRIMARY KEY CLUSTERED ([UserId] ASC),
    CONSTRAINT [UQ_User_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),

    CONSTRAINT [CK_User_SignUpMethod] CHECK ([SignUpMethod] IN ('Mobile', 'Email', 'Google')),
    CONSTRAINT [CK_User_Status] CHECK ([Status] IN ('Active', 'Suspended', 'PendingDelete', 'Deleted')),
    -- A live account must have a way to sign in: a verified mobile, a verified email or Google
    -- (deleted accounts have their PII cleared)
    CONSTRAINT [CK_User_HasSignInIdentity] CHECK ([Status] = 'Deleted' OR [MobileNumber] IS NOT NULL OR [GoogleSubjectId] IS NOT NULL
        OR ([Email] IS NOT NULL AND [EmailVerifiedAtUtc] IS NOT NULL)),
    CONSTRAINT [CK_User_SignUpMethodIdentity] CHECK ([Status] = 'Deleted'
        OR ([SignUpMethod] = 'Mobile' AND [MobileNumber] IS NOT NULL)
        OR ([SignUpMethod] = 'Email' AND [Email] IS NOT NULL AND [EmailVerifiedAtUtc] IS NOT NULL)
        OR ([SignUpMethod] = 'Google' AND [GoogleSubjectId] IS NOT NULL)),
    CONSTRAINT [CK_User_EmailVerified] CHECK ([EmailVerifiedAtUtc] IS NULL OR [Email] IS NOT NULL),
    CONSTRAINT [CK_User_MobilePair] CHECK (([MobileNumber] IS NULL AND [MobileCountryCode] IS NULL)
        OR ([MobileNumber] IS NOT NULL AND [MobileCountryCode] IS NOT NULL)),
    CONSTRAINT [CK_User_MobileNumber] CHECK ([MobileNumber] NOT LIKE '%[^0-9]%' AND LEN([MobileNumber]) BETWEEN 6 AND 15),
    CONSTRAINT [CK_User_MobileCountryCode] CHECK ([MobileCountryCode] LIKE '+[0-9]%' AND [MobileCountryCode] NOT LIKE '+%[^0-9]%'),
    CONSTRAINT [CK_User_MobileVerified] CHECK ([MobileNumber] IS NULL OR [MobileVerifiedAtUtc] IS NOT NULL),
    CONSTRAINT [CK_User_Email] CHECK ([Email] LIKE '_%@_%._%'),
    -- Binary collation so the check is case-sensitive ('in' is rejected, 'IN' is accepted)
    CONSTRAINT [CK_User_CountryCode] CHECK ([CountryCode] COLLATE Latin1_General_BIN2 LIKE '[A-Z][A-Z]'),
    CONSTRAINT [CK_User_PreferredLanguage] CHECK ([PreferredLanguage] IN ('en', 'hi', 'bn', 'ar', 'es', 'fr')),
    CONSTRAINT [CK_User_AdultConfirmedAt] CHECK ([IsAdultConfirmed] = 0 OR [AdultConfirmedAtUtc] IS NOT NULL),
    CONSTRAINT [CK_User_WhatsAppOptInAt] CHECK ([WhatsAppOptIn] = 0 OR [WhatsAppOptInAtUtc] IS NOT NULL),
    -- Profile counts as complete only with a name, a country and the 18+ confirmation
    -- (not enforced on deleted accounts, whose name is cleared)
    CONSTRAINT [CK_User_ProfileComplete] CHECK ([Status] = 'Deleted' OR [ProfileCompletedAtUtc] IS NULL
        OR ([FullName] IS NOT NULL AND [CountryCode] IS NOT NULL AND [IsAdultConfirmed] = 1)),
    CONSTRAINT [CK_User_Deleted] CHECK (([Status] = 'Deleted' AND [DeletedAtUtc] IS NOT NULL)
        OR ([Status] <> 'Deleted' AND [DeletedAtUtc] IS NULL))
);
GO

-- One account per mobile number and per Google account (cleared values on deleted accounts are ignored)
CREATE UNIQUE NONCLUSTERED INDEX [UX_User_Mobile]
    ON [auth].[User] ([MobileCountryCode] ASC, [MobileNumber] ASC)
    WHERE [MobileNumber] IS NOT NULL;
GO

CREATE UNIQUE NONCLUSTERED INDEX [UX_User_GoogleSubjectId]
    ON [auth].[User] ([GoogleSubjectId] ASC)
    WHERE [GoogleSubjectId] IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX [IX_User_Email]
    ON [auth].[User] ([Email] ASC)
    WHERE [Email] IS NOT NULL;
GO

-- One account per verified email (sign-in by email). Case-insensitive, because the column collation is.
-- Unverified emails typed into a profile are not unique: they can't be used to sign in.
CREATE UNIQUE NONCLUSTERED INDEX [UX_User_VerifiedEmail]
    ON [auth].[User] ([Email] ASC)
    WHERE [EmailVerifiedAtUtc] IS NOT NULL;
GO

-- Mark personal data for SQL Server's data discovery & classification reports
ADD SENSITIVITY CLASSIFICATION TO [auth].[User].[MobileNumber]
    WITH (LABEL = 'Confidential', INFORMATION_TYPE = 'Contact Info');
GO
ADD SENSITIVITY CLASSIFICATION TO [auth].[User].[Email]
    WITH (LABEL = 'Confidential', INFORMATION_TYPE = 'Contact Info');
GO
ADD SENSITIVITY CLASSIFICATION TO [auth].[User].[FullName]
    WITH (LABEL = 'Confidential', INFORMATION_TYPE = 'Name');
GO
ADD SENSITIVITY CLASSIFICATION TO [auth].[User].[GoogleSubjectId]
    WITH (LABEL = 'Confidential', INFORMATION_TYPE = 'Credentials');
GO
ADD SENSITIVITY CLASSIFICATION TO [auth].[User].[City]
    WITH (LABEL = 'General', INFORMATION_TYPE = 'Contact Info');
GO
