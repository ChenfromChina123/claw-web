-- 审计日志表
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(100) PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_type VARCHAR(50) NOT NULL,
  level ENUM('info', 'warning', 'error', 'critical') NOT NULL DEFAULT 'info',
  
  -- 用户信息
  user_id VARCHAR(36),
  user_name VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- 资源信息
  resource VARCHAR(100),
  resource_id VARCHAR(100),
  
  -- 操作信息
  action VARCHAR(255) NOT NULL,
  details JSON,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  duration INT COMMENT '操作耗时（毫秒）',
  
  -- 索引
  INDEX idx_timestamp (timestamp),
  INDEX idx_user_id (user_id),
  INDEX idx_event_type (event_type),
  INDEX idx_level (level),
  INDEX idx_resource (resource),
  INDEX idx_success (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审计日志表';

-- 告警事件表
CREATE TABLE IF NOT EXISTS alert_events (
  id VARCHAR(100) PRIMARY KEY,
  rule_id VARCHAR(50) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL,
  message TEXT NOT NULL,
  
  -- 指标信息
  metric VARCHAR(100) NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  threshold DECIMAL(10,2) NOT NULL,
  
  -- 时间信息
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 确认信息
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP NULL,
  acknowledged_by VARCHAR(36),
  
  -- 索引
  INDEX idx_timestamp (timestamp),
  INDEX idx_rule_id (rule_id),
  INDEX idx_severity (severity),
  INDEX idx_acknowledged (acknowledged)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警事件表';

-- 安全事件表
CREATE TABLE IF NOT EXISTS security_events (
  id VARCHAR(100) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  
  -- 事件详情
  description TEXT NOT NULL,
  source_ip VARCHAR(45),
  target_user VARCHAR(36),
  target_resource VARCHAR(100),
  
  -- 状态
  status ENUM('new', 'investigating', 'resolved', 'false_positive') DEFAULT 'new',
  
  -- 时间信息
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  resolved_by VARCHAR(36),
  
  -- 备注
  notes TEXT,
  
  -- 索引
  INDEX idx_timestamp (timestamp),
  INDEX idx_event_type (event_type),
  INDEX idx_severity (severity),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安全事件表';

-- 用户权限表
CREATE TABLE IF NOT EXISTS user_permissions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  permission VARCHAR(100) NOT NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by VARCHAR(36),
  
  -- 外键和索引
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX idx_user_permission (user_id, permission),
  INDEX idx_permission (permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户权限表';

-- 资源监控记录表
CREATE TABLE IF NOT EXISTS resource_monitoring (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36),
  project_id VARCHAR(36),
  
  -- 资源使用
  cpu_percent DECIMAL(5,2),
  memory_mb INT,
  disk_mb INT,
  network_in_kb BIGINT,
  network_out_kb BIGINT,
  
  -- 时间
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 索引
  INDEX idx_user_time (user_id, recorded_at),
  INDEX idx_project_time (project_id, recorded_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资源监控记录表';
