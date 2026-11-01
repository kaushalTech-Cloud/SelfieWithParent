-- Schema for giving: the Support page's content, fundraising campaigns and donations. Donors' details (name, email, phone,
-- PAN for 80G receipts) live only here: the website reads it, staff support / privacy roles don't, and every write goes
-- through a give.usp_ procedure that checks who may make it.
CREATE SCHEMA [give]
    AUTHORIZATION [dbo];
