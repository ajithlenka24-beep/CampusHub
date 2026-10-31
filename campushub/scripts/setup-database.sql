-- Run once as the PostgreSQL superuser (e.g. `psql -U postgres -f scripts/setup-database.sql`)
-- to create the CampusHub user and databases used by .env.example and .env.test.example.
CREATE USER campushub WITH PASSWORD 'campushub' CREATEDB;
CREATE DATABASE campushub OWNER campushub;
CREATE DATABASE campushub_test OWNER campushub;
