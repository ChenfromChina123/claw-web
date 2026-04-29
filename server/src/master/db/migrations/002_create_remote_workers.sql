-- 远程 Worker 管理表
-- 用于存储和管理部署在远程服务器上的 Worker 节点

-- 远程 Worker 表
CREATE TABLE IF NOT EXISTS remote_workers (
  id VARCHAR(64) PRIMARY KEY,
  host VARCHAR(255) NOT NULL COMMENT '远程主机地址',
  port INT NOT NULL DEFAULT 4000 COMMENT 'Worker 服务端口',
  ssh_port INT NOT NULL DEFAULT 22 COMMENT 'SSH 端口',
  ssh_username VARCHAR(255) NOT NULL COMMENT 'SSH 用户名',
  -- 密码使用 Base64 编码存储（生产环境建议使用更强的加密方式）
  ssh_password_encrypted TEXT COMMENT 'SSH 密码（加密存储）',
  status ENUM('deploying', 'running', 'error', 'offline', 'removing') DEFAULT 'deploying' COMMENT 'Worker 状态',
  labels JSON DEFAULT NULL COMMENT '标签（如 region, type 等）',
  last_heartbeat TIMESTAMP NULL DEFAULT NULL COMMENT '最后心跳时间',
  health_status ENUM('healthy', 'unhealthy', 'unknown') DEFAULT 'unknown' COMMENT '健康状态',
  docker_version VARCHAR(50) DEFAULT NULL COMMENT 'Docker 版本',
  system_info JSON DEFAULT NULL COMMENT '系统信息（OS, 架构, CPU, 内存, 磁盘）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_status (status),
  INDEX idx_health (health_status),
  INDEX idx_host_port (host, port)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='远程 Worker 表';

-- 远程 Worker 部署日志表
CREATE TABLE IF NOT EXISTS remote_worker_deploy_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  worker_id VARCHAR(64) NOT NULL COMMENT 'Worker ID',
  step VARCHAR(100) NOT NULL COMMENT '部署步骤',
  status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending' COMMENT '步骤状态',
  message TEXT COMMENT '日志消息',
  details JSON DEFAULT NULL COMMENT '详细信息',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (worker_id) REFERENCES remote_workers(id) ON DELETE CASCADE,
  INDEX idx_worker_id (worker_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='远程 Worker 部署日志表';
