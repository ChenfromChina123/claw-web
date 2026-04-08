-- 创建URL过滤规则表
CREATE TABLE IF NOT EXISTS url_filter_rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL COMMENT '规则名称',
    description VARCHAR(500) COMMENT '规则描述',
    filter_type VARCHAR(20) NOT NULL COMMENT '过滤类型: BLOCK-阻止, ALLOW-允许, REDIRECT-重定向',
    match_type VARCHAR(20) NOT NULL COMMENT '匹配类型: DOMAIN-域名, URL-完整URL, REGEX-正则表达式, KEYWORD-关键词',
    pattern TEXT NOT NULL COMMENT '匹配模式/规则内容',
    redirect_url VARCHAR(500) COMMENT '重定向目标URL',
    priority INT NOT NULL DEFAULT 100 COMMENT '规则优先级',
    enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
    category VARCHAR(50) COMMENT '规则分类',
    created_by BIGINT COMMENT '创建者ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_filter_type (filter_type),
    INDEX idx_match_type (match_type),
    INDEX idx_enabled (enabled),
    INDEX idx_category (category),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='URL过滤规则表';

-- 插入默认过滤规则示例
INSERT INTO url_filter_rules (name, description, filter_type, match_type, pattern, priority, enabled, category) VALUES
('阻止广告域名', '阻止常见广告域名', 'BLOCK', 'DOMAIN', '*.ad.com', 10, TRUE, '广告'),
('阻止恶意网站', '阻止已知恶意网站', 'BLOCK', 'KEYWORD', 'malware', 5, TRUE, '安全'),
('阻止赌博网站', '阻止赌博相关网站', 'BLOCK', 'KEYWORD', 'casino', 20, TRUE, '成人内容'),
('允许教育网站', '允许教育类网站', 'ALLOW', 'DOMAIN', '*.edu.cn', 1, TRUE, '教育'),
('重定向旧域名', '将旧域名重定向到新域名', 'REDIRECT', 'DOMAIN', 'old.example.com', 50, FALSE, '重定向');
