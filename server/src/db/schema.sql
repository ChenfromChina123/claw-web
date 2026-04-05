-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(120) UNIQUE,
  password_hash VARCHAR(255),
  github_id VARCHAR(50) UNIQUE,
  avatar VARCHAR(255) DEFAULT '/avatars/default.png',
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_email (email),
  INDEX idx_username (username),
  INDEX idx_github_id (github_id)
);

-- 验证码表
CREATE TABLE IF NOT EXISTS verification_codes (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(120) NOT NULL,
  code VARCHAR(6) NOT NULL,
  usage_type VARCHAR(20) NOT NULL COMMENT 'register, login, reset_password',
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_code (code)
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) DEFAULT '新对话',
  model VARCHAR(50) DEFAULT 'qwen-plus',
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user_id (user_id),
  INDEX idx_sessions_is_pinned (is_pinned)
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_messages_session_id (session_id)
);

-- 工具调用表
CREATE TABLE IF NOT EXISTS tool_calls (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  tool_input JSON,
  tool_output JSON,
  status ENUM('pending', 'executing', 'completed', 'error') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_tool_calls_session_id (session_id),
  INDEX idx_tool_calls_message_id (message_id)
);

-- ==================== Agent 持久化相关表 ====================

-- Agent 实例状态表 (用于服务器重启后恢复 Agent 运行时状态)
CREATE TABLE IF NOT EXISTS agent_instances (
  id VARCHAR(36) PRIMARY KEY,
  agent_type VARCHAR(100) NOT NULL,
  status ENUM('created', 'running', 'waiting', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'created',
  parent_agent_id VARCHAR(36),
  team_name VARCHAR(100),
  member_name VARCHAR(100),
  result TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent_instances_status (status),
  INDEX idx_agent_instances_team (team_name),
  INDEX idx_agent_instances_parent (parent_agent_id)
);

-- Agent 消息历史表 (用于服务器重启后恢复 Agent 对话历史)
CREATE TABLE IF NOT EXISTS agent_messages (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  from_agent_id VARCHAR(36),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agent_instances(id) ON DELETE CASCADE,
  INDEX idx_agent_messages_agent_id (agent_id),
  INDEX idx_agent_messages_timestamp (timestamp)
);

-- Agent Mailbox 消息表 (用于服务器重启后恢复 Agent 间传递的消息)
CREATE TABLE IF NOT EXISTS agent_mailbox_messages (
  id VARCHAR(36) PRIMARY KEY,
  from_agent_id VARCHAR(36) NOT NULL,
  to_agent_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  thread_id VARCHAR(36),
  is_read BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent_mailbox_to_agent (to_agent_id),
  INDEX idx_agent_mailbox_from_agent (from_agent_id),
  INDEX idx_agent_mailbox_thread (thread_id)
);

-- Team 团队状态表 (用于服务器重启后恢复团队状态)
CREATE TABLE IF NOT EXISTS agent_teams (
  id VARCHAR(36) PRIMARY KEY,
  team_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  orchestrator_type VARCHAR(100),
  orchestrator_agent_id VARCHAR(36),
  overall_status ENUM('created', 'initializing', 'ready', 'executing', 'completed', 'failed') DEFAULT 'created',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agent_teams_name (team_name)
);

-- Team Members 团队成员表
CREATE TABLE IF NOT EXISTS agent_team_members (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  member_name VARCHAR(100) NOT NULL,
  agent_type VARCHAR(100) NOT NULL,
  agent_id VARCHAR(36),
  role ENUM('orchestrator', 'worker', 'reviewer', 'specialist') NOT NULL,
  status ENUM('idle', 'assigned', 'working', 'completed', 'blocked', 'failed') DEFAULT 'idle',
  current_task TEXT,
  skills JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
  UNIQUE KEY uk_team_member (team_id, member_name),
  INDEX idx_agent_team_members_team (team_id),
  INDEX idx_agent_team_members_status (status)
);

-- Team Tasks 团队任务表
CREATE TABLE IF NOT EXISTS agent_team_tasks (
  id VARCHAR(36) PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to VARCHAR(36),
  status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending',
  priority INT DEFAULT 5,
  result TEXT,
  error TEXT,
  depends_on JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (team_id) REFERENCES agent_teams(id) ON DELETE CASCADE,
  INDEX idx_agent_team_tasks_team (team_id),
  INDEX idx_agent_team_tasks_status (status)
);

-- Isolation Contexts 隔离上下文表 (用于服务器重启后恢复隔离上下文状态)
CREATE TABLE IF NOT EXISTS agent_isolation_contexts (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  mode ENUM('worktree', 'remote') NOT NULL,
  description TEXT,
  working_directory VARCHAR(500),
  environment JSON,
  max_memory INT,
  max_cpu INT,
  timeout INT,
  cleanup_policy ENUM('immediate', 'delayed', 'manual') DEFAULT 'delayed',
  worktree_config JSON,
  remote_config JSON,
  status ENUM('initializing', 'ready', 'running', 'paused', 'terminated', 'error') DEFAULT 'initializing',
  execution_count INT DEFAULT 0,
  total_duration BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_agent_isolation_status (status),
  INDEX idx_agent_isolation_mode (mode)
);
