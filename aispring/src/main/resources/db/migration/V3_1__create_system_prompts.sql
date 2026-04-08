-- 创建系统提示词表
CREATE TABLE IF NOT EXISTS system_prompts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    role VARCHAR(255) NOT NULL UNIQUE COMMENT '角色名称，如 Product Manager',
    content TEXT NOT NULL COMMENT '提示词正文',
    category VARCHAR(50) NULL COMMENT '分类：Role, Task, Domain',
    language VARCHAR(10) NULL COMMENT '语言：zh, en',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_role (role),
    INDEX idx_category (category),
    INDEX idx_language (language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统提示词表';
