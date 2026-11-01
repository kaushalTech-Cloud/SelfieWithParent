-- A family date a visitor wants to be reminded of: a parent's / grandparent's birthday, their parents' anniversary, or a
-- remembrance day. The site emails a reminder 3 days before and on the day (and shows a notice when they sign in).
-- Written only through selfie.usp_SaveFamilyDate / usp_DeleteFamilyDate (the visitor's own rows; row-level security).
-- PII column: Name.
CREATE TABLE [selfie].[FamilyDate]
(
    [FamilyDateId]  BIGINT              IDENTITY (1, 1) NOT NULL,
    [PublicId]      UNIQUEIDENTIFIER    NOT NULL CONSTRAINT [DF_FamilyDate_PublicId] DEFAULT (NEWID()),
    [UserId]        BIGINT              NOT NULL,
    [Name]          NVARCHAR (60)       MASKED WITH (FUNCTION = 'partial(1,"xxxxx",0)') NOT NULL,   -- e.g. 'Papa', 'Nani'
    [Relation]      VARCHAR (20)        NOT NULL,
    [Occasion]      VARCHAR (12)        NOT NULL,     -- Birthday | Anniversary | Remembrance
    [DateMonth]     TINYINT             NOT NULL,
    [DateDay]       TINYINT             NOT NULL,
    [DateYear]      SMALLINT            NULL,         -- optional: to say "turns 60" / "35 years"
    [CreatedAtUtc]  DATETIME2 (0)       NOT NULL CONSTRAINT [DF_FamilyDate_CreatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    [UpdatedAtUtc]  DATETIME2 (0)       NOT NULL CONSTRAINT [DF_FamilyDate_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_FamilyDate] PRIMARY KEY CLUSTERED ([FamilyDateId] ASC),
    CONSTRAINT [UQ_FamilyDate_PublicId] UNIQUE NONCLUSTERED ([PublicId] ASC),
    CONSTRAINT [FK_FamilyDate_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_FamilyDate_Relation] CHECK ([Relation] IN ('Mother', 'Father', 'Parents', 'Grandmother', 'Grandfather', 'Grandparents',
        'Step-parent', 'Guardian', 'Other')),
    CONSTRAINT [CK_FamilyDate_Occasion] CHECK ([Occasion] IN ('Birthday', 'Anniversary', 'Remembrance')),
    -- A real day of the year (29 February is allowed: reminded on 28 February in other years)
    CONSTRAINT [CK_FamilyDate_Date] CHECK ([DateMonth] BETWEEN 1 AND 12 AND [DateDay] >= 1 AND [DateDay] <=
        CASE WHEN [DateMonth] = 2 THEN 29 WHEN [DateMonth] IN (4, 6, 9, 11) THEN 30 ELSE 31 END),
    CONSTRAINT [CK_FamilyDate_Year] CHECK ([DateYear] IS NULL OR [DateYear] BETWEEN 1900 AND 2100),
    CONSTRAINT [CK_FamilyDate_Name] CHECK (LEN([Name]) >= 1 AND [Name] NOT LIKE '%[<>]%')
);
GO

CREATE NONCLUSTERED INDEX [IX_FamilyDate_User]
    ON [selfie].[FamilyDate] ([UserId]);
GO

CREATE NONCLUSTERED INDEX [IX_FamilyDate_Day]
    ON [selfie].[FamilyDate] ([DateMonth], [DateDay]);
GO
