-- The signed-in account's own profile photo. The account is the read-only session-context UserId (never a parameter),
-- and row-level security only lets these touch that account's row. They run as the caller (no EXECUTE AS);
-- removing needs no DELETE permission on the auth schema because the procedure and table share an owner.

-- Saves (adds or replaces) the photo. Returns the new PublicId (a new one every time, so old copies aren't reused).
CREATE PROCEDURE [auth].[usp_SetProfilePhoto]
    @ContentType VARCHAR (20),
    @Data        VARBINARY (MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50040, N'Please sign in again.', 1;

    DECLARE @id UNIQUEIDENTIFIER = NEWID();
    BEGIN TRY
        BEGIN TRANSACTION;
        UPDATE [auth].[ProfilePhoto]
           SET [PublicId] = @id, [ContentType] = @ContentType, [Data] = @Data, [SizeBytes] = DATALENGTH(@Data), [UpdatedAtUtc] = SYSUTCDATETIME()
         WHERE [UserId] = @me;
        IF @@ROWCOUNT = 0
            INSERT [auth].[ProfilePhoto] ([UserId], [PublicId], [ContentType], [Data], [SizeBytes])
            VALUES (@me, @id, @ContentType, @Data, DATALENGTH(@Data));
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
    SELECT @id AS [PublicId];
END;
GO

-- Removes the photo (the account shows its initials again).
CREATE PROCEDURE [auth].[usp_RemoveProfilePhoto]
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL
        THROW 50040, N'Please sign in again.', 1;
    DELETE [auth].[ProfilePhoto] WHERE [UserId] = @me;
END;
GO
