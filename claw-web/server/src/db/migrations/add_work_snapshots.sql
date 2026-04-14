-- 用户工作快照表
-- 用于持久化保存用户工作区状态，支持容器回收与恢复

CREATE TABLE IF NOT EXISTS work_snapshots (
  id VARCHAR(36) PRIMARY KEY COMMENT '快照唯一ID',
  user_id VARCHAR(36) NOT NULL COMMENT '用户ID',
  session_id VARCHAR(36) NOT NULL COMMENT '会话ID',
  container_id VARCHAR(64) COMMENT '容器ID',
  snapshot_type ENUM('realtime', 'checkpoint', 'final') NOT NULL DEFAULT 'final' COMMENT '快照类型',

  -- 工作区路径信息
  workspace_path VARCHAR(512) COMMENT '工作区根路径',
  workspace_size_bytes BIGINT DEFAULT 0 COMMENT '工作区大小（字节）',

  -- 文件状态（JSON格式存储文件列表和校验和）
  file_manifest JSON COMMENT '文件清单，包含路径、校验和、修改时间',

  -- 进程状态
  process_state JSON COMMENT '运行中的进程状态',

  -- Git状态
  git_state JSON COMMENT 'Git状态，包含分支、未提交文件等',

  -- 执行状态
  execution_state JSON COMMENT 'Agent执行状态，包含当前任务、历史记录等',

  -- 快照元数据
  compression_type ENUM('none', 'gzip', 'lz4') DEFAULT 'gzip' COMMENT '压缩类型',
  compressed_size_bytes BIGINT COMMENT '压缩后大小',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  expires_at TIMESTAMP COMMENT '过期时间',
  restored_at TIMESTAMP COMMENT '最后恢复时间',

  -- 索引
  INDEX idx_user_session (user_id, session_id),
  INDEX idx_container (container_id),
  INDEX idx_type (snapshot_type),
  INDEX idx_expires (expires_at),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='用户工作快照表，用于容器回收与恢复';
