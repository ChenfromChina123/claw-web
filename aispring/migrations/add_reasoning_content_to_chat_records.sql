-- 添加 reasoning_content 列到 chat_records 表
-- 用于保存 AI 深度思考内容

ALTER TABLE chat_records 
ADD COLUMN reasoning_content TEXT NULL COMMENT 'AI 深度思考内容';

-- 为现有数据设置默认值（已存在的记录为 NULL）
-- 新记录将根据是否有 reasoning_content 来设置值

