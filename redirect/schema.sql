CREATE TABLE IF NOT EXISTS links (
    code TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_enabled ON links (enabled);