-- 修复 resources 表中的 user_id 字段异常
-- 1. 将所有 NULL 的 user_id 更新为默认管理员 ID (21)
UPDATE resources SET user_id = 21 WHERE user_id IS NULL;

-- 2. 修改 user_id 字段为 BIGINT 并设置为 NOT NULL，以匹配 Resource 实体定义
ALTER TABLE resources MODIFY COLUMN user_id BIGINT NOT NULL;
