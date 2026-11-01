-- An APPROVED "in loving memory" tribute and how many candles it has. Used by selfie.usp_SetCandle, which runs as the
-- visitor: row-level security would hide another visitor's tribute and candles from a direct query, so this function
-- runs as the login-less user swp_staff_admin (allowed past the row rule) and returns only the id and the count —
-- nothing personal.
CREATE FUNCTION [selfie].[fn_ApprovedMemory] (@PublicId UNIQUEIDENTIFIER)
RETURNS @r TABLE ([SubmissionId] BIGINT, [Candles] INT)
WITH EXECUTE AS N'swp_staff_admin'
AS
BEGIN
    INSERT @r
    SELECT s.[SubmissionId], (SELECT COUNT(*) FROM [selfie].[Candle] AS c WHERE c.[SubmissionId] = s.[SubmissionId])
    FROM [selfie].[Submission] AS s
    WHERE s.[PublicId] = @PublicId AND s.[Status] = 'Approved' AND s.[Kind] = 'memory';
    RETURN;
END;
GO
