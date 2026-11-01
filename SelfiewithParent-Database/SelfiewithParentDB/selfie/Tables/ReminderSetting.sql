-- A visitor's reminder choices. No row = both on (a visitor who saves a family date wants to hear about it).
-- Written only through selfie.usp_SetReminderSettings (the visitor's own row, also from the email's "switch off" link).
CREATE TABLE [selfie].[ReminderSetting]
(
    [UserId]          BIGINT          NOT NULL,
    [EmailReminders]  BIT             NOT NULL,   -- family date reminders by email
    [ThenNowNudges]   BIT             NOT NULL,   -- "a year ago you shared this — take it again" emails
    [UpdatedAtUtc]    DATETIME2 (0)   NOT NULL CONSTRAINT [DF_ReminderSetting_UpdatedAtUtc] DEFAULT (SYSUTCDATETIME()),
    -- added last (a new column in the middle would rebuild the table, which row-level security blocks)
    [StreakNudges]    BIT             NOT NULL CONSTRAINT [DF_ReminderSetting_StreakNudges] DEFAULT (1),   -- Sunday "keep your gratitude streak" email

    CONSTRAINT [PK_ReminderSetting] PRIMARY KEY CLUSTERED ([UserId] ASC),
    CONSTRAINT [FK_ReminderSetting_User] FOREIGN KEY ([UserId]) REFERENCES [auth].[User] ([UserId])
);
GO
