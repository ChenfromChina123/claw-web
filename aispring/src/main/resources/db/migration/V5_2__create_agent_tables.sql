-- Agent 模块数据库迁移脚本
-- 创建 Agent 会话表
CREATE TABLE IF NOT EXISTS agent_sessions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    name VARCHAR(255),
    working_directory VARCHAR(500),
    status VARCHAR(50) DEFAULT 'active',
    sandbox_path VARCHAR(500),
    git_initialized BIT DEFAULT 0,
    current_branch VARCHAR(100),
    last_commit_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL,
    INDEX idx_agent_session_user (user_id),
    INDEX idx_agent_session_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建 Agent 任务表
CREATE TABLE IF NOT EXISTS agent_tasks (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    task_type VARCHAR(50),
    input TEXT,
    output LONGTEXT,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    total_steps INT DEFAULT 0,
    current_step INT DEFAULT 0,
    tokens_used BIGINT DEFAULT 0,
    execution_time_ms BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    INDEX idx_agent_task_session (session_id),
    INDEX idx_agent_task_user (user_id),
    INDEX idx_agent_task_status (status),
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建 Agent 文件快照表
CREATE TABLE IF NOT EXISTS agent_file_snapshots (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    task_id BIGINT,
    file_path VARCHAR(500) NOT NULL,
    content_hash VARCHAR(64),
    snapshot_type VARCHAR(50),
    commit_hash VARCHAR(64),
    commit_message VARCHAR(500),
    file_size BIGINT,
    is_directory BIT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_agent_snapshot_session (session_id),
    INDEX idx_agent_snapshot_task (task_id),
    INDEX idx_agent_snapshot_commit (commit_hash),
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建 Agent 工具调用记录表
CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_id BIGINT NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    tool_input TEXT,
    tool_output LONGTEXT,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    duration_ms INT,
    step_number INT,
    thought TEXT,
    observation TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    INDEX idx_agent_toolcall_task (task_id),
    INDEX idx_agent_toolcall_name (tool_name),
    INDEX idx_agent_toolcall_status (status),
    FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
