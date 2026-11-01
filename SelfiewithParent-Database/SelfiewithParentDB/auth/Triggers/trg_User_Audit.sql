-- Records every insert / update / delete on auth.User in audit.ChangeLog.
-- Only column NAMES are logged for updates, so no personal data is copied into the log.
CREATE TRIGGER [auth].[trg_User_Audit]
    ON [auth].[User]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @actor BIGINT        = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20)  = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));

    -- Inserts
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ActorUserId], [AccessScope])
    SELECT N'auth.User', i.[UserId], 'I', @actor, @scope
    FROM inserted AS i
    WHERE NOT EXISTS (SELECT 1 FROM deleted AS d WHERE d.[UserId] = i.[UserId]);

    -- Deletes (hard deletes are denied to app roles; logged if an owner ever does one)
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ActorUserId], [AccessScope])
    SELECT N'auth.User', d.[UserId], 'D', @actor, @scope
    FROM deleted AS d
    WHERE NOT EXISTS (SELECT 1 FROM inserted AS i WHERE i.[UserId] = d.[UserId]);

    -- Updates: list the columns whose value actually changed
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'auth.User', i.[UserId], 'U', c.[Cols], @actor, @scope
    FROM inserted AS i
    JOIN deleted  AS d ON d.[UserId] = i.[UserId]
    CROSS APPLY (SELECT STUFF(CONCAT(
          CASE WHEN EXISTS (SELECT i.[MobileCountryCode], i.[MobileNumber] EXCEPT SELECT d.[MobileCountryCode], d.[MobileNumber]) THEN N',MobileNumber' END,
          CASE WHEN EXISTS (SELECT i.[MobileVerifiedAtUtc] EXCEPT SELECT d.[MobileVerifiedAtUtc]) THEN N',MobileVerifiedAtUtc' END,
          CASE WHEN EXISTS (SELECT i.[Email] EXCEPT SELECT d.[Email]) THEN N',Email' END,
          CASE WHEN EXISTS (SELECT i.[EmailVerifiedAtUtc] EXCEPT SELECT d.[EmailVerifiedAtUtc]) THEN N',EmailVerifiedAtUtc' END,
          CASE WHEN EXISTS (SELECT i.[GoogleSubjectId] EXCEPT SELECT d.[GoogleSubjectId]) THEN N',GoogleSubjectId' END,
          CASE WHEN EXISTS (SELECT i.[FullName] EXCEPT SELECT d.[FullName]) THEN N',FullName' END,
          CASE WHEN EXISTS (SELECT i.[CountryCode], i.[StateName], i.[City] EXCEPT SELECT d.[CountryCode], d.[StateName], d.[City]) THEN N',Location' END,
          CASE WHEN EXISTS (SELECT i.[PreferredLanguage] EXCEPT SELECT d.[PreferredLanguage]) THEN N',PreferredLanguage' END,
          CASE WHEN EXISTS (SELECT i.[IsAdultConfirmed] EXCEPT SELECT d.[IsAdultConfirmed]) THEN N',IsAdultConfirmed' END,
          CASE WHEN EXISTS (SELECT i.[WhatsAppOptIn] EXCEPT SELECT d.[WhatsAppOptIn]) THEN N',WhatsAppOptIn' END,
          CASE WHEN EXISTS (SELECT i.[Status] EXCEPT SELECT d.[Status]) THEN N',Status' END,
          CASE WHEN EXISTS (SELECT i.[ProfileCompletedAtUtc] EXCEPT SELECT d.[ProfileCompletedAtUtc]) THEN N',ProfileCompletedAtUtc' END,
          CASE WHEN EXISTS (SELECT i.[LastSignInAtUtc] EXCEPT SELECT d.[LastSignInAtUtc]) THEN N',LastSignInAtUtc' END
        ), 1, 1, N'') AS [Cols]) AS c
    WHERE c.[Cols] IS NOT NULL;
END;
GO
