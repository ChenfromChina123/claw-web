-- User-Worker Mapping Table
-- Stores persistent mapping between users and Worker containers
-- Solves the issue of duplicate container creation after Master restart

CREATE TABLE IF NOT EXISTS user_worker_mappings (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  container_id VARCHAR(64) NOT NULL,
  container_name VARCHAR(128) NOT NULL,
  host_port INT NOT NULL,
  assigned_at TIMESTAMP NOT NULL,
  last_activity_at TIMESTAMP NOT NULL,
  session_count INT DEFAULT 0,
  status ENUM('active', 'released', 'error') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_worker_user_id (user_id),
  INDEX idx_user_worker_container_id (container_id),
  INDEX idx_user_worker_status (status),
  INDEX idx_user_worker_host_port (host_port)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
