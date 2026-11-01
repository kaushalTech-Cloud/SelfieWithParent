-- Optional password for email sign-in (the emailed code always works too).
-- Kept apart from auth.User so the hash is never selected with the profile, and so support staff can be
-- denied this table outright. Only a salted, slow hash is stored (PBKDF2-HMAC-SHA512, made by the API) —
-- never the password itself. Wrong attempts lock the password for a while; the emailed code still works.
-- Deleting an account clears the hash (PasswordHash = NULL). Changes are recorded in audit.ChangeLog.
CREATE TABLE [auth].[UserPassword]
(
    [UserId]            BIGINT          NOT NULL,
    [PasswordHash]      VARCHAR (200)   NULL,           -- 'pbkdf2-sha512$<iterations>$<salt base64>$<hash base64>'; NULL = no password
    [FailedAttempts]    SMALLINT        NOT NULL CONSTRAINT [DF_UserPassword_FailedAttempts] DEFAULT (0),
    [LockedUntilUtc]    DATETIME2 (0)   NULL,           -- too many wrong passwords: password sign-in paused until then
    [LastFailedAtUtc]   DATETIME2 (0)   NULL,
    [CreatedAtUtc]      DATETIME2 (0)   NOT NULL CONSTRAINT [DF_UserPassword_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAtUtc]      DATETIME2 (0)   NOT NULL CONSTRAINT [DF_UserPassword_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_UserPassword] PRIMARY KEY CLUSTERED ([UserId] ASC),
    CONSTRAINT [FK_UserPassword_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    -- Only the API's hash format is accepted, so a plain-text password can never be stored by mistake
    CONSTRAINT [CK_UserPassword_HashFormat] CHECK ([PasswordHash] IS NULL
        OR ([PasswordHash] COLLATE Latin1_General_BIN2 LIKE 'pbkdf2-sha512$[1-9]%$%$%' AND LEN([PasswordHash]) >= 80)),
    CONSTRAINT [CK_UserPassword_FailedAttempts] CHECK ([FailedAttempts] BETWEEN 0 AND 1000)
);
GO

ADD SENSITIVITY CLASSIFICATION TO [auth].[UserPassword].[PasswordHash]
    WITH (LABEL = 'Highly Confidential', INFORMATION_TYPE = 'Credentials');
GO
