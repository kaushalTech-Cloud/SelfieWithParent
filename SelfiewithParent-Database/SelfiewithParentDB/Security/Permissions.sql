-- Permissions are granted per SCHEMA, so every table added to these schemas later is covered automatically.
-- Note: never DENY CONTROL on a schema the role must use: CONTROL includes SELECT/INSERT/UPDATE, and DENY always wins.

-- ----- Website / API -----
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[auth] TO [swp_app];
GO
-- Accounts are deleted by clearing PII + Status = 'Deleted', never by hard DELETE
DENY DELETE ON SCHEMA::[auth] TO [swp_app];
GO
-- The app needs real values (e.g. email for notifications); row-level security limits it to the signed-in visitor's own row
GRANT UNMASK TO [swp_app];
GO
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[audit] TO [swp_app];
GO
DENY ALTER, TAKE OWNERSHIP ON SCHEMA::[auth] TO [swp_app];
GO
DENY ALTER, CONTROL, TAKE OWNERSHIP, EXECUTE, SELECT ON SCHEMA::[security] TO [swp_app];
GO

-- ----- Support (read-only, masked) -----
GRANT SELECT ON SCHEMA::[auth] TO [swp_support];
GO
DENY INSERT, UPDATE, DELETE ON SCHEMA::[auth] TO [swp_support];
GO
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[audit] TO [swp_support];
GO
DENY ALTER, TAKE OWNERSHIP ON SCHEMA::[auth] TO [swp_support];
GO

-- ----- Privacy officer (data requests) -----
GRANT SELECT, UPDATE ON SCHEMA::[auth] TO [swp_privacy_officer];
GO
DENY DELETE ON SCHEMA::[auth] TO [swp_privacy_officer];
GO
GRANT UNMASK TO [swp_privacy_officer];
GO
GRANT SELECT ON SCHEMA::[audit] TO [swp_privacy_officer];
GO
DENY INSERT, UPDATE, DELETE ON SCHEMA::[audit] TO [swp_privacy_officer];
GO
DENY ALTER, TAKE OWNERSHIP ON SCHEMA::[auth] TO [swp_privacy_officer];
GO

-- ----- Roles: nobody but the database owner can grant or change staff roles -----
-- (object-level DENY overrides the schema-level GRANTs above)
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[Role] TO [swp_app];
GO
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[UserRole] TO [swp_app];
GO
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[Role] TO [swp_privacy_officer];
GO
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[UserRole] TO [swp_privacy_officer];
GO

-- ----- Creating staff: the website may run this one procedure, which itself checks that the caller is a super admin
-- (it is the only way the website can give a staff role; super admins are still set up by the database owner) -----
GRANT EXECUTE ON OBJECT::[auth].[usp_CreateStaffUser] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[auth].[usp_DeleteStaffUser] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[auth].[usp_UpdateStaffUser] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[auth].[usp_SetStaffActive] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[auth].[usp_SetVisitorActive] TO [swp_app];
GO
-- Content pages, public menus and images: changed only through these procedures (each checks SuperAdmin / Admin)
GRANT EXECUTE ON OBJECT::[site].[usp_CreatePage] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_UpdatePage] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_SavePageContent] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_DeletePageContent] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_DeletePage] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_SaveMenuItem] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_DeleteMenuItem] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_ReorderMenu] TO [swp_app];
GO
-- Site settings (e.g. auto-approving photo frames): SuperAdmin / Admin, checked by the procedure
GRANT EXECUTE ON OBJECT::[site].[usp_SetSetting] TO [swp_app];
GO
-- The contact form (anyone) and its inbox (SuperAdmin / Admin, checked by the procedure)
GRANT EXECUTE ON OBJECT::[site].[usp_SendContactMessage] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_SetContactMessageStatus] TO [swp_app];
GO
-- The home page's content (SuperAdmin / Admin, checked by the procedure)
GRANT EXECUTE ON OBJECT::[site].[usp_SaveHomeContent] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_SaveMedia] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[site].[usp_DeleteMedia] TO [swp_app];
GO
-- Profile photos: written only through these procedures (the signed-in account's own photo)
GRANT EXECUTE ON OBJECT::[auth].[usp_SetProfilePhoto] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[auth].[usp_RemoveProfilePhoto] TO [swp_app];
GO
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[ProfilePhoto] TO [swp_app];
GO
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::[auth].[ProfilePhoto] TO [swp_support];
GO
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[ProfilePhoto] TO [swp_privacy_officer];
GO
-- Status-change reasons: readable, but written only through auth.usp_SetVisitorActive (never directly)
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[AccountStatusChange] TO [swp_app];
GO
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[AccountStatusChange] TO [swp_support];
GO
DENY INSERT, UPDATE, DELETE ON OBJECT::[auth].[AccountStatusChange] TO [swp_privacy_officer];
GO

-- ----- Passwords: only the website reads or writes them (it checks them); staff never see the hashes -----
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::[auth].[UserPassword] TO [swp_support];
GO
DENY SELECT, INSERT, UPDATE, DELETE ON OBJECT::[auth].[UserPassword] TO [swp_privacy_officer];
GO

-- ----- Site content (menus): read-only for every role; only the database owner changes it -----
GRANT SELECT ON SCHEMA::[site] TO [swp_app];
GO
DENY INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[site] TO [swp_app];
GO
GRANT SELECT ON SCHEMA::[site] TO [swp_support];
GO
DENY INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[site] TO [swp_support];
GO
DENY INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[site] TO [swp_privacy_officer];
GO

-- ----- Selfie submissions: readable (row-level security: own rows, or System scope for staff screens);
-- created only through selfie.usp_CreateSubmission and reviewed only through selfie.usp_ReviewSubmission -----
GRANT SELECT ON SCHEMA::[selfie] TO [swp_app];
GO
DENY INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[selfie] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_CreateSubmission] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_ReviewSubmission] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_DeleteMySubmissions] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_SetFeatured] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_SetCandle] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_ShareFrame] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_ShareReel] TO [swp_app];
GO
-- Parents' Voices: share a story, staff review it, visitors send love
GRANT EXECUTE ON OBJECT::[selfie].[usp_CreateParentStory] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_ReviewParentStory] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_SetParentStoryLove] TO [swp_app];
GO
-- Gratitude streaks and public profiles (the visitor's own rows)
GRANT EXECUTE ON OBJECT::[selfie].[usp_GratitudeCheckIn] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_SetStreakNudges] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_SaveMyProfile] TO [swp_app];
GO
-- Family albums (the visitor's own selfies)
GRANT EXECUTE ON OBJECT::[selfie].[usp_StartAlbum] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_JoinAlbum] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_LeaveAlbum] TO [swp_app];
GO
-- Likes, family date reminders and the reminder job (each procedure checks who may call it)
GRANT EXECUTE ON OBJECT::[selfie].[usp_SetLike] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_SaveFamilyDate] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_DeleteFamilyDate] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_SetReminderSettings] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_LogReminder] TO [swp_app];
GO
-- Photo of the Week / festival contests (each procedure checks who may call it)
GRANT EXECUTE ON OBJECT::[selfie].[usp_SaveContest] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_DeleteContest] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_RunContests] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[selfie].[usp_MarkWinnerNotified] TO [swp_app];
GO
GRANT SELECT ON SCHEMA::[selfie] TO [swp_privacy_officer];
GO
DENY INSERT, UPDATE, ALTER, TAKE OWNERSHIP ON SCHEMA::[selfie] TO [swp_privacy_officer];
GO
DENY SELECT, INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[selfie] TO [swp_support];
GO

-- Giving: the website reads; every write goes through a give.usp_ procedure that checks who may make it. Donors'
-- details are not readable by the support role; the privacy officer can read (for data requests), not change.
GRANT SELECT ON SCHEMA::[give] TO [swp_app];
GO
DENY INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[give] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_SaveSupportContent] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_SaveCampaign] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_DeleteCampaign] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_CreateDonation] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_SetDonationPaid] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_SetDonationFailed] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_MarkReceiptSent] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_RecordOfflineDonation] TO [swp_app];
GO
GRANT EXECUTE ON OBJECT::[give].[usp_RefundDonation] TO [swp_app];
GO
GRANT SELECT ON SCHEMA::[give] TO [swp_privacy_officer];
GO
DENY INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[give] TO [swp_privacy_officer];
GO
DENY SELECT, INSERT, UPDATE, DELETE, ALTER, TAKE OWNERSHIP ON SCHEMA::[give] TO [swp_support];
GO
