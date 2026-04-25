-- 添加 is_empty 字段用于更可靠地检测空会话
-- 这个字段在创建会话时设为 TRUE，在添加第一条用户消息时设为 FALSE

ALTER TABLE sessions ADD COLUMN is_empty BOOLEAN DEFAULT TRUE;

-- 创建索引以加快空会话查询
CREATE INDEX idx_sessions_is_empty ON sessions(is_empty);
CREATE INDEX idx_sessions_user_empty ON sessions(user_id, is_empty);

-- 更新现有空会话的 is_empty 状态
-- 通过 LEFT JOIN 查找没有消息的会话
UPDATE sessions s
SET is_empty = TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM messages m WHERE m.session_id = s.id LIMIT 1
);

-- 有消息的会话设为 FALSE
UPDATE sessions s
SET is_empty = FALSE
WHERE EXISTS (
  SELECT 1 FROM messages m WHERE m.session_id = s.id LIMIT 1
);
