-- 修复 users 表，添加 email 和 password_hash 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(120) UNIQUE AFTER username;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) AFTER email;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER password_hash;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE AFTER is_active;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL AFTER updated_at;

-- 如果索引不存在则添加
-- 注意：MySQL 的 IF NOT EXISTS 对于 INDEX 不支持，需要用存储过程或忽略错误
