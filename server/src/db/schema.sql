-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(120) UNIQUE,
  password_hash VARCHAR(255),
  avatar VARCHAR(255) DEFAULT '/avatars/default.png',
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_email (email),
  INDEX idx_username (username)
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user_id (user_id)
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
