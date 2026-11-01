-- Reminder emails sent, so each is sent once: 'soon' (3 days before a family date), 'today' (on the day), 'thennow'
-- (a year since an approved selfie). RefId: the FamilyDateId or the SubmissionId; ForDate: the day it is about.
-- Written only by the background reminder job (System scope) through selfie.usp_LogReminder.
CREATE TABLE [selfie].[ReminderLog]
(
    [ReminderLogId] BIGINT          IDENTITY (1, 1) NOT NULL,
    [UserId]        BIGINT          NOT NULL,
    [Kind]          VARCHAR (10)    NOT NULL,
    [RefId]         BIGINT          NOT NULL,
    [ForDate]       DATE            NOT NULL,
    [SentAtUtc]     DATETIME2 (0)   NOT NULL CONSTRAINT [DF_ReminderLog_SentAtUtc] DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT [PK_ReminderLog] PRIMARY KEY CLUSTERED ([ReminderLogId] ASC),
    CONSTRAINT [UQ_ReminderLog_Once] UNIQUE NONCLUSTERED ([UserId] ASC, [Kind] ASC, [RefId] ASC, [ForDate] ASC),
    CONSTRAINT [FK_ReminderLog_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId]),
    CONSTRAINT [CK_ReminderLog_Kind] CHECK ([Kind] IN ('soon', 'today', 'thennow', 'streak'))   -- streak: RefId = the visitor, ForDate = the Sunday
);
GO
