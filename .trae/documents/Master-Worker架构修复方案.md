# Master-Worker 架构修复方案

## 核心原则

**一个用户 = 一个 Worker 容器 = 一个工作空间**

同一用户的所有会话共享同一个容器和工作空间。不需要区分会话级别的容器管理。

***

## 问题概览

基于之前的架构分析，需要修复以下 6 个核心问题：

1. **热池容器设计浪费资源** - 热池形同虚设，每次分配都经历"启动→销毁→重建"
2. **端口分配策略存在竞态条件** - 内存端口池在 Master 重启后丢失
3. **销毁容器前快照依赖会话记录** - 没有会话时跳过快照，数据保护不足
4. **容器健康检查在容器内部执行** - 使用 docker exec 增加攻击面且性能差
5. **工作空间管理器与编排器职责重叠** - 两个类都管理文件系统，可能不一致
6. **用户容器释放逻辑不清晰** - 需要明确何时释放容器

***

## 修复方案

### 修复 1：优化热池机制 - 容器预配置用户上下文

**目标**：让热池真正发挥作用，避免"启动→销毁→重建"的浪费

#### 具体步骤：

1. **修改热池容器创建逻辑**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 方法：`prewarmContainer()` 和 `assignContainerToUserInternal()`

   * 改动：

     ```typescript
     // 当前逻辑：销毁热池容器，创建新用户容器
     // 新逻辑：复用热池容器，通过 Worker API 切换用户上下文

     async assignContainerToUserInternal(userId, username, userTier, lockKey) {
       // 1. 从热池获取容器（不销毁）
       const warmContainer = await this.acquireFromWarmPool()
       
       if (warmContainer) {
         // 2. 通过 Worker API 初始化用户上下文
         await this.initializeUserContext(warmContainer, userId, username, userTier)
         
         // 3. 挂载用户工作空间（通过 Worker API 或重启容器）
         await this.mountUserWorkspace(warmContainer, userId)
         
         // 4. 更新容器状态为用户分配
         warmContainer.status = 'assigned'
         warmContainer.assignedUserId = userId
         
         // 5. 创建映射
         const mapping = { userId, container: warmContainer, ... }
         this.userMappings.set(userId, mapping)
       } else {
         // 热池为空，创建新容器
         const createResult = await this.createContainer(userId, username, userTier)
         // ... 正常流程
       }
     }
     ```

2. **新增 Worker API：初始化用户上下文**

   * 文件：`server/src/worker/server/routes/internal.ts`（需要创建或修改）

   * 新增端点：`POST /internal/initialize-user`

   * 功能：

     * 接收用户 ID、用户名、用户等级

     * 创建用户工作目录（如果不存在）

     * 加载用户配置

     * 清理上一个用户的数据（如果是复用容器）

3. **修改容器归还逻辑**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 方法：`returnToWarmPool()`

   * 改动：

     ```typescript
     // 当前逻辑：销毁旧容器，创建新热池容器
     // 新逻辑：清理用户数据，重置为热池状态

     async returnToWarmPool(container) {
       // 1. 调用 Worker API 清理用户数据
       await this.cleanupUserContext(container.containerId)
       
       // 2. 重置容器状态
       container.status = 'idle'
       container.assignedUserId = undefined
       
       // 3. 归还到热池
       this.warmPool.set(container.containerId, container)
     }
     ```

4. **在 Worker 端实现用户上下文切换**

   * 文件：`server/src/worker/services/userContextManager.ts`（新建）

   * 功能：

     * 管理当前用户上下文

     * 清理上一个用户的临时文件

     * 加载新用户配置

     * 支持热切换

**优势**：

* ✅ 热池容器真正复用，减少容器启动时间（从 90 秒降到 1 秒）

* ✅ 减少 Docker 操作，降低资源消耗

* ✅ 提升用户体验

**风险**：

* ⚠️ 需要确保用户数据完全隔离，清理逻辑必须彻底

* ⚠️ Worker 端需要新增用户上下文管理逻辑

***

### 修复 2：端口分配持久化到数据库

**目标**：解决 Master 重启后端口池丢失的问题

#### 具体步骤：

1. **创建端口分配记录表**

   * 文件：数据库迁移脚本

   * SQL：

     ```sql
     CREATE TABLE port_allocations (
       id VARCHAR(36) PRIMARY KEY,
       port INT NOT NULL UNIQUE,
       container_id VARCHAR(255),
       user_id VARCHAR(255),
       status ENUM('allocated', 'released') DEFAULT 'allocated',
       allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       released_at TIMESTAMP NULL,
       INDEX idx_status (status),
       INDEX idx_container_id (container_id)
     );
     ```

2. **修改端口分配逻辑**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 方法：`allocatePort()` 和 `releasePort()`

   * 改动：

     ```typescript
     // 分配端口时先查询数据库
     async allocatePort(): Promise<number> {
       const pool = getPool()
       
       // 1. 查找已释放的端口（优先复用）
       const [releasedPorts] = await pool.execute(
         `SELECT id, port FROM port_allocations 
          WHERE status = 'released' 
          ORDER BY released_at ASC 
          LIMIT 1`
       )
       
       if (releasedPorts.length > 0) {
         const portRecord = releasedPorts[0]
         await pool.execute(
           `UPDATE port_allocations 
            SET status = 'allocated', released_at = NULL, container_id = ? 
            WHERE id = ?`,
           [newContainerId, portRecord.id]
         )
         return portRecord.port
       }
       
       // 2. 如果没有可复用的，分配新端口
       const newPort = this.config.basePort + this.portCounter++
       const portId = uuidv4()
       await pool.execute(
         `INSERT INTO port_allocations (id, port, status) 
          VALUES (?, ?, 'allocated')`,
         [portId, newPort]
       )
       
       this.usedPorts.add(newPort)
       return newPort
     }

     // 释放端口时更新数据库
     releasePort(port: number): void {
       this.usedPorts.delete(port)
       
       // 异步更新数据库
       getPool()?.execute(
         `UPDATE port_allocations 
          SET status = 'released', released_at = CURRENT_TIMESTAMP 
          WHERE port = ? AND status = 'allocated'`,
         [port]
       )
     }
     ```

3. **初始化时从数据库加载已分配端口**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 方法：`initialize()`

   * 改动：

     ```typescript
     async initialize() {
       // ... 现有逻辑
       await this.loadAllocatedPortsFromDB()
     }

     async loadAllocatedPortsFromDB() {
       const pool = getPool()
       if (!pool) return
       
       const [rows] = await pool.execute(
         `SELECT port FROM port_allocations WHERE status = 'allocated'`
       )
       
       for (const row of rows) {
         this.usedPorts.add(row.port)
       }
     }
     ```

**优势**：

* ✅ Master 重启后端口分配不冲突

* ✅ 支持多 Master 实例部署

* ✅ 端口分配可追溯和审计

***

### 修复 3：快照与用户工作空间关联

**目标**：即使没有会话记录，用户文件也有快照保护

#### 具体步骤：

1. **修改快照创建逻辑**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 方法：`createSnapshotBeforeDestroy()`

   * 改动：

     ```typescript
     async createSnapshotBeforeDestroy(containerId) {
       // 1. 查找对应的用户
       let userId = this.findUserIdByContainer(containerId)
       if (!userId) return
       
       // 2. 使用增强型快照服务
       const snapshotService = getEnhancedSnapshotService()
       
       // 3. 优先查找会话关联，如果没有则创建用户级快照
       const db = getDB()
       const [recentSession] = await db.query(
         'SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
         [userId]
       )
       
       let sessionId = recentSession?.[0]?.id
       
       // 如果没有会话，创建用户级虚拟会话
       if (!sessionId) {
         sessionId = `user_snapshot_${userId}`
         console.log(`[ContainerOrchestrator] 为用户 ${userId} 创建虚拟快照会话`)
       }
       
       // 4. 创建快照
       const metadata = await snapshotService.createSnapshot({
         userId,
         sessionId,
         containerId,
         snapshotType: 'final',
         includeGitState: true,
         includeExecutionState: true
       })
       
       console.log(`[ContainerOrchestrator] 快照已保存: ${containerId}`)
     }

     // 新增辅助方法
     findUserIdByContainer(containerId) {
       // 在 userMappings 中查找
       for (const [uid, mapping] of this.userMappings) {
         if (mapping.container.containerId === containerId) {
           return uid
         }
       }
       // 在 warmPool 中查找
       const container = this.warmPool.get(containerId)
       return container?.assignedUserId || null
     }
     ```

**优势**：

* ✅ 所有用户文件都有快照保护

* ✅ 不依赖会话记录

* ✅ 向后兼容

***

### 修复 4：使用宿主机端口进行健康检查

**目标**：避免使用 `docker exec`，改用宿主机端口访问

#### 具体步骤：

1. **修改健康检查逻辑**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 方法：`checkContainerHealth()`

   * 改动：

     ```typescript
     async checkContainerHealth(containerId) {
       try {
         // 1. 检查容器是否存在
         try {
           await execAsync(`docker inspect ${containerId}`)
         } catch {
           this.warmPool.delete(containerId)
           return false
         }
         
         // 2. 检查容器运行状态
         const { stdout } = await execAsync(
           `docker inspect --format='{{.State.Running}}' ${containerId}`
         )
         if (stdout.trim() !== 'true') {
           return false
         }
         
         // 3. 获取容器映射的端口
         const container = this.findContainerById(containerId)
         if (!container || !container.hostPort) {
           return false
         }
         
         // 4. 通过宿主机端口访问健康检查端点（新方案）
         try {
           const statusCode = await this.checkHealthViaHttp(container.hostPort)
           if (statusCode > 0 && statusCode < 500) {
             return true
           }
         } catch (httpError) {
           console.warn(`[ContainerOrchestrator] 健康检查 HTTP 请求失败: ${httpError}`)
         }
         
         // 5. 降级方案：使用 docker exec（保持向后兼容）
         try {
           const { stdout: healthOutput } = await execAsync(
             `docker exec ${containerId} wget -q -O /dev/null --timeout=5 http://localhost:${getWorkerInternalPort()}/internal/health && echo "200" || echo "000"`
           )
           const statusCode = parseInt(healthOutput.trim(), 10)
           if (statusCode > 0 && statusCode < 500) {
             return true
           }
         } catch {
           // docker exec 失败
         }
         
         return false
       } catch (error) {
         console.error(`[ContainerOrchestrator] 健康检查异常:`, error)
         return false
       }
     }

     // 新增方法：通过 HTTP 检查健康状态
     async checkHealthViaHttp(hostPort) {
       return new Promise((resolve) => {
         const http = require('http')
         const req = http.get(`http://localhost:${hostPort}/internal/health`, { timeout: 5000 }, (res) => {
           resolve(res.statusCode)
           res.resume()
         })
         
         req.on('error', () => resolve(0))
         req.on('timeout', () => {
           req.destroy()
           resolve(0)
         })
       })
     }
     ```

**优势**：

* ✅ 不依赖 `docker exec`，减少攻击面

* ✅ 性能更好（HTTP 请求比 docker exec 快）

* ✅ 降级方案保持向后兼容

***

### 修复 5：统一工作空间管理职责

**目标**：明确 `ContainerOrchestrator` 和 `WorkspaceManager` 的职责边界

#### 具体步骤：

1. **明确职责划分**

   ```
   ContainerOrchestrator（容器编排）：
   - 容器生命周期管理（创建、启动、停止、销毁）
   - 热池管理
   - 用户-容器映射
   - 端口分配
   - 健康检查

   WorkspaceManager（工作空间管理）：
   - 工作空间目录结构管理
   - 文件上传/下载
   - Skill 安装/卸载
   - 用户元数据管理
   - 文件权限和配额检查
   ```

2. **移除 ContainerOrchestrator 中的文件管理方法**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 移除或标记为废弃的方法：

     ```typescript
     - ensureUserWorkspaceExists()       → 改用 workspaceManager.getOrCreateUserWorkspace()
     - getUserWorkspacePath()            → 改用 workspaceManager.getActualWorkspacePath()
     - ensureHostWorkspaceExists()       → 改用 workspaceManager 的初始化方法
     - getWorkspaceStats()               → 改用 workspaceManager.getWorkspaceStats()
     - getDirectorySize()                → 改用 workspaceManager 的工具方法
     - checkDiskSpace()                  → 保留（属于容器资源管理）
     ```

3. **修改 ContainerOrchestrator 依赖 WorkspaceManager**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 改动：

     ```typescript
     import { getWorkspaceManager } from '../services/workspaceManager'

     class ContainerOrchestrator {
       async assignContainerToUserInternal(userId, username, userTier, lockKey) {
         // 1. 通过 WorkspaceManager 确保工作空间存在
         const workspaceManager = getWorkspaceManager()
         const workspace = await workspaceManager.getOrCreateUserWorkspace(userId)
         
         // 2. 使用 WorkspaceManager 获取路径
         const workspacePath = workspaceManager.getActualWorkspacePath(userId)
         
         // 3. 创建容器并挂载工作空间
         const createResult = await this.createContainer(userId, username, userTier, workspacePath)
         // ...
       }
     }
     ```

**优势**：

* ✅ 职责清晰，易于维护

* ✅ 避免重复代码和逻辑不一致

* ✅ 符合单一职责原则

***

### 修复 6：明确容器释放语义

**目标**：一个用户一个容器，当用户的所有活动都结束时才释放容器

#### 具体步骤：

1. **修改容器释放逻辑**

   * 文件：`server/src/master/orchestrator/containerOrchestrator.ts`

   * 方法：`releaseUserContainer()`

   * 改动：

     ```typescript
     /**
      * 释放用户容器（当用户所有活动都结束时调用）
      * 一个用户一个容器，不区分会话
      * 
      * @param userId 用户ID
      * @param force 是否强制销毁（不归还热池）
      */
     async releaseUserContainer(userId: string, force: boolean = false): Promise<OrchestratorResult<void>> {
       const mapping = this.userMappings.get(userId)
       if (!mapping) {
         return { success: true } // 已经释放
       }
       
       const container = mapping.container
       
       if (force) {
         // 强制销毁容器
         await this.destroyContainer(container.containerId)
       } else {
         // 归还到热池（清理用户数据后复用）
         await this.returnToWarmPool(container)
       }
       
       // 移除映射
       this.userMappings.delete(userId)
       await this.updateUserMappingStatusInDB(userId, 'released')
       
       console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已释放`)
       return { success: true }
     }
     ```

2. **更新调用方逻辑**

   * 查找所有调用 `releaseUserContainer` 的地方

   * 确保只在用户级别调用，而不是会话级别

**优势**：

* ✅ 符合"一个用户一个容器"的原则

* ✅ 避免混淆会话和容器关系

* ✅ 简化容器生命周期管理

***

## 实施计划

### 阶段 1：修复关键问题（高优先级）

1. ✅ 修复 5：统一工作空间管理职责

   * 修改 `ContainerOrchestrator` 依赖 `WorkspaceManager`

   * 移除重复方法

   * 运行测试

2. ✅ 修复 6：明确容器释放语义

   * 简化 `releaseUserContainer` 逻辑

   * 更新调用方

   * 运行测试

### 阶段 2：优化性能（中优先级）

1. ✅ 修复 1：优化热池机制

   * Worker 端实现用户上下文切换 API

   * 修改容器分配和归还逻辑

   * 运行测试

2. ✅ 修复 2：端口分配持久化

   * 创建数据库迁移脚本

   * 修改端口分配逻辑

   * 运行测试

### 阶段 3：改进细节（低优先级）

1. ✅ 修复 3：快照与用户工作空间关联

   * 修改快照创建逻辑

   * 运行测试

2. ✅ 修复 4：使用宿主机端口健康检查

   * 修改健康检查方法

   * 运行测试

### 阶段 4：验证和文档

1. ✅ 运行完整的集成测试
2. ✅ 更新 `README.md` 文档
3. ✅ 提交代码

***

## 风险评估

| 修复项         | 风险等级 | 影响范围   | 回滚方案            |
| ----------- | ---- | ------ | --------------- |
| 修复 1（热池优化）  | 高    | 容器分配流程 | 保留旧逻辑作为降级方案     |
| 修复 2（端口持久化） | 低    | 端口分配   | 数据库迁移可回滚        |
| 修复 3（快照关联）  | 低    | 快照服务   | 向后兼容            |
| 修复 4（健康检查）  | 低    | 健康检查   | 降级到 docker exec |
| 修复 5（职责统一）  | 中    | 代码结构   | 保留旧方法标记为废弃      |
| 修复 6（容器释放）  | 低    | 容器释放流程 | 向后兼容            |

***

## 预期收益

| 指标          | 当前状态                 | 优化后             | 提升       |
| ----------- | -------------------- | --------------- | -------- |
| 容器分配时间      | 90-120 秒             | 1-3 秒（热池复用）     | **98%**  |
| Master 重启恢复 | 端口可能冲突               | 完全恢复            | **100%** |
| 快照覆盖率       | 依赖会话（\~70%）          | 100%            | **30%**  |
| 健康检查性能      | docker exec（\~500ms） | HTTP 请求（\~50ms） | **90%**  |
| 代码可维护性      | 职责重叠                 | 职责清晰            | **显著提升** |

