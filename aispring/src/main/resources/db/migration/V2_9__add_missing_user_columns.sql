-- 为 users 表添加缺失字段
-- 1. 添加 last_login 字段（如果不存在）
-- MySQL 8.0 之前版本不支持 ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- 这里使用存储过程来安全添加
DROP PROCEDURE IF EXISTS AddLastLoginToUsers;
DELIMITER //
CREATE PROCEDURE AddLastLoginToUsers()
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'last_login'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login DATETIME NULL COMMENT '最后登录时间';
    END IF;

    -- 2. 添加 is_active 字段（如果不存在）
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'is_active'
    ) THEN
        ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否激活';
    END IF;
END //
DELIMITER ;
CALL AddLastLoginToUsers();
DROP PROCEDURE IF EXISTS AddLastLoginToUsers;
