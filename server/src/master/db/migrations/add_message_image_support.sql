-- 多模态消息支持迁移
-- 将 messages.content 从 TEXT 改为 JSON，支持多模态内容数组
-- 添加 chat_images 表存储图片元信息

-- 1. 修改 messages.content 列类型为 JSON
ALTER TABLE messages MODIFY COLUMN content JSON NOT NULL;

-- 2. 为 messages 表添加 attachments 列（存储图片附件元数据）
ALTER TABLE messages ADD COLUMN attachments JSON;

-- 3. 创建聊天图片表
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
  llm_ready_path VARCHAR(500) COMMENT 'LLM 就绪的压缩版本路径（用于缓存一致性）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_images_user_id (user_id),
  INDEX idx_chat_images_session_id (session_id),
  INDEX idx_chat_images_message_id (message_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
