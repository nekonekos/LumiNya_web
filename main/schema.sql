-- LumiNya 临时文件上传器（/uploadfiles）数据库结构
-- 初始化：npx wrangler d1 execute luminya-uploader --file=main/schema.sql --remote

-- 站点设置（目前只有上传口令的 SHA-256 哈希，单行 key-value）
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 已上传文件清单；id 同时是 R2 对象 key
CREATE TABLE IF NOT EXISTS files (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    content_type TEXT,
    ip           TEXT,
    country      TEXT,
    city         TEXT,
    created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at DESC);
