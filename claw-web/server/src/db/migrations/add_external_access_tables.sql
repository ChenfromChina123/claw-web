-- 域名管理表
CREATE TABLE IF NOT EXISTS domains (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  domain VARCHAR(255) NOT NULL UNIQUE,
  type ENUM('custom', 'subdomain') NOT NULL DEFAULT 'subdomain',
  status ENUM('pending', 'verified', 'active', 'error') DEFAULT 'pending',
  
  -- SSL 配置
  ssl_enabled BOOLEAN DEFAULT FALSE,
  ssl_cert_path VARCHAR(512),
  ssl_key_path VARCHAR(512),
  ssl_expires_at TIMESTAMP NULL,
  
  -- 验证信息
  verification_token VARCHAR(64),
  verification_method ENUM('dns', 'http') DEFAULT 'dns',
  verified_at TIMESTAMP NULL,
  
  -- DNS 配置
  dns_provider VARCHAR(50),
  dns_records JSON,
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 外键和索引
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX idx_domain (domain),
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='域名管理表';

-- 内网穿透隧道表
CREATE TABLE IF NOT EXISTS tunnels (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  tunnel_type ENUM('cloudflare', 'cpolar', 'frp', 'ngrok') NOT NULL,
  
  -- 隧道配置
  local_port INT NOT NULL,
  public_url VARCHAR(512),
  subdomain VARCHAR(255),
  custom_domain VARCHAR(255),
  
  -- 状态信息
  status ENUM('active', 'inactive', 'error') DEFAULT 'inactive',
  process_id INT,
  
  -- 认证信息
  auth_token TEXT,
  auth_config JSON,
  
  -- 统计信息
  bandwidth_in BIGINT DEFAULT 0 COMMENT '入流量（字节）',
  bandwidth_out BIGINT DEFAULT 0 COMMENT '出流量（字节）',
  total_requests BIGINT DEFAULT 0 COMMENT '总请求数',
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  
  -- 外键和索引
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_tunnel_type (tunnel_type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内网穿透隧道表';

-- SSL 证书表
CREATE TABLE IF NOT EXISTS ssl_certificates (
  id VARCHAR(36) PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  
  -- 证书信息
  issuer VARCHAR(255) DEFAULT "Let's Encrypt",
  cert_path VARCHAR(512) NOT NULL,
  key_path VARCHAR(512) NOT NULL,
  chain_path VARCHAR(512),
  
  -- 有效期
  valid_from TIMESTAMP NOT NULL,
  valid_to TIMESTAMP NOT NULL,
  days_remaining INT,
  
  -- 状态
  status ENUM('valid', 'expired', 'expiring_soon', 'error') DEFAULT 'valid',
  auto_renew BOOLEAN DEFAULT TRUE,
  
  -- 续期信息
  last_renewed_at TIMESTAMP NULL,
  next_renewal_at TIMESTAMP NULL,
  renewal_count INT DEFAULT 0,
  
  -- DNS 提供商（用于通配符证书）
  dns_provider VARCHAR(50),
  dns_config JSON,
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 外键和索引
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX idx_domain (domain),
  INDEX idx_status (status),
  INDEX idx_valid_to (valid_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='SSL 证书表';

-- 反向代理配置表
CREATE TABLE IF NOT EXISTS proxy_configs (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  domain_id VARCHAR(36),
  
  -- 代理配置
  upstream_host VARCHAR(255) NOT NULL DEFAULT 'localhost',
  upstream_port INT NOT NULL,
  
  -- Nginx 配置
  config_path VARCHAR(512) NOT NULL,
  config_content TEXT,
  
  -- 访问控制
  allowed_ips JSON,
  denied_ips JSON,
  rate_limit INT,
  
  -- 状态
  status ENUM('active', 'inactive', 'error') DEFAULT 'active',
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 外键和索引
  FOREIGN KEY (project_id) REFERENCES project_deployments(id) ON DELETE CASCADE,
  FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL,
  INDEX idx_project_id (project_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反向代理配置表';

-- 外部访问日志表
CREATE TABLE IF NOT EXISTS external_access_logs (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36),
  domain VARCHAR(255),
  
  -- 请求信息
  method VARCHAR(10),
  path VARCHAR(2048),
  status_code INT,
  response_time INT COMMENT '响应时间（毫秒）',
  
  -- 客户端信息
  client_ip VARCHAR(45),
  user_agent VARCHAR(512),
  
  -- 流量统计
  bytes_sent BIGINT,
  bytes_received BIGINT,
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 索引
  INDEX idx_project_id (project_id),
  INDEX idx_domain (domain),
  INDEX idx_created_at (created_at),
  INDEX idx_status_code (status_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='外部访问日志表';
