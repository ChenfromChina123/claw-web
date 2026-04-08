-- 创建外部链接表
CREATE TABLE IF NOT EXISTS external_links (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL COMMENT '标题',
    url VARCHAR(500) NOT NULL COMMENT '链接地址',
    description TEXT COMMENT '详细描述',
    image_url VARCHAR(500) COMMENT '图片展示URL',
    click_count BIGINT NOT NULL DEFAULT 0 COMMENT '点击次数',
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否激活',
    sort_order INT COMMENT '排序顺序',
    created_at DATETIME NOT NULL COMMENT '创建时间',
    updated_at DATETIME COMMENT '更新时间',
    INDEX idx_click_count (click_count),
    INDEX idx_is_active (is_active),
    INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='外部链接表';
