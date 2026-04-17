# Worker 分配持久化修复说明

## 问题描述

在修复之前，系统存在严重的 Worker 容器重复创建问题：

- **症状**：一个用户刷新前端会创建多个 Worker 容器
- **影响**：资源浪费、容器管理混乱、性能下降
- **根本原因**：用户 - 容器映射仅存储在内存中，Master 重启后数据丢失

### 问题日志示例

```
[ContainerOrchestrator] 端口 3104 已在端口池中，跳过
[ContainerOrchestrator] 端口 3105 已在端口池中，跳过
[ContainerOrchestrator] 端口 3106 已在端口池中，跳过
```

一个用户有 11 个 Worker 容器（端口 3100-3110）！

## 解决方案

### 方案 1：数据库持久化（已实施）✅

通过数据库持久化用户 - 容器映射关系，解决 Master 重启后数据丢失的问题。

#### 核心修改

1. **数据库表结构**
   - 表名：`user_worker_mappings`
   - 字段：user_id, container_id, container_name, host_port, status, etc.
   - 索引：user_id (UNIQUE), container_id, status

2. **ContainerOrchestrator 修改**
   ```typescript
   // 新增方法
   - loadUserMappingsFromDB()       // 从数据库加载映射
   - saveUserMappingToDB()          // 保存映射到数据库
   - updateUserMappingStatusInDB()  // 更新映射状态
   - getOrLoadUserMapping()         // 从内存或数据库获取映射
   
   // 修改方法
   - assignContainerToUser()        // 成功后写入数据库
   - releaseUserContainer()         // 释放时更新数据库状态
   - initialize()                   // 初始化时从数据库加载
   ```

3. **wsPTYBridge 修改**
   ```typescript
   // getUserWorkerInfo 使用新的 getOrLoadUserMapping
   async function getUserWorkerInfo(userId: string) {
     const orchestrator = getContainerOrchestrator()
     let mapping = await orchestrator.getOrLoadUserMapping(userId)
     // ...
   }
   ```

#### 工作流程

**首次分配：**
```
用户请求 → getUserWorkerInfo → getOrLoadUserMapping
  → 内存未找到 → 数据库未找到 → assignContainerToUser
  → 创建容器 → 保存到内存 → 保存到数据库
```

**Master 重启后：**
```
用户请求 → getUserWorkerInfo → getOrLoadUserMapping
  → 内存未找到 → 查询数据库 → 找到映射
  → 验证容器状态 → 恢复到内存 → 返回映射
```

**并发请求：**
```
用户请求 A → getOrLoadUserMapping → 数据库找到 → 返回已有容器 ✅
用户请求 B → getOrLoadUserMapping → 数据库找到 → 返回已有容器 ✅
```

#### 数据表结构

```sql
CREATE TABLE user_worker_mappings (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,      -- 用户 ID（唯一）
  container_id VARCHAR(64) NOT NULL,         -- 容器 ID
  container_name VARCHAR(128) NOT NULL,      -- 容器名称
  host_port INT NOT NULL,                     -- 宿主机端口
  assigned_at TIMESTAMP NOT NULL,             -- 分配时间
  last_activity_at TIMESTAMP NOT NULL,        -- 最后活动时间
  session_count INT DEFAULT 0,                -- 会话统计
  status ENUM('active', 'released', 'error') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_worker_user_id (user_id),
  INDEX idx_user_worker_container_id (container_id),
  INDEX idx_user_worker_status (status)
);
```

#### 数据库迁移

```bash
# 执行迁移脚本
mysql -h 127.0.0.1 -P 23306 -u clawuser -pclawpass2024 claw_web \
  < server/src/master/db/migrations/001_create_user_worker_mappings.sql
```

## 修复效果

### Before（修复前）

```
用户 f19a6264-cde6-4e2b:
  - claude-user-f19a6264-cde6-4e2b-2p7b96 (端口 3100) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7163 (端口 3105) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7pv3 (端口 3104) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7rd2 (端口 3102) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7reh (端口 3101) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7ww4 (端口 3103) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7x2m (端口 3107) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7yvh (端口 3108) ❌
  - claude-user-f19a6264-cde6-4e2b-2p7z12 (端口 3109) ❌
  - claude-user-f19a6264-cde6-4e2b-2p87r4 (端口 3110) ❌
  - claude-worker-warm-mo2p8ca5 (端口 3111) ❌
  总计：11 个容器！
```

### After（修复后）

```
用户 f19a6264-cde6-4e2b:
  - claude-user-f19a6264-cde6-4e2b-xxxx (端口 3100) ✅
  总计：1 个容器！
```

## 测试验证

### 测试场景 1：Master 重启

```bash
# 1. 用户分配容器
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <token>" \
  -d '{"userId": "test-user"}'

# 2. 查看数据库
mysql> SELECT * FROM user_worker_mappings WHERE user_id = 'test-user';
+----+----------+--------------+----------------+-----------+
| id | user_id  | container_id | container_name | host_port |
+----+----------+--------------+----------------+-----------+
| 1  | test-user| abc123...    | claude-user-.. | 3000      |
+----+----------+--------------+----------------+-----------+

# 3. 重启 Master
docker restart claw-web-master

# 4. 再次请求（应该复用已有容器）
curl -X POST http://localhost:3000/api/sessions \
  -H "Authorization: Bearer <token>" \
  -d '{"userId": "test-user"}'

# 5. 检查数据库（应该只有一条记录）
mysql> SELECT COUNT(*) FROM user_worker_mappings WHERE user_id = 'test-user';
+----------+
| COUNT(*) |
+----------+
|        1 |
+----------+
```

### 测试场景 2：并发请求

```bash
# 同时发送 10 个请求
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/sessions \
    -H "Authorization: Bearer <token>" \
    -d '{"userId": "test-user"}' &
done
wait

# 检查结果
mysql> SELECT COUNT(*) FROM user_worker_mappings WHERE user_id = 'test-user';
+----------+
| COUNT(*) |
+----------+
|        1 |
+----------+

# Docker 检查
docker ps --filter "name=test-user" --format "{{.Names}}"
# 应该只有一个容器
```

### 测试场景 3：容器释放

```bash
# 1. 分配容器
POST /api/sessions -> 容器 A

# 2. 释放容器
DELETE /api/sessions/:id

# 3. 检查数据库状态
mysql> SELECT status FROM user_worker_mappings WHERE user_id = 'test-user';
+---------+
| status  |
+---------+
| released|
+---------+

# 4. 再次分配（应该创建新容器）
POST /api/sessions -> 容器 B
```

## 清理重复容器

使用提供的清理脚本：

```powershell
# Windows
.\cleanup-duplicate-workers.ps1

# 输出示例
=====================================
  Cleanup Duplicate Worker Containers
=====================================

Found 15 user containers

User f19a6264-cde6-4e2b has 11 containers, cleaning up...
  Keep: claude-user-f19a6264-cde6-4e2b-2p7b96
  Delete: claude-user-f19a6264-cde6-4e2b-2p7163
  Delete: claude-user-f19a6264-cde6-4e2b-2p7pv3
  ...

=====================================
  Cleanup Complete
=====================================
Containers deleted: 10
```

## 监控和维护

### 查看当前映射

```sql
-- 查看所有活跃映射
SELECT user_id, container_name, host_port, last_activity_at 
FROM user_worker_mappings 
WHERE status = 'active'
ORDER BY last_activity_at DESC;

-- 查看某个用户的映射
SELECT * FROM user_worker_mappings 
WHERE user_id = 'f19a6264-cde6-4e2b';

-- 查看已释放但未清理的映射
SELECT * FROM user_worker_mappings 
WHERE status = 'released';
```

### 手动清理

```sql
-- 清理已释放的映射（超过 24 小时）
DELETE FROM user_worker_mappings 
WHERE status = 'released' 
  AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- 清理异常状态的映射
DELETE FROM user_worker_mappings 
WHERE status = 'error' 
  AND updated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);
```

## 注意事项

1. **数据库连接**
   - 确保 Master 能正常连接数据库
   - 数据库不可用时，系统会降级为内存模式（会打印警告）

2. **性能影响**
   - 每次分配容器会增加一次数据库查询
   - 使用索引优化查询性能
   - 内存缓存避免重复查询

3. **向后兼容**
   - 旧容器可能没有数据库记录
   - 系统会自动为新容器创建记录
   - 可以使用清理脚本处理旧容器

4. **数据安全**
   - 定期备份数据库
   - 监控映射表大小
   - 及时清理已释放的映射

## 相关文件

- 迁移脚本：`server/src/master/db/migrations/001_create_user_worker_mappings.sql`
- 清理脚本：`cleanup-duplicate-workers.ps1`
- 核心代码：
  - `server/src/master/orchestrator/containerOrchestrator.ts`
  - `server/src/master/integration/wsPTYBridge.ts`

## 总结

通过数据库持久化用户 - 容器映射，彻底解决了以下问题：

✅ Master 重启后不会重复创建容器
✅ 一个用户固定对应一个 Worker 容器
✅ 并发请求不会导致重复创建
✅ 支持容器状态追踪和管理
✅ 提供数据恢复能力

系统现在具有生产级的可靠性和可维护性！
