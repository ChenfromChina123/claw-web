-- 增强型工作快照表结构升级
-- 支持增量备份、文件内容存储、完整恢复功能

-- 检查并添加新列
ALTER TABLE work_snapshots
  -- 基础快照ID（用于增量备份链）
  ADD COLUMN IF NOT EXISTS base_snapshot_id VARCHAR(36) NULL COMMENT '基础快照ID，用于增量备份',

  -- 存储信息
  ADD COLUMN IF NOT EXISTS storage_type ENUM('local', 's3') DEFAULT 'local' COMMENT '存储类型：本地或S3',
  ADD COLUMN IF NOT EXISTS storage_path VARCHAR(512) NULL COMMENT '存储路径（本地路径或S3 Key）',

  -- 文件统计
  ADD COLUMN IF NOT EXISTS file_count INT DEFAULT 0 COMMENT '文件数量',
  ADD COLUMN IF NOT EXISTS compression_ratio DECIMAL(5,4) DEFAULT 0 COMMENT '压缩比率（0-1）',

  -- 校验和
  ADD COLUMN IF NOT EXISTS checksum VARCHAR(32) NULL COMMENT 'MD5校验和',

  -- 恢复时间
  ADD COLUMN IF NOT EXISTS restored_at TIMESTAMP NULL COMMENT '最后恢复时间';

-- 添加外键约束（如果基础快照被删除，不影响当前快照）
ALTER TABLE work_snapshots
  ADD CONSTRAINT fk_base_snapshot
    FOREIGN KEY (base_snapshot_id) REFERENCES work_snapshots(id)
    ON DELETE SET NULL;

-- 添加索引优化查询
CREATE INDEX IF NOT EXISTS idx_base_snapshot ON work_snapshots(base_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_storage_type ON work_snapshots(storage_type);
CREATE INDEX IF NOT EXISTS idx_checksum ON work_snapshots(checksum);

-- 创建快照依赖关系视图（用于追踪增量备份链）
CREATE OR REPLACE VIEW snapshot_dependency_chain AS
WITH RECURSIVE snapshot_chain AS (
  -- 基础快照（没有依赖的）
  SELECT
    id,
    session_id,
    base_snapshot_id,
    id as root_snapshot_id,
    0 as chain_level,
    CAST(id AS CHAR(36)) as chain_path
  FROM work_snapshots
  WHERE base_snapshot_id IS NULL

  UNION ALL

  -- 依赖快照
  SELECT
    ws.id,
    ws.session_id,
    ws.base_snapshot_id,
    sc.root_snapshot_id,
    sc.chain_level + 1,
    CONCAT(sc.chain_path, ' -> ', ws.id)
  FROM work_snapshots ws
  INNER JOIN snapshot_chain sc ON ws.base_snapshot_id = sc.id
)
SELECT * FROM snapshot_chain;

-- 创建快照统计视图
CREATE OR REPLACE VIEW snapshot_statistics AS
SELECT
  user_id,
  session_id,
  snapshot_type,
  COUNT(*) as snapshot_count,
  SUM(size_bytes) as total_size_bytes,
  AVG(compression_ratio) as avg_compression_ratio,
  MIN(created_at) as oldest_snapshot,
  MAX(created_at) as newest_snapshot
FROM work_snapshots
GROUP BY user_id, session_id, snapshot_type;

-- 更新说明
COMMENT ON TABLE work_snapshots IS '增强型用户工作快照表，支持增量备份和完整恢复';
