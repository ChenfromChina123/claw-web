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
  content JSON NOT NULL,
  attachments JSON,
  sequence INT DEFAULT 0 COMMENT '消息序号，用于确保消息顺序',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_messages_session_id (session_id),
  INDEX idx_messages_sequence (session_id, sequence)
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
  error TEXT,
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

-- Session Open Files 会话打开文件表 (用于持久化记录用户上次打开的文件，方便二次加载)
CREATE TABLE IF NOT EXISTS session_open_files (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  open_file_paths JSON NOT NULL COMMENT '打开的文件路径列表（按打开顺序）',
  active_file_path VARCHAR(500) DEFAULT NULL COMMENT '当前激活的文件路径',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE KEY uk_session_id (session_id),
  INDEX idx_session_open_files_session_id (session_id)
);

-- ==================== 提示词模板相关表 ====================

-- 提示词模板分类表
CREATE TABLE IF NOT EXISTS prompt_template_categories (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '分类名称',
  icon VARCHAR(50) DEFAULT 'folder' COMMENT '分类图标',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prompt_categories_sort (sort_order)
);

-- 提示词模板表
CREATE TABLE IF NOT EXISTS prompt_templates (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) COMMENT '创建者用户ID，NULL表示内置模板',
  category_id VARCHAR(36) COMMENT '所属分类ID',
  title VARCHAR(255) NOT NULL COMMENT '模板标题',
  content TEXT NOT NULL COMMENT '模板内容',
  description TEXT COMMENT '模板描述',
  is_builtin BOOLEAN DEFAULT FALSE COMMENT '是否内置模板',
  is_favorite BOOLEAN DEFAULT FALSE COMMENT '是否收藏',
  use_count INT DEFAULT 0 COMMENT '使用次数',
  tags JSON COMMENT '标签列表',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES prompt_template_categories(id) ON DELETE SET NULL,
  INDEX idx_prompt_templates_user (user_id),
  INDEX idx_prompt_templates_category (category_id),
  INDEX idx_prompt_templates_favorite (is_favorite)
);

-- 分享会话表 (用于存储分享的对话链接)
CREATE TABLE IF NOT EXISTS shared_sessions (
  id VARCHAR(36) PRIMARY KEY,
  share_code VARCHAR(32) NOT NULL UNIQUE COMMENT '分享码，用于生成链接',
  session_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) DEFAULT '分享对话' COMMENT '分享标题',
  expires_at TIMESTAMP NULL COMMENT '过期时间，NULL表示永不过期',
  view_count INT DEFAULT 0 COMMENT '浏览次数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_shared_sessions_share_code (share_code),
  INDEX idx_shared_sessions_session_id (session_id),
  INDEX idx_shared_sessions_user_id (user_id)
);

-- 聊天图片表
CREATE TABLE IF NOT EXISTS chat_images (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(36),
  message_id VARCHAR(36),
  filename VARCHAR(255) NOT NULL COMMENT '存储文件名（UUID.ext）',
  original_name VARCHAR(255) COMMENT '原始文件名',
  mime_type VARCHAR(100) NOT NULL COMMENT 'MIME 类型',
  size INT NOT NULL COMMENT '文件大小（字节）',
  width INT COMMENT '图片宽度',
  height INT COMMENT '图片高度',
  storage_path VARCHAR(500) NOT NULL COMMENT '磁盘存储路径',
  llm_ready_path VARCHAR(500) COMMENT 'LLM 就绪的压缩版本路径',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_images_user_id (user_id),
  INDEX idx_chat_images_session_id (session_id),
  INDEX idx_chat_images_message_id (message_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
