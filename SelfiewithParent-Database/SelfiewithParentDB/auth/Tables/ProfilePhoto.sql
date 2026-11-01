-- An account's profile photo (visitors and staff alike): one per account, stored in the database.
-- PNG, JPEG or WebP up to 10 MB; the API checks the file's real type before saving. PublicId changes with every new
-- photo, so browsers can keep a copy for as long as it is current.
-- Written only through auth.usp_SetProfilePhoto / auth.usp_RemoveProfilePhoto (the signed-in account's own photo).
-- Row-level security (security.UserAccessPolicy) keeps each photo to its owner; staff screens read it in System scope.
CREATE TABLE [auth].[ProfilePhoto]
(
    [UserId]        BIGINT              NOT NULL,
    [PublicId]      UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_ProfilePhoto_PublicId] DEFAULT (NEWID()),
    [ContentType]   VARCHAR (20)        NOT NULL,
    [Data]          VARBINARY (MAX)     NOT NULL,
    [SizeBytes]     INT                 NOT NULL,
    [UpdatedAtUtc]  DATETIME2 (0)       NOT NULL CONSTRAINT [DF_ProfilePhoto_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_ProfilePhoto] PRIMARY KEY CLUSTERED ([UserId] ASC),
    CONSTRAINT [UQ_ProfilePhoto_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_ProfilePhoto_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_ProfilePhoto_ContentType] CHECK ([ContentType] IN ('image/png', 'image/jpeg', 'image/webp')),
    CONSTRAINT [CK_ProfilePhoto_Size] CHECK ([SizeBytes] = DATALENGTH([Data]) AND [SizeBytes] BETWEEN 1 AND 10485760)
);
GO

ADD SENSITIVITY CLASSIFICATION TO [auth].[ProfilePhoto].[Data]
    WITH (LABEL = 'Confidential - GDPR', INFORMATION_TYPE = 'Photo');
GO
