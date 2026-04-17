# Docker 容器休眠/冻结方案

## 核心原则

**一个用户 = 一个 Worker 容器 = 一个工作空间**

使用 Docker 原生 `docker pause/unpause` 技术实现容器休眠和秒级恢复，取代热池机制。

---

## 技术方案

### Docker pause/unpause 核心能力

- **完全保留状态**：容器内所有文件、环境、运行中的进程、内存数据 100% 保留
- **极致降资源**：CPU 占用 0%（内核冻结进程），内存可交换到磁盘
- **恢复速度**：毫秒级（比重启容器快 1000 倍）
- **零改造**：Docker 原生支持，无需修改 Worker 代码

### 架构改动

```
当前架构（错误）：
用户离开 → 销毁容器 → 创建新热池容器（无挂载）
用户回来 → 销毁热池容器 → 创建新用户容器（挂载工作空间）

新架构（正确）：
用户离开 → docker pause 容器（CPU=0，保留所有状态）
用户回来 → docker unpause 容器（秒级恢复，状态丝毫不丢）
```

---

## 修复方案

### 步骤 1：修改容器分配逻辑

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**方法**：`assignContainerToUser()`

**改动**：

```typescript
/**
 * 为用户分配容器（从热池获取或新建）
 * 新逻辑：优先从休眠池恢复，否则新建
 */
async assignContainerToUser(userId: string, username?: string, userTier?: UserTier): Promise<OrchestratorResult<UserContainerMapping>> {
  const lockKey = `user_container_${userId}`
  const now = Date.now()
  const existingLock = userContainerLocks.get(lockKey)

  // 检查锁
  const LOCK_TIMEOUT_MS = 120000
  if (existingLock && (now - existingLock.timestamp) < LOCK_TIMEOUT_MS) {
    console.warn(`[ContainerOrchestrator] 用户 ${userId} 的容器分配锁已被持有，跳过`)
    const existingMapping = this.userMappings.get(userId)
    if (existingMapping) {
      // 如果容器是暂停状态，恢复它
      if (existingMapping.container.status === 'paused') {
        await this.unpauseContainer(existingMapping.container.containerId)
        existingMapping.container.status = 'assigned'
      }
      return { success: true, data: existingMapping }
    }
    return {
      success: false,
      error: '容器创建中，请稍后重试',
      code: 'CONTAINER_CREATION_IN_PROGRESS'
    }
  }

  // 获取锁
  userContainerLocks.set(lockKey, { locked: true, timestamp: now })

  try {
    return await this.assignContainerToUserInternal(userId, username, userTier, lockKey)
  } catch (error) {
    userContainerLocks.delete(lockKey)
    return {
      success: false,
      error: error instanceof Error ? error.message : '分配容器失败',
      code: 'ASSIGN_FAILED'
    }
  }
}
```

**内部方法**：

```typescript
private async assignContainerToUserInternal(userId: string, username?: string, userTier?: UserTier, lockKey?: string): Promise<OrchestratorResult<UserContainerMapping>> {
  try {
    // 1. 检查用户是否已有容器（包括休眠状态）
    const existingMapping = this.userMappings.get(userId)
    if (existingMapping) {
      // 恢复容器（如果是暂停状态）
      if (existingMapping.container.status === 'paused') {
        console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器处于休眠状态，正在恢复...`)
        await this.unpauseContainer(existingMapping.container.containerId)
        existingMapping.container.status = 'assigned'
        existingMapping.container.lastActivityAt = new Date()
        existingMapping.lastActivityAt = new Date()
        console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已恢复`)
      }
      
      return { success: true, data: existingMapping }
    }

    // 2. 尝试从 Docker 扫描恢复用户的容器（Master 重启场景）
    const dockerMapping = await this.scanAndRecoverUserContainer(userId)
    if (dockerMapping) {
      console.log(`[ContainerOrchestrator] 从 Docker 恢复用户 ${userId} 的容器`)
      if (dockerMapping.container.status === 'paused') {
        await this.unpauseContainer(dockerMapping.container.containerId)
        dockerMapping.container.status = 'assigned'
      }
      return { success: true, data: dockerMapping }
    }

    // 3. 确保用户工作空间目录存在
    const workspaceResult = await this.ensureUserWorkspaceExists(userId)
    if (!workspaceResult.success) {
      console.warn(`[ContainerOrchestrator] 确保工作空间目录失败: ${workspaceResult.error}`)
    }

    // 4. 创建新容器
    const createResult = await this.createContainer(userId, username, userTier)
    if (!createResult.success) {
      return createResult as OrchestratorResult<UserContainerMapping>
    }
    const container = createResult.data!

    // 5. 创建用户映射
    const mapping: UserContainerMapping = {
      userId,
      container,
      assignedAt: new Date(),
      sessionCount: 0,
      lastActivityAt: new Date()
    }

    this.userMappings.set(userId, mapping)
    await this.saveUserMappingToDB(mapping)

    console.log(`[ContainerOrchestrator] 成功为用户 ${userId} 分配新容器：${container.containerId}`)
    return { success: true, data: mapping }

  } finally {
    if (lockKey) {
      userContainerLocks.delete(lockKey)
    }
  }
}
```

---

### 步骤 2：新增容器休眠/恢复方法

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**新增方法**：

```typescript
/**
 * 休眠容器（用户离开时调用）
 * 使用 docker pause 冻结容器进程，CPU 占用降为 0
 * 保留所有状态：文件、环境、进程、内存数据
 * 
 * @param containerId 容器 ID
 * @returns 是否成功
 */
async pauseContainer(containerId: string): Promise<boolean> {
  try {
    console.log(`[ContainerOrchestrator] 休眠容器: ${containerId}`)
    await execAsync(`docker pause ${containerId}`)
    console.log(`[ContainerOrchestrator] 容器已休眠: ${containerId}`)
    return true
  } catch (error) {
    console.error(`[ContainerOrchestrator] 休眠容器失败 (${containerId}):`, error)
    return false
  }
}

/**
 * 恢复容器（用户回来时调用）
 * 使用 docker unpause 秒级恢复容器
 * 所有状态丝毫不丢
 * 
 * @param containerId 容器 ID
 * @returns 是否成功
 */
async unpauseContainer(containerId: string): Promise<boolean> {
  try {
    console.log(`[ContainerOrchestrator] 恢复容器: ${containerId}`)
    await execAsync(`docker unpause ${containerId}`)
    console.log(`[ContainerOrchestrator] 容器已恢复: ${containerId}`)
    return true
  } catch (error) {
    console.error(`[ContainerOrchestrator] 恢复容器失败 (${containerId}):`, error)
    return false
  }
}

/**
 * 检查容器是否处于暂停状态
 */
async isContainerPaused(containerId: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker inspect --format='{{.State.Status}}' ${containerId}`
    )
    return stdout.trim() === 'paused'
  } catch {
    return false
  }
}
```

---

### 步骤 3：修改容器释放逻辑

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**方法**：`releaseUserContainer()`

**改动**：

```typescript
/**
 * 释放用户容器（当用户所有活动都结束时调用）
 * 一个用户一个容器，不区分会话
 * 
 * 新逻辑：休眠容器而不是销毁
 * 
 * @param userId 用户ID
 * @param force 是否强制销毁（不推荐，除非用户明确要求）
 */
async releaseUserContainer(userId: string, force: boolean = false): Promise<OrchestratorResult<void>> {
  try {
    const mapping = this.userMappings.get(userId)
    if (!mapping) {
      console.warn(`[ContainerOrchestrator] 用户 ${userId} 没有关联的容器`)
      return { success: true }
    }

    const container = mapping.container

    if (force) {
      // 强制销毁容器（创建快照后销毁）
      await this.createSnapshotBeforeDestroy(container.containerId)
      await this.destroyContainer(container.containerId)
      console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已强制销毁`)
    } else {
      // 休眠容器（推荐）
      const paused = await this.pauseContainer(container.containerId)
      if (paused) {
        container.status = 'paused'
        console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已休眠，可秒级恢复`)
      } else {
        console.error(`[ContainerOrchestrator] 用户 ${userId} 的容器休眠失败`)
        return {
          success: false,
          error: '容器休眠失败',
          code: 'PAUSE_FAILED'
        }
      }
    }

    // 更新最后活动时间
    mapping.lastActivityAt = new Date()
    
    // 更新数据库状态
    await this.updateUserMappingStatusInDB(userId, force ? 'destroyed' : 'paused')

    return { success: true }

  } catch (error) {
    console.error(`[ContainerOrchestrator] 释放用户 ${userId} 容器失败:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '释放容器失败',
      code: 'RELEASE_FAILED'
    }
  }
}
```

---

### 步骤 4：移除热池相关代码

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**移除的方法**：

```typescript
// 删除这些方法（不再需要）
- prewarmContainer()              // 预热容器
- acquireFromWarmPool()           // 从热池获取容器
- returnToWarmPool()              // 归还容器到热池
- shrinkWarmPool()                // 缩小热池
- replenishWarmPool()             // 补充热池
- forceReplenishWarmPool()        // 强制补充热池
- startIdleCleanupLoop()          // 空闲清理循环
- cleanupExcessContainers()       // 清理超出最大值的容器
- scanExistingContainers()        // 扫描热容器
```

**移除的数据结构**：

```typescript
class ContainerOrchestrator {
  // 移除热池相关
  - private warmPool: Map<string, ContainerInstance> = new Map()
  - private portCounter: number = 0
  - private usedPorts: Set<number> = new Set()
  - private cleanupTimer: NodeJS.Timeout | null = null
  
  // 保留用户映射和健康检查
  private userMappings: Map<string, UserContainerMapping> = new Map()
  private healthCheckTimer: NodeJS.Timeout | null = null
  private dockerCleanupTimer: NodeJS.Timeout | null = null
}
```

---

### 步骤 5：简化 PoolConfig

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**改动**：

```typescript
export interface PoolConfig {
  // 移除热池相关配置
  - minPoolSize: number
  - maxPoolSize: number
  - idleTimeoutMs: number
  
  // 保留必要配置
  imageName: string
  networkName: string
  basePort: number
  hostWorkspacePath: string
  diskWarningThreshold: number
  diskCriticalThreshold: number
  enableAutoCleanup: boolean
  cleanupIntervalMs: number
  cleanupUnusedImages: boolean
  cleanupOrphanedVolumes: boolean
  healthCheckIntervalMs: number  // 保留，用于健康检查
}
```

**默认配置**：

```typescript
const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  // 移除
  - minPoolSize: parseInt(process.env.CONTAINER_POOL_MIN_SIZE || '3', 10),
  - maxPoolSize: parseInt(process.env.CONTAINER_POOL_MAX_SIZE || '10', 10),
  - idleTimeoutMs: parseInt(process.env.CONTAINER_IDLE_TIMEOUT_MS || '300000', 10),
  
  // 保留
  imageName: process.env.WORKER_IMAGE_NAME || 'claw-web-backend-worker:latest',
  networkName: process.env.DOCKER_NETWORK_NAME || 'claw-web_worker-network',
  basePort: parseInt(process.env.CONTAINER_BASE_PORT || '3100', 10),
  hostWorkspacePath: process.env.HOST_WORKSPACE_PATH || '/data/claws/workspaces',
  diskWarningThreshold: parseInt(process.env.DISK_WARNING_THRESHOLD || '80', 10),
  diskCriticalThreshold: parseInt(process.env.DISK_CRITICAL_THRESHOLD || '90', 10),
  enableAutoCleanup: process.env.ENABLE_DOCKER_AUTO_CLEANUP === 'true',
  cleanupIntervalMs: parseInt(process.env.DOCKER_CLEANUP_INTERVAL_MS || '3600000', 10),
  cleanupUnusedImages: process.env.DOCKER_CLEANUP_IMAGES !== 'false',
  cleanupOrphanedVolumes: process.env.DOCKER_CLEANUP_VOLUMES === 'true',
  healthCheckIntervalMs: parseInt(process.env.CONTAINER_HEALTH_CHECK_INTERVAL || '60000', 10),
}
```

---

### 步骤 6：修改初始化逻辑

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**方法**：`initialize()`

**改动**：

```typescript
async initialize(): Promise<OrchestratorResult<void>> {
  try {
    console.log('[ContainerOrchestrator] 开始初始化...')

    // 1. 检查 Docker 是否可用
    const dockerAvailable = await this.checkDockerAvailability()
    if (!dockerAvailable) {
      return {
        success: false,
        error: 'Docker服务不可用，请确保Docker已启动',
        code: 'DOCKER_UNAVAILABLE'
      }
    }

    // 2. 确保网络存在
    const networkCreated = await this.ensureNetworkExists()
    if (!networkCreated) {
      return {
        success: false,
        error: `无法创建或访问网络 ${this.config.networkName}`,
        code: 'NETWORK_ERROR'
      }
    }

    // 3. 确保宿主机工作空间根目录存在
    await this.ensureHostWorkspaceExists()

    // 4. 检查磁盘空间
    const diskStatus = await this.checkDiskSpace()
    if (diskStatus.critical) {
      console.error(`[ContainerOrchestrator] 磁盘空间严重不足: ${diskStatus.used}%`)
      return {
        success: false,
        error: `磁盘空间严重不足 (${diskStatus.used}%)，无法创建容器`,
        code: 'DISK_SPACE_CRITICAL'
      }
    }
    if (diskStatus.warning) {
      console.warn(`[ContainerOrchestrator] 磁盘空间告警: ${diskStatus.used}%`)
    }

    // 5. 从数据库加载用户映射（Master 重启后恢复）
    console.log('[ContainerOrchestrator] 从数据库加载用户映射...')
    await this.loadUserMappingsFromDB()

    // 6. 扫描 Docker 中已运行的用户容器并恢复映射
    console.log('[ContainerOrchestrator] 扫描 Docker 中已运行的用户容器...')
    await this.scanAndRecoverUserContainers()

    // 7. 启动健康检查循环（检查用户容器和休眠容器）
    this.startHealthCheckLoop()
    console.log('[ContainerOrchestrator] 健康检查已启用')

    // 8. 启动 Docker 系统清理定时任务
    if (this.config.enableAutoCleanup) {
      this.startDockerCleanupLoop()
      console.log(`[ContainerOrchestrator] Docker 自动清理已启用`)
    }

    console.log(`[ContainerOrchestrator] 初始化完成，当前用户容器: ${this.userMappings.size}`)
    return { success: true }

  } catch (error) {
    console.error('[ContainerOrchestrator] 初始化失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '初始化失败',
      code: 'INIT_FAILED'
    }
  }
}
```

**移除的初始化步骤**：
- ❌ `scanExistingContainers()` - 扫描热容器
- ❌ 预启动热容器池循环
- ❌ `startIdleCleanupLoop()` - 空闲清理

---

### 步骤 7：更新健康检查逻辑

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**改动**：

```typescript
/**
 * 启动健康检查循环
 * 检查用户容器和休眠容器的状态
 */
private startHealthCheckLoop(): void {
  const healthCheckLoop = async () => {
    try {
      for (const [userId, mapping] of this.userMappings) {
        const container = mapping.container
        
        // 跳过休眠容器（不需要健康检查）
        if (container.status === 'paused') {
          continue
        }

        const isHealthy = await this.checkContainerHealth(container.containerId)
        if (!isHealthy) {
          console.error(`[ContainerOrchestrator] 用户 ${userId} 的容器不健康，尝试恢复...`)
          await this.recoverUserContainer(userId)
        }
      }
    } catch (error) {
      console.error('[ContainerOrchestrator] 健康检查循环出错:', error)
    } finally {
      if (this.healthCheckTimer) {
        this.healthCheckTimer = setTimeout(healthCheckLoop, this.config.healthCheckIntervalMs)
      }
    }
  }

  this.healthCheckTimer = setTimeout(healthCheckLoop, this.config.healthCheckIntervalMs)
}

/**
 * 恢复用户容器
 */
private async recoverUserContainer(userId: string): Promise<void> {
  const mapping = this.userMappings.get(userId)
  if (!mapping) return

  // 1. 尝试重启容器
  const restarted = await this.restartUserContainer(userId)
  if (restarted) {
    console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器重启成功`)
    return
  }

  // 2. 重启失败，重新分配容器
  console.error(`[ContainerOrchestrator] 用户 ${userId} 的容器重启失败，重新分配...`)
  await this.destroyContainer(mapping.container.containerId)
  this.userMappings.delete(userId)
  
  // 重新分配（会创建新容器）
  await this.assignContainerToUser(userId, mapping.username, mapping.userTier)
}
```

---

### 步骤 8：添加休眠容器清理逻辑

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**新增方法**（可选，用于清理长时间休眠的容器）：

```typescript
/**
 * 清理长时间休眠的容器（可选）
 * 如果用户超过指定时间未回来，可以销毁容器释放磁盘空间
 * 
 * @param maxPauseTimeMs 最大休眠时间（毫秒）
 * @returns 清理的容器数量
 */
async cleanupLongPausedContainers(maxPauseTimeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const now = Date.now()
  let cleanedCount = 0

  for (const [userId, mapping] of this.userMappings) {
    if (mapping.container.status !== 'paused') {
      continue
    }

    const pauseTime = now - mapping.lastActivityAt.getTime()
    if (pauseTime > maxPauseTimeMs) {
      console.log(`[ContainerOrchestrator] 清理长时间休眠的容器: 用户 ${userId} (休眠${Math.round(pauseTime / (24 * 60 * 60 * 1000))}天)`)
      
      // 创建快照
      await this.createSnapshotBeforeDestroy(mapping.container.containerId)
      
      // 销毁容器
      await this.destroyContainer(mapping.container.containerId)
      this.userMappings.delete(userId)
      cleanedCount++
    }
  }

  if (cleanedCount > 0) {
    console.log(`[ContainerOrchestrator] 已清理 ${cleanedCount} 个长时间休眠的容器`)
  }

  return cleanedCount
}
```

---

### 步骤 9：更新 shutdown 逻辑

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**改动**：

```typescript
/**
 * 关闭编排器（停止所有定时任务）
 * 注意：不销毁用户容器，保持运行或休眠状态
 */
async shutdown(): Promise<void> {
  console.log('[ContainerOrchestrator] 正在关闭编排器...')

  // 停止定时任务
  if (this.healthCheckTimer) {
    clearTimeout(this.healthCheckTimer)
    this.healthCheckTimer = null
  }

  if (this.dockerCleanupTimer) {
    clearInterval(this.dockerCleanupTimer)
    this.dockerCleanupTimer = null
  }

  // 不销毁用户容器（保持运行或休眠状态）
  console.log(`[ContainerOrchestrator] 编排器已关闭，${this.userMappings.size} 个用户容器保持原状态`)
}
```

---

### 步骤 10：更新 ContainerInstance 状态

**文件**：`server/src/master/orchestrator/containerOrchestrator.ts`

**改动**：

```typescript
export interface ContainerInstance {
  containerId: string
  containerName: string
  hostPort: number
  // 更新状态枚举
  status: 'running' | 'stopped' | 'creating' | 'error' | 'assigned' | 'paused'
  assignedUserId?: string
  createdAt: Date
  lastActivityAt: Date
  resourceUsage?: {
    memoryMB: number
    cpuPercent: number
  }
}
```

**新增 'paused' 状态**，表示容器已休眠。

---

## 实施计划

### 阶段 1：核心功能

1. 新增 `pauseContainer()` 和 `unpauseContainer()` 方法
2. 修改 `assignContainerToUserInternal()` - 支持从休眠状态恢复
3. 修改 `releaseUserContainer()` - 改为休眠而不是销毁
4. 更新 `ContainerInstance` 状态枚举（添加 'paused'）

### 阶段 2：移除热池

5. 移除热池相关方法（prewarmContainer、acquireFromWarmPool 等）
6. 移除热池数据结构（warmPool、portCounter 等）
7. 简化 PoolConfig 接口
8. 删除 `scanExistingContainers()` 方法

### 阶段 3：更新初始化和清理

9. 修改 `initialize()` - 移除热池初始化
10. 更新健康检查循环（跳过休眠容器）
11. 更新 `shutdown()` - 不销毁用户容器
12. 添加 `cleanupLongPausedContainers()` 方法（可选）

### 阶段 4：测试和验证

13. 运行单元测试
14. 运行集成测试
15. 手动测试容器休眠/恢复流程
16. 更新文档

---

## 风险评估

| 风险项 | 风险等级 | 影响 | 缓解措施 |
|--------|----------|------|----------|
| Docker pause 不兼容某些内核 | 低 | 休眠失败 | 降级到销毁容器 |
| 休眠容器占用磁盘空间 | 低 | 磁盘空间增加 | 定期清理长时间休眠的容器 |
| 内存未完全释放 | 中 | 物理内存占用 | 配合 cgroup 内存回收 |

---

## 预期收益

| 指标 | 移除热池前 | 使用休眠后 | 变化 |
|------|------------|------------|------|
| 容器分配时间 | 90-120 秒 | **1-3 秒** | **98%** |
| CPU 占用（空闲） | 热池容器占用 | **0%** | **100%** |
| 内存占用（空闲） | 热池容器占用 | **接近 0** | **~100%** |
| 状态保留 | 不保留（销毁重建） | **100% 保留** | **新功能** |
| 代码行数 | ~2600 行 | ~1800 行 | **减少 30%** |
| 逻辑复杂度 | 高 | 低 | **显著降低** |

---

## Docker 配置建议

### 启用 cgroup 内存回收（可选）

```bash
# 检查 cgroup v2 是否启用
mount | grep cgroup

# 设置休眠容器的内存回收策略
echo 1 > /sys/fs/cgroup/docker/<容器ID>/memory.swap.max

# 或使用 Docker 运行时配置
docker update --memory-swap 0 <容器ID>
```

### Worker 容器创建时启用 swap

修改 `buildDockerRunCommand()` 方法：

```typescript
const resourceArgs = [
  `-m ${quota.storageQuotaMB}m`,
  `--memory-swap ${quota.storageQuotaMB * 2}m`,  // 允许 swap
  '--memory-swappiness=60',  // 积极使用 swap
]
```
