-- 确保 resources 表具有所有必需字段
DROP PROCEDURE IF EXISTS EnsureResourceColumns;
DELIMITER //
CREATE PROCEDURE EnsureResourceColumns()
BEGIN
    -- 1. version 字段
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'resources' 
        AND COLUMN_NAME = 'version'
    ) THEN
        ALTER TABLE resources ADD COLUMN version VARCHAR(50) NULL COMMENT '软件版本';
    END IF;

    -- 2. file_path 字段
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'resources' 
        AND COLUMN_NAME = 'file_path'
    ) THEN
        ALTER TABLE resources ADD COLUMN file_path VARCHAR(500) NULL COMMENT '物理文件路径';
    END IF;

    -- 3. platform 字段
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'resources' 
        AND COLUMN_NAME = 'platform'
    ) THEN
        ALTER TABLE resources ADD COLUMN platform VARCHAR(50) NULL COMMENT '操作系统平台';
    END IF;
END //
DELIMITER ;
CALL EnsureResourceColumns();
DROP PROCEDURE EnsureResourceColumns;
