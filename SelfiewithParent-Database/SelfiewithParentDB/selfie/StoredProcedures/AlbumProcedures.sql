-- Family albums: a visitor's own selfies only (session-context UserId; row-level security on selfie.Submission hides
-- everyone else's). Selfies with a parent can be in an album: Selfie, AI-made, Then & Now, In loving memory.
-- Errors 50080-50089 are shown to the user.

-- Starts a family album from the visitor's selfie (or returns the album it is already in). Returns PublicId, InviteCode.
CREATE PROCEDURE [selfie].[usp_StartAlbum]
    @SelfiePublicId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50080, N'Please sign in again.', 1;
    DECLARE @sub BIGINT, @kind VARCHAR (10), @status VARCHAR (10);
    SELECT @sub = [SubmissionId], @kind = [Kind], @status = [Status] FROM [selfie].[Submission] WHERE [PublicId] = @SelfiePublicId AND [UserId] = @me;
    IF @sub IS NULL OR @status = 'Rejected'
        THROW 50081, N'Choose one of your own selfies.', 1;
    IF @kind NOT IN ('real', 'ai', 'thennow', 'memory')
        THROW 50082, N'Only a selfie with your parent can start a family album.', 1;

    DECLARE @album BIGINT = (SELECT [AlbumId] FROM [selfie].[AlbumSubmission] WHERE [SubmissionId] = @sub);
    IF @album IS NULL
    BEGIN
        DECLARE @code VARCHAR (12), @tries INT = 0;
        WHILE @code IS NULL OR EXISTS (SELECT 1 FROM [selfie].[FamilyAlbum] WHERE [InviteCode] = @code)
        BEGIN
            SET @tries += 1;
            IF @tries > 10 THROW 50089, N'Please try again.', 1;
            -- 10 characters from 31 letters and digits that can't be mixed up (no i, l, o, 0, 1): about 49 bits
            DECLARE @bytes VARBINARY (10) = CRYPT_GEN_RANDOM(10), @i INT = 1;
            SET @code = '';
            WHILE @i <= 10
            BEGIN
                SET @code += SUBSTRING('abcdefghjkmnpqrstuvwxyz23456789', CAST(SUBSTRING(@bytes, @i, 1) AS INT) % 31 + 1, 1);
                SET @i += 1;
            END;
        END;
        BEGIN TRANSACTION;
        INSERT [selfie].[FamilyAlbum] ([InviteCode], [CreatedByUserId]) VALUES (@code, @me);
        SET @album = SCOPE_IDENTITY();
        INSERT [selfie].[AlbumSubmission] ([AlbumId], [SubmissionId]) VALUES (@album, @sub);
        COMMIT;
    END;
    SELECT [PublicId], [InviteCode] FROM [selfie].[FamilyAlbum] WHERE [AlbumId] = @album;
END;
GO

-- Adds the visitor's selfie to the album of an invite link. Returns the album's PublicId.
CREATE PROCEDURE [selfie].[usp_JoinAlbum]
    @InviteCode     VARCHAR (12),
    @SelfiePublicId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL OR NOT EXISTS (SELECT 1 FROM [auth].[User] WHERE [UserId] = @me AND [Status] = 'Active')
        THROW 50080, N'Please sign in again.', 1;
    DECLARE @album BIGINT = (SELECT [AlbumId] FROM [selfie].[FamilyAlbum] WHERE [InviteCode] = LOWER(@InviteCode));
    IF @album IS NULL
        THROW 50083, N'This invite link doesn''t work any more. Ask for a new one.', 1;
    DECLARE @sub BIGINT, @kind VARCHAR (10), @status VARCHAR (10);
    SELECT @sub = [SubmissionId], @kind = [Kind], @status = [Status] FROM [selfie].[Submission] WHERE [PublicId] = @SelfiePublicId AND [UserId] = @me;
    IF @sub IS NULL OR @status = 'Rejected'
        THROW 50081, N'Choose one of your own selfies.', 1;
    IF @kind NOT IN ('real', 'ai', 'thennow', 'memory')
        THROW 50082, N'Only a selfie with your parent can go in a family album.', 1;
    DECLARE @current BIGINT = (SELECT [AlbumId] FROM [selfie].[AlbumSubmission] WHERE [SubmissionId] = @sub);
    IF @current IS NOT NULL AND @current <> @album
        THROW 50084, N'This selfie is already in another family album.', 1;
    IF @current IS NULL
    BEGIN
        IF (SELECT COUNT(*) FROM [selfie].[AlbumSubmission] WHERE [AlbumId] = @album) >= 60
            THROW 50085, N'This family album is full.', 1;
        INSERT [selfie].[AlbumSubmission] ([AlbumId], [SubmissionId]) VALUES (@album, @sub);
    END;
    SELECT [PublicId] FROM [selfie].[FamilyAlbum] WHERE [AlbumId] = @album;
END;
GO

-- Takes the visitor's selfie out of its family album (an album nobody is left in is removed).
CREATE PROCEDURE [selfie].[usp_LeaveAlbum]
    @SelfiePublicId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @me BIGINT = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    IF @me IS NULL
        THROW 50080, N'Please sign in again.', 1;
    DECLARE @sub BIGINT = (SELECT [SubmissionId] FROM [selfie].[Submission] WHERE [PublicId] = @SelfiePublicId AND [UserId] = @me);
    IF @sub IS NULL
        THROW 50081, N'Choose one of your own selfies.', 1;
    DECLARE @album BIGINT = (SELECT [AlbumId] FROM [selfie].[AlbumSubmission] WHERE [SubmissionId] = @sub);
    DELETE [selfie].[AlbumSubmission] WHERE [SubmissionId] = @sub;
    IF @album IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [selfie].[AlbumSubmission] WHERE [AlbumId] = @album)
        DELETE [selfie].[FamilyAlbum] WHERE [AlbumId] = @album;
END;
GO
