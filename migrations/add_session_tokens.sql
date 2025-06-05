ALTER TABLE sessions ADD COLUMN auth_token TEXT;
ALTER TABLE sessions ADD COLUMN refresh_token TEXT;
ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'; 