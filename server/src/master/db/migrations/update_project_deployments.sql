-- 更新项目部署表，添加外部访问相关字段

-- 添加外部访问相关字段
ALTER TABLE project_deployments
ADD COLUMN IF NOT EXISTS domain_id VARCHAR(36) NULL COMMENT '关联域名ID',
ADD COLUMN IF NOT EXISTS external_access_enabled BOOLEAN DEFAULT FALSE COMMENT '外部访问是否启用',
ADD COLUMN IF NOT EXISTS external_access_type ENUM('subdomain', 'custom', 'tunnel') DEFAULT NULL,
ADD INDEX IF NOT EXISTS idx_domain_id (domain_id);

-- 创建项目端口分配表（避免端口冲突）
CREATE TABLE IF NOT EXISTS project_ports (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  container_id VARCHAR(64) NOT NULL,
  internal_port INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX idx_container_port (container_id, internal_port),
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目端口分配表';
