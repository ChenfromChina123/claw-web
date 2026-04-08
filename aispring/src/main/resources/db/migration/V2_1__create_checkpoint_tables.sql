-- =============================================
-- AISpring AI Terminal System Refactor
-- Phase 1: Database Schema Migration
-- Version: 2.1
-- Date: 2025-12-23
-- Description: 创建检查点系统相关表
-- =============================================

SET FOREIGN_KEY_CHECKS = 0;

-- 清理 chat_records 中的相关字段和约束（如果存在）
DROP PROCEDURE IF EXISTS DropChatRecordsFields;
DELIMITER //
CREATE PROCEDURE DropChatRecordsFields()
BEGIN
    -- 1. 删除外键
    IF EXISTS (SELECT * FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_records' AND CONSTRAINT_NAME = 'fk_chat_records_tool_approval') THEN
        ALTER TABLE chat_records DROP FOREIGN KEY fk_chat_records_tool_approval;
    END IF;

    -- 2. 删除索引
    IF EXISTS (SELECT * FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_records' AND INDEX_NAME = 'idx_checkpoint') THEN
        ALTER TABLE chat_records DROP INDEX idx_checkpoint;
    END IF;
    IF EXISTS (SELECT * FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_records' AND INDEX_NAME = 'idx_loop') THEN
        ALTER TABLE chat_records DROP INDEX idx_loop;
    END IF;

    -- 3. 删除列
    IF EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_records' AND COLUMN_NAME = 'checkpoint_id') THEN
        ALTER TABLE chat_records DROP COLUMN checkpoint_id;
    END IF;
    IF EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_records' AND COLUMN_NAME = 'loop_id') THEN
        ALTER TABLE chat_records DROP COLUMN loop_id;
    END IF;
    IF EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_records' AND COLUMN_NAME = 'tool_approval_id') THEN
        ALTER TABLE chat_records DROP COLUMN tool_approval_id;
    END IF;
END //
DELIMITER ;
CALL DropChatRecordsFields();
DROP PROCEDURE IF EXISTS DropChatRecordsFields;

DROP TABLE IF EXISTS user_approval_settings;
DROP TABLE IF EXISTS tool_approvals;
DROP TABLE IF EXISTS chat_checkpoints;

-- 1. 创建 chat_checkpoints 表（检查点表）
CREATE TABLE chat_checkpoints (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    checkpoint_id VARCHAR(64) NOT NULL UNIQUE COMMENT '检查点唯一标识（UUID）',
    session_id VARCHAR(100) NOT NULL COMMENT '会话ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    checkpoint_type ENUM('USER_MESSAGE', 'TOOL_EDIT', 'MANUAL') NOT NULL COMMENT '检查点类型',
    message_order INT NOT NULL COMMENT '消息顺序（关联到 chat_records 的 message_order）',
    
    -- 文件快照（JSON 格式）
    -- 结构: {"path": {"fileContent": "...", "diffAreas": [...]}}
    file_snapshots JSON COMMENT '文件快照映射',
    
    -- 用户修改快照（区分 AI 修改和用户修改）
    user_modifications JSON COMMENT '用户修改快照',
    
    -- 元数据
    description VARCHAR(500) COMMENT '检查点描述',
    
    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    
    -- 索引
    INDEX idx_session_user (session_id, user_id),
    INDEX idx_message_order (session_id, message_order),
    INDEX idx_checkpoint_type (checkpoint_type),
    INDEX idx_created_at (created_at),
    
    -- 外键
    CONSTRAINT fk_checkpoints_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='AI 终端检查点表 - 支持时间旅行功能';

-- 2. 创建 tool_approvals 表（工具批准记录表）
CREATE TABLE tool_approvals (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    session_id VARCHAR(100) NOT NULL COMMENT '会话ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    
    -- 工具信息
    tool_name VARCHAR(100) NOT NULL COMMENT '工具名称',
    tool_params JSON NOT NULL COMMENT '工具参数（JSON格式）',
    decision_id VARCHAR(64) NOT NULL UNIQUE COMMENT '决策ID（关联 DecisionEnvelope）',
    
    -- 批准状态
    approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING' COMMENT '批准状态',
    
    -- 批准信息
    approval_reason VARCHAR(500) COMMENT '批准/拒绝原因',
    
    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    approved_at DATETIME NULL COMMENT '批准/拒绝时间',
    
    -- 索引
    INDEX idx_session_user (session_id, user_id),
    INDEX idx_decision (decision_id),
    INDEX idx_status (approval_status),
    INDEX idx_tool_name (tool_name),
    INDEX idx_created_at (created_at),
    
    -- 外键
    CONSTRAINT fk_approvals_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='工具批准记录表 - 支持工具调用批准机制';

-- 3. 创建 user_approval_settings 表（用户批准设置表）
CREATE TABLE user_approval_settings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL UNIQUE COMMENT '用户ID',
    
    -- 自动批准开关（4类工具）
    auto_approve_dangerous_tools BOOLEAN NOT NULL DEFAULT FALSE 
        COMMENT '自动批准危险工具（删除文件、执行命令等）',
    auto_approve_read_file BOOLEAN NOT NULL DEFAULT TRUE 
        COMMENT '自动批准读取文件',
    auto_approve_file_edits BOOLEAN NOT NULL DEFAULT FALSE 
        COMMENT '自动批准文件编辑（edit_file, write_file, rewrite_file）',
    auto_approve_mcp_tools BOOLEAN NOT NULL DEFAULT FALSE 
        COMMENT '自动批准 MCP 工具（第三方工具）',
    
    -- 其他设置
    include_tool_lint_errors BOOLEAN NOT NULL DEFAULT TRUE 
        COMMENT '工具执行后显示 Lint 错误',
    max_checkpoints_per_session INT NOT NULL DEFAULT 50 
        COMMENT '每个会话保留的最大检查点数量',
    
    -- 时间戳
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    -- 外键
    CONSTRAINT fk_settings_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='用户批准设置表 - 个性化工具调用策略';

-- 4. 扩展 chat_records 表（添加新字段）
-- 注意：使用 ALTER TABLE 而不是 CREATE TABLE
ALTER TABLE chat_records
ADD COLUMN checkpoint_id VARCHAR(64) NULL 
    COMMENT '关联的检查点ID（如果此消息后有检查点）' AFTER reasoning_content,
ADD COLUMN loop_id VARCHAR(64) NULL 
    COMMENT 'Agent 循环ID（用于中断）' AFTER checkpoint_id,
ADD COLUMN tool_approval_id BIGINT NULL 
    COMMENT '关联的工具批准记录ID' AFTER loop_id;

-- 为新字段添加索引
ALTER TABLE chat_records
ADD INDEX idx_checkpoint (checkpoint_id),
ADD INDEX idx_loop (loop_id);

-- 添加外键约束（如果 tool_approvals 表已存在）
ALTER TABLE chat_records
ADD CONSTRAINT fk_chat_records_tool_approval 
    FOREIGN KEY (tool_approval_id) REFERENCES tool_approvals(id) ON DELETE SET NULL;

-- =============================================
-- 初始化数据
-- =============================================

-- 为所有现有用户创建默认批准设置
INSERT INTO user_approval_settings (user_id, auto_approve_dangerous_tools, auto_approve_read_file, auto_approve_file_edits, auto_approve_mcp_tools)
SELECT id, FALSE, TRUE, FALSE, FALSE
FROM users
WHERE id NOT IN (SELECT user_id FROM user_approval_settings);

-- =============================================
-- 验证数据
-- =============================================

-- 验证表是否创建成功
SELECT 
    TABLE_NAME, 
    TABLE_ROWS, 
    CREATE_TIME 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME IN ('chat_checkpoints', 'tool_approvals', 'user_approval_settings');

-- 验证索引是否创建成功
SELECT 
    TABLE_NAME, 
    INDEX_NAME, 
    COLUMN_NAME 
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME IN ('chat_checkpoints', 'tool_approvals', 'user_approval_settings', 'chat_records')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

SET FOREIGN_KEY_CHECKS = 1;

