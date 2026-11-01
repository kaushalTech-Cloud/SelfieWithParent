-- An APPROVED submission (any kind) and how many likes it has. Used by selfie.usp_SetLike, which runs as the visitor:
-- row-level security would hide another visitor's submission and likes from a direct query, so this function runs as
-- the login-less user swp_staff_admin (allowed past the row rule) and returns only the id and the count — nothing personal.
CREATE FUNCTION [selfie].[fn_ApprovedSubmission] (@PublicId UNIQUEIDENTIFIER)
RETURNS @r TABLE ([SubmissionId] BIGINT, [Likes] INT)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    INSERT @r
    SELECT s.[SubmissionId], (SELECT COUNT(*) FROM [selfie].[SubmissionLike] AS l WHERE l.[SubmissionId] = s.[SubmissionId])
    FROM [selfie].[Submission] AS s
    WHERE s.[PublicId] = @PublicId AND s.[Status] = 'Approved';
    RETURN;
END;
GO
