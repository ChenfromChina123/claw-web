-- 项目部署表
CREATE TABLE IF NOT EXISTS project_deployments (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type ENUM('nodejs', 'python', 'static', 'custom') NOT NULL DEFAULT 'nodejs',
  status ENUM('running', 'stopped', 'error', 'building') DEFAULT 'stopped',
  
  -- 容器信息
  worker_container_id VARCHAR(64) NOT NULL COMMENT 'Worker 容器ID',
  worker_port INT NOT NULL COMMENT 'Worker 容器的主端口',
  internal_port INT NOT NULL COMMENT '项目在容器内的端口',
  
  -- 项目配置
  domain VARCHAR(255) COMMENT '自定义域名',
  source_path VARCHAR(512) NOT NULL COMMENT '项目代码路径',
  source_type ENUM('upload', 'git', 'template') DEFAULT 'upload',
  source_url VARCHAR(512) COMMENT 'Git 仓库 URL',
  build_command TEXT COMMENT '构建命令',
  start_command TEXT NOT NULL COMMENT '启动命令',
  env_vars JSON COMMENT '环境变量',
  
  -- 进程管理
  process_manager ENUM('pm2', 'supervisor') DEFAULT 'pm2',
  memory_limit VARCHAR(20) DEFAULT '256M',
  auto_restart BOOLEAN DEFAULT TRUE,
  
  -- 统计信息
  restart_count INT DEFAULT 0,
  last_restart_at TIMESTAMP NULL,
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 外键和索引
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_worker_container_id (worker_container_id),
  INDEX idx_internal_port (internal_port),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目部署表';

-- 项目部署日志表
CREATE TABLE IF NOT EXISTS project_deployment_logs (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  type ENUM('stdout', 'stderr', 'system') NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目部署日志表';

-- 项目部署事件表
CREATE TABLE IF NOT EXISTS project_deployment_events (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  event_type ENUM('created', 'started', 'stopped', 'restarted', 'deleted', 'error') NOT NULL,
  event_data JSON COMMENT '事件详情',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_event_type (event_type),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目部署事件表';

-- 用户资源配额表
CREATE TABLE IF NOT EXISTS user_quotas (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  max_projects INT DEFAULT 10 COMMENT '最大项目数量',
  max_memory_mb INT DEFAULT 2048 COMMENT '最大内存使用（MB）',
  max_cpu_cores DECIMAL(3,1) DEFAULT 2.0 COMMENT '最大 CPU 核心数',
  max_storage_mb INT DEFAULT 10240 COMMENT '最大存储空间（MB）',
  max_bandwidth_kbps INT DEFAULT 10240 COMMENT '最大带宽（KB/s）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户资源配额表';

-- 资源使用记录表
CREATE TABLE IF NOT EXISTS resource_usage (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  project_id VARCHAR(36),
  cpu_percent DECIMAL(5,2) COMMENT 'CPU 使用率',
  memory_mb INT COMMENT '内存使用（MB）',
  network_in_kb BIGINT COMMENT '网络入流量（KB）',
  network_out_kb BIGINT COMMENT '网络出流量（KB）',
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE,
  INDEX idx_user_time (user_id, recorded_at),
  INDEX idx_project_time (project_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资源使用记录表';
