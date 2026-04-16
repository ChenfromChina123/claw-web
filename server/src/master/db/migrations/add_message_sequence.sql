-- 添加消息序号字段，用于确保消息顺序
ALTER TABLE messages ADD COLUMN sequence INT DEFAULT 0 COMMENT '消息序号，用于确保消息顺序';

-- 创建索引以优化按序号查询
CREATE INDEX idx_messages_sequence ON messages(session_id, sequence);

-- 更新现有数据，根据 created_at 设置初始序号
SET @session_id = NULL;
SET @seq = 0;
UPDATE messages
SET sequence = (@seq := IF(@session_id = session_id, @seq + 1, 1)),
    @session_id = session_id
ORDER BY session_id, created_at ASC;
