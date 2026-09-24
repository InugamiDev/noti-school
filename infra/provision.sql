-- REVIEW-ONLY coordinator template. Never run from application startup or CI.
-- Requires an approved PostgreSQL administrator connection to postgres, not another app DB.
-- CREATE statements intentionally fail if names already exist. No passwords in this file.
\set ON_ERROR_STOP on
CREATE ROLE noti_school_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE noti_school_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE noti_school_auth_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE noti_school_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE noti_school_auth LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE noti_school OWNER noti_school_owner;
\connect noti_school
REVOKE ALL ON DATABASE noti_school FROM PUBLIC;
GRANT CONNECT ON DATABASE noti_school TO noti_school_migrator, noti_school_auth_migrator, noti_school_api, noti_school_auth;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION vector WITH SCHEMA public;
CREATE SCHEMA product AUTHORIZATION noti_school_migrator;
CREATE SCHEMA auth AUTHORIZATION noti_school_auth_migrator;
CREATE SCHEMA noti_meta AUTHORIZATION noti_school_owner;
CREATE TABLE noti_meta.identity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), project text NOT NULL CHECK(project = 'noti.school'), purpose text NOT NULL CHECK(purpose IN ('production','test')));
INSERT INTO noti_meta.identity VALUES(true,'noti.school','production');
ALTER TABLE noti_meta.identity OWNER TO noti_school_owner;
GRANT USAGE ON SCHEMA noti_meta TO noti_school_migrator, noti_school_auth_migrator;
GRANT SELECT ON noti_meta.identity TO noti_school_migrator, noti_school_auth_migrator;
GRANT USAGE ON SCHEMA product TO noti_school_api;
GRANT USAGE ON SCHEMA auth TO noti_school_auth;
ALTER ROLE noti_school_api IN DATABASE noti_school SET search_path = product, public;
ALTER ROLE noti_school_auth IN DATABASE noti_school SET search_path = auth;
ALTER ROLE noti_school_auth_migrator IN DATABASE noti_school SET search_path = auth;
-- Set unique role passwords interactively with psql \password; never via committed SQL.
-- pg_hba must reject these roles on ALL databases other than this dedicated database.
-- Use role-specific allow entries for noti_school, followed by reject entries for all
-- databases for these four login roles, before any broader host allow rules.
