-- 为外部链接表添加分类字段
ALTER TABLE external_links ADD COLUMN category VARCHAR(50) DEFAULT '其他' COMMENT '链接分类（如：开发工具、学习资源、AI平台等）';

-- 更新现有数据的分类
UPDATE external_links SET category = '开发工具' WHERE title LIKE '%GitHub%' OR title LIKE '%Stack Overflow%';
UPDATE external_links SET category = '学习资源' WHERE title LIKE '%MDN%' OR title LIKE '%LeetCode%' OR title LIKE '%菜鸟教程%';
UPDATE external_links SET category = 'AI平台' WHERE title LIKE '%AI%' OR title LIKE '%DeepSeek%' OR title LIKE '%Hugging Face%';
UPDATE external_links SET category = '前端框架' WHERE title LIKE '%Vue%' OR title LIKE '%React%' OR title LIKE '%Angular%';

-- 为分类字段添加索引以提高查询性能
CREATE INDEX idx_category ON external_links(category);
