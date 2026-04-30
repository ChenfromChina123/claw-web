-- 修复 content 字段大小限制问题
-- 将 TEXT 类型的 content 字段改为 LONGTEXT，以支持存储大文件内容

-- 修改 agent_messages 表的 content 字段
ALTER TABLE agent_messages MODIFY COLUMN content LONGTEXT NOT NULL;

-- 修改 agent_mailbox_messages 表的 content 字段
ALTER TABLE agent_mailbox_messages MODIFY COLUMN content LONGTEXT NOT NULL;

-- 修改 prompt_templates 表的 content 字段
ALTER TABLE prompt_templates MODIFY COLUMN content LONGTEXT NOT NULL;

-- 修改 agent_instances 表的 result 字段
ALTER TABLE agent_instances MODIFY COLUMN result LONGTEXT;

-- 修改 agent_team_tasks 表的 description 和 result 字段
ALTER TABLE agent_team_tasks MODIFY COLUMN description LONGTEXT;
ALTER TABLE agent_team_tasks MODIFY COLUMN result LONGTEXT;

-- 修改 agent_teams 表的 description 字段
ALTER TABLE agent_teams MODIFY COLUMN description LONGTEXT;

-- 修改 agent_isolation_contexts 表的 description 字段
ALTER TABLE agent_isolation_contexts MODIFY COLUMN description LONGTEXT;
