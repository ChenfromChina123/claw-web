-- 修复 users 表，添加 email 和 password_hash 字段
-- 使用存储过程来检查列是否存在，兼容 MySQL 8.0

DELIMITER $$

DROP PROCEDURE IF EXISTS AddColumnIfNotExists$$

CREATE PROCEDURE AddColumnIfNotExists(
    IN tableName VARCHAR(64),
    IN colName VARCHAR(64),
    IN colDef VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = tableName
        AND column_name = colName
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN ', colName, ' ', colDef);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- 添加 email 字段
CALL AddColumnIfNotExists('users', 'email', 'VARCHAR(120) UNIQUE AFTER username');

-- 添加 password_hash 字段
CALL AddColumnIfNotExists('users', 'password_hash', 'VARCHAR(255) AFTER email');

-- 添加 is_active 字段
CALL AddColumnIfNotExists('users', 'is_active', 'BOOLEAN DEFAULT TRUE AFTER password_hash');

-- 添加 is_admin 字段
CALL AddColumnIfNotExists('users', 'is_admin', 'BOOLEAN DEFAULT FALSE AFTER is_active');

-- 添加 last_login 字段
CALL AddColumnIfNotExists('users', 'last_login', 'TIMESTAMP NULL AFTER updated_at');

-- 清理存储过程
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
