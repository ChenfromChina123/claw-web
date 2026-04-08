-- Token 消耗审计表：记录每个 API 提供方/用户的 Token 消耗与响应耗时
CREATE TABLE IF NOT EXISTS token_usage_audit (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    provider VARCHAR(32) NOT NULL COMMENT 'API 提供方：deepseek/doubao/default',
    model_name VARCHAR(64) NULL COMMENT '模型名称',
    user_id BIGINT NULL COMMENT '用户ID，匿名为 NULL',
    session_id VARCHAR(255) NULL COMMENT '会话ID',
    input_tokens INT NULL COMMENT '输入 Token 数',
    output_tokens INT NULL COMMENT '输出 Token 数',
    total_tokens INT NULL COMMENT '总 Token 数',
    response_time_ms BIGINT NULL COMMENT '响应耗时(毫秒)',
    streaming TINYINT(1) NULL COMMENT '是否流式请求',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_audit_user_id (user_id),
    INDEX idx_audit_provider (provider),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Token 消耗审计表';
