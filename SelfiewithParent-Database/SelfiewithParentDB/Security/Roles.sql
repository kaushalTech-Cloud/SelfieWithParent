-- Database roles. Give people and services a role — never direct table permissions, never db_owner.

-- The website / API connection. Reads and writes visitor data for the signed-in visitor only
-- (enforced by row-level security). Cannot hard-delete rows or read the audit log.
CREATE ROLE [swp_app] AUTHORIZATION [dbo];
GO

-- Support staff. Read-only, and personal data is masked (no UNMASK).
CREATE ROLE [swp_support] AUTHORIZATION [dbo];
GO

-- Privacy officer. Handles "download / delete my data" requests: sees unmasked data and the audit log.
CREATE ROLE [swp_privacy_officer] AUTHORIZATION [dbo];
GO
