-- 修改外部链接表的点击次数字段类型为INT（与Java实体保持一致）
ALTER TABLE external_links 
MODIFY COLUMN click_count INT NOT NULL DEFAULT 0 COMMENT '点击次数';
