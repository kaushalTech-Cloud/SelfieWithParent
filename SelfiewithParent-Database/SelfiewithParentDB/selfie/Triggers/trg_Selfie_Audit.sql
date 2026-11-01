-- Records every submission created, reviewed or removed, and every file added / removed, in audit.ChangeLog
-- (who did what, never the photo, video or personal details).
CREATE TRIGGER [selfie].[trg_Submission_Audit]
    ON [selfie].[Submission]
    AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'selfie.Submission', COALESCE(i.[SubmissionId], d.[SubmissionId]),
           CASE WHEN d.[SubmissionId] IS NULL THEN 'I' WHEN i.[SubmissionId] IS NULL THEN 'D' ELSE 'U' END,
           CASE WHEN d.[SubmissionId] IS NULL THEN CONCAT(N'Kind=', i.[Kind])
                WHEN i.[SubmissionId] IS NOT NULL AND i.[Status] <> d.[Status] THEN CONCAT(N'Status=', i.[Status], N',was=', d.[Status]) END,
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[SubmissionId] = i.[SubmissionId];
END;
GO

CREATE TRIGGER [selfie].[trg_SubmissionFile_Audit]
    ON [selfie].[SubmissionFile]
    AFTER INSERT, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @actor BIGINT       = TRY_CAST(SESSION_CONTEXT(N'UserId') AS BIGINT);
    DECLARE @scope NVARCHAR(20) = CAST(SESSION_CONTEXT(N'AccessScope') AS NVARCHAR(20));
    INSERT [audit].[ChangeLog] ([TableName], [RowKey], [Action], [ChangedColumns], [ActorUserId], [AccessScope])
    SELECT N'selfie.SubmissionFile', COALESCE(i.[FileId], d.[FileId]), IIF(i.[FileId] IS NULL, 'D', 'I'),
           CONCAT(N'Submission=', COALESCE(i.[SubmissionId], d.[SubmissionId]), N',Role=', COALESCE(i.[Role], d.[Role]),
                  IIF(i.[FileId] IS NULL, NULL, CONCAT(N',ContentType=', i.[ContentType], N',SizeBytes=', i.[SizeBytes]))),
           @actor, @scope
    FROM inserted AS i
    FULL OUTER JOIN deleted AS d ON d.[FileId] = i.[FileId];
END;
GO
