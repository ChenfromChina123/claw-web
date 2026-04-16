-- 添加用户等级（tier）相关字段
-- 用于区分不同身份用户的硬件资源配额

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

-- 添加用户等级字段（tier）
-- 可选值：free, basic, pro, enterprise, admin
CALL AddColumnIfNotExists('users', 'tier', 'VARCHAR(20) DEFAULT \'free\' COMMENT \'用户等级：free, basic, pro, enterprise, admin\' AFTER is_admin');

-- 添加用户订阅过期时间字段
CALL AddColumnIfNotExists('users', 'subscription_expires_at', 'TIMESTAMP NULL COMMENT \'订阅过期时间，NULL表示永久\' AFTER tier');

-- 添加用户配额覆盖字段（JSON格式，用于自定义配额）
CALL AddColumnIfNotExists('users', 'custom_quota', 'JSON NULL COMMENT \'自定义硬件资源配额（JSON格式）\' AFTER subscription_expires_at');

-- 添加用户等级索引
ALTER TABLE users ADD INDEX idx_tier (tier);

-- 添加订阅过期时间索引
ALTER TABLE users ADD INDEX idx_subscription_expires (subscription_expires_at);

-- 清理存储过程
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;

-- 创建用户等级配额表（用于管理员动态调整各等级配额）
CREATE TABLE IF NOT EXISTS user_tier_quotas (
  id VARCHAR(36) PRIMARY KEY,
  tier VARCHAR(20) NOT NULL UNIQUE COMMENT '用户等级',
  cpu_limit DECIMAL(4,2) NOT NULL DEFAULT 0.5 COMMENT 'CPU限制（核心数）',
  memory_limit_mb INT NOT NULL DEFAULT 256 COMMENT '内存限制（MB）',
  memory_reservation_mb INT NOT NULL DEFAULT 128 COMMENT '内存预留（MB）',
  storage_quota_mb INT NOT NULL DEFAULT 200 COMMENT '存储配额（MB）',
  max_sessions INT NOT NULL DEFAULT 3 COMMENT '最大会话数',
  max_pty_processes INT NOT NULL DEFAULT 2 COMMENT '最大PTY进程数',
  max_files INT NOT NULL DEFAULT 500 COMMENT '最大文件数',
  max_file_size_mb INT NOT NULL DEFAULT 5 COMMENT '单文件最大大小（MB）',
  network_bandwidth_kbps INT NOT NULL DEFAULT 1024 COMMENT '网络带宽限制（KB/s）',
  disk_io_bps INT NOT NULL DEFAULT 10 COMMENT '磁盘IO限制（MB/s）',
  priority INT NOT NULL DEFAULT 1 COMMENT '优先级',
  description TEXT COMMENT '等级描述',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tier (tier)
);

-- 插入默认配额配置
INSERT INTO user_tier_quotas (id, tier, cpu_limit, memory_limit_mb, memory_reservation_mb, storage_quota_mb, max_sessions, max_pty_processes, max_files, max_file_size_mb, network_bandwidth_kbps, disk_io_bps, priority, description) VALUES
(UUID(), 'free', 0.5, 256, 128, 200, 3, 2, 500, 5, 1024, 10, 1, '免费用户，基础资源配额，适合轻度使用'),
(UUID(), 'basic', 1.0, 512, 256, 500, 5, 3, 1000, 10, 2048, 20, 2, '基础付费用户，标准资源配额，适合个人开发者'),
(UUID(), 'pro', 2.0, 1024, 512, 2000, 10, 5, 3000, 20, 5120, 50, 3, '专业用户，增强资源配额，适合专业开发者'),
(UUID(), 'enterprise', 4.0, 2048, 1024, 10000, 20, 10, 10000, 50, 10240, 100, 4, '企业用户，高级资源配额，适合团队协作'),
(UUID(), 'admin', 8.0, 4096, 2048, 50000, 50, 20, 50000, 100, 0, 0, 5, '管理员用户，无资源限制')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
