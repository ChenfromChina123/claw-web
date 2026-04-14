# Docker 服务策略深度分析报告

## 一、架构概览

 claw-web 项目采用 **Master-Worker** 架构模式：
- **Master**：主控服务，负责用户认证、请求路由、容器调度
- **Worker**：Docker容器，实际执行用户任务，每个用户（或共享）一个容器

核心模块位于 `server/src/orchestrator/` 目录：
- `schedulingPolicy.ts` - 调度策略
- `containerOrchestrator.ts` - 容器编排器
- `userContainerMapper.ts` - 用户容器映射管理
- `enhancedWarmPool.ts` - 增强型热池管理

---

## 二、用户分发策略

### 2.1 用户等级体系

代码中定义了四级用户等级（`UserTier`）：

| 等级 | 特点 | 容器策略 | 空闲超时 |
|------|------|----------|----------|
| **VIP** | 超级管理员/企业用户 | 独占容器，永不回收 | 永不回收 |
| **PREMIUM** | 高级付费用户 | 共享池优先分配 | 30分钟 |
| **REGULAR** | 普通用户 | 标准容器池 | 5分钟 |
| **TRIAL** | 试用/新用户 | 受限资源 | 2分钟 |

### 2.2 分发流程

```
用户请求 → 身份识别 → 等级判定 → 调度决策 → 容器分配
```

**关键代码**（schedulingPolicy.ts:378-406）：
```typescript
determineUserTier(userData: {...}): UserTier {
  // 超级管理员和管理员 -> VIP
  if (role === 'superadmin' || role === 'admin') {
    return UserTier.VIP
  }
  // 订阅等级判断
  if (subscription === 'vip' || subscription === 'enterprise') {
    return UserTier.VIP
  }
  // ...
}
```

### 2.3 优先级队列机制

当资源不足时，请求进入**优先级队列**：
- VIP用户（priority=1）排在最前
- 按优先级数值排序（越小越优先）
- 同等级按时间先后

**代码实现**（schedulingPolicy.ts:479-513）：
```typescript
enqueueRequest(userId, username, tier): Promise<SchedulingResult> {
  // 按优先级插入队列（优先级高的在前）
  const insertIndex = this.requestQueue.findIndex(
    item => this.tierConfigs[item.tier].priority > this.tierConfigs[tier].priority
  )
}
```

---

## 三、创建容器策略

### 3.1 热池预热策略

**预启动机制**：
- 最小热池大小：`minPoolSize = 3`（可配置）
- 最大热池大小：`maxPoolSize = 10`（可配置）
- 创建间隔：每个容器间隔10秒，避免资源竞争

**代码**（containerOrchestrator.ts:156-171）：
```typescript
// 预启动热容器池（带间隔延迟，避免资源竞争）
for (let i = 0; i < this.config.minPoolSize; i++) {
  const created = await this.prewarmContainer()
  if (i < this.config.minPoolSize - 1) {
    await new Promise(resolve => setTimeout(resolve, 10000)) // 10秒间隔
  }
}
```

### 3.2 动态创建策略

**触发条件**：
1. 热池无可用容器
2. 当前用户数超过热池容量
3. 资源利用率 < 85%

**资源限制配置**（hardwareResourceConfig.ts）：
| 等级 | CPU | 内存限制 | 存储配额 | 最大会话 |
|------|-----|----------|----------|----------|
| FREE | 0.5核 | 256MB | 200MB | 3 |
| BASIC | 1核 | 512MB | 500MB | 5 |
| PRO | 2核 | 1024MB | 2GB | 10 |
| ENTERPRISE | 4核 | 2GB | 10GB | 20 |
| ADMIN | 8核 | 4GB | 50GB | 50 |

### 3.3 端口分配策略

**多层级端口检测**：
1. 检查端口池（usedPorts Set）
2. 本地端口可用性检测（net模块）
3. Docker端口占用检测
4. 系统端口占用检测（netstat/ss）

**代码**（containerOrchestrator.ts:874-992）：
```typescript
private async allocatePort(): Promise<number> {
  // 跳过已在端口池中的端口
  if (this.usedPorts.has(port)) continue
  
  // 检查端口是否已被系统占用
  const isAvailable = await this.isPortAvailable(port)
  if (isAvailable) {
    this.usedPorts.add(port)
    return port
  }
}
```

---

## 四、控制策略

### 4.1 健康检查策略

**检查频率**：每15秒（可配置）

**检查内容**：
1. Docker容器运行状态检查
2. HTTP健康端点探测（容器内curl）
3. 容器年龄检查（创建后60秒内豁免）

**代码**（containerOrchestrator.ts:683-732）：
```typescript
async checkContainerHealth(containerId: string): Promise<boolean> {
  // 检查容器运行状态
  const { stdout: inspectOutput } = await execAsync(
    `docker inspect --format='{{.State.Running}}' ${containerId}`
  )
  
  // 容器内健康检查
  const { stdout: healthOutput } = await execAsync(
    `docker exec ${containerId} curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health`
  )
}
```

### 4.2 故障恢复策略

**自动恢复机制**：
- 不健康容器自动销毁并重新创建
- 连续失败指数退避（最多5分钟冷却期）
- 热池自动补充到最小数量

**代码**（containerOrchestrator.ts:1127-1147）：
```typescript
private async replenishWarmPool(): Promise<void> {
  // 指数退避：连续失败越多，冷却时间越长
  const minInterval = Math.min(30000 * (this.consecutiveFailures + 1), 300000)
  
  if (now - this.lastContainerCreationTime < minInterval) {
    return  // 冷却中
  }
}
```

### 4.3 空闲清理策略

**回收机制**：
- 每分钟检查一次空闲容器
- 超过空闲超时时间（默认5分钟）自动销毁
- VIP容器永不回收

**代码**（containerOrchestrator.ts:1152-1167）：
```typescript
private startIdleCleanupLoop(): void {
  this.cleanupTimer = setInterval(async () => {
    for (const [containerId, container] of this.warmPool) {
      const idleTime = now - container.lastActivityAt.getTime()
      if (idleTime > this.config.idleTimeoutMs) {
        await this.destroyContainer(containerId)
      }
    }
  }, 60000) // 每分钟检查
}
```

### 4.4 优雅销毁策略

销毁前执行：
1. 工作快照保存（`createSnapshotBeforeDestroy`）
2. 优雅停止（`docker stop -t 5`）
3. 资源释放（端口、映射关系）

---

## 五、分发策略

### 5.1 请求路由策略

**路由流程**（requestRouter.ts）：
```
用户请求 → JWT认证 → 查询映射 → 无映射则调度 → 反向代理到Worker
```

**路由决策**：
1. 从JWT Token提取用户身份
2. 查询用户-容器映射
3. 无容器时触发SchedulingPolicy调度
4. 反向代理HTTP/WebSocket请求

### 5.2 负载均衡策略

**热池容器选择**（enhancedWarmPool.ts:202-240）：
```typescript
selectBestContainer(availableContainers, userTier): ContainerInstance {
  // 对所有容器计算健康评分
  const scoredContainers = await Promise.all(
    availableContainers.map(async (container) => {
      const score = await this.calculateHealthScore(container)
      return { container, score: score.score }
    })
  )
  
  // VIP用户获得最高分容器
  if (userTier === 'vip') {
    return scoredContainers[0].container
  }
  
  // 非VIP从前3个中随机选择（负载均衡）
  const topCandidates = scoredContainers.slice(0, 3)
  return topCandidates[randomIndex].container
}
```

### 5.3 健康评分算法

**多维度评分**（满分100分）：
- 运行时间评分（0-25分）：新容器10分，稳定运行25分
- 内存使用评分（0-25分）：<50%得25分，>90%得0分
- 响应时间评分（0-25分）：<100ms得25分，>800ms得0分
- 错误率评分（0-25分）：无错误25分，>5%错误得0分

### 5.4 降级策略

当资源耗尽时的处理：

| 用户等级 | 降级行动 | 说明 |
|----------|----------|------|
| VIP | QUEUE_REQUEST | 排队等待 |
| PREMIUM | REDUCE_RESOURCES | 尝试回收资源 |
| REGULAR | QUEUE_REQUEST | 排队等待 |
| TRIAL | RETURN_ERROR | 直接拒绝 |

**代码**（schedulingPolicy.ts:751-764）：
```typescript
private determineFallbackAction(tier: UserTier): FallbackAction {
  switch (tier) {
    case UserTier.VIP:
      return FallbackAction.QUEUE_REQUEST
    case UserTier.PREMIUM:
      return FallbackAction.REDUCE_RESOURCES
    case UserTier.REGULAR:
      return FallbackAction.QUEUE_REQUEST
    case UserTier.TRIAL:
      return FallbackAction.RETURN_ERROR
  }
}
```

---

## 六、容器间通信方式（除端口映射外）

除了端口映射通信外， claw-web 还采用了以下多种容器间通信方式：

### 6.1 Docker 网络内部通信（容器名称解析）

**原理**：同一Docker网络内的容器可以通过容器名称直接通信，Docker内置DNS会自动解析。

**代码实现**（httpServer.ts:102-131）：
```typescript
/**
 * 代理请求到 Worker 容器
 * 使用 Docker 网络内部通信（通过容器名称）
 */
async function proxyToWorkerContainer(req: Request, containerName: string, path: string): Promise<Response> {
  // 在 Docker 网络中，使用容器名称 + 内部端口（3000）访问
  const targetUrl = `http://${containerName}:3000${path}`
  
  try {
    // 复制请求头
    const headers = new Headers(req.headers)
    headers.set('X-Forwarded-For', 'claw-web-master')
    headers.set('X-Proxy-Origin', 'claw-web-master')
    headers.set('Host', `${containerName}:3000`)
    
    // 转发请求
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    })
    return response
  }
}
```

**优势**：
- 无需端口映射，避免端口冲突
- 容器名称作为稳定的服务发现机制
- 通信在Docker网络内部完成，更安全

### 6.2 WebSocket 双向通信

**应用场景**：实时消息推送、PTY终端、流式响应

**代码实现**（wsBridge.ts）：
```typescript
// WebSocket RPC 通信协议
export interface WebSocketMessage {
  type: MessageType
  id?: string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
  // ...
}

// 消息类型包括：
// - rpc_call / rpc_response: RPC调用
// - user_message: 用户消息
// - tool_use / tool_result: 工具调用
// - streaming_chunk: 流式数据
// - ping / pong: 心跳检测
```

**特点**：
- 全双工通信，服务器可主动推送
- 支持RPC调用和事件流
- 自动重连和消息队列

### 6.3 共享卷（Volume）通信

**应用场景**：文件共享、工作空间持久化、会话数据存储

**代码实现**（containerOrchestrator.ts:497-508）：
```typescript
// 构建Docker运行命令（包含共享卷）
const dockerCmd = [
  'docker run -d',
  `--name ${containerName}`,
  ...resourceArgs,
  `-v claw-web_user-workspaces:/app/workspaces/users`,      // 用户工作空间
  `-v claw-web_session-workspaces:/app/workspaces/sessions`, // 会话工作空间
  '-e CONTAINER_ROLE=worker',
  // ...
].join(' ')
```

**共享卷类型**：
| 卷名称 | 用途 | 挂载点 |
|--------|------|--------|
| `claw-web_user-workspaces` | 用户持久化数据 | `/app/workspaces/users` |
| `claw-web_session-workspaces` | 会话临时数据 | `/app/workspaces/sessions` |

### 6.4 环境变量传递

**应用场景**：配置传递、密钥注入、用户上下文

**代码实现**（containerOrchestrator.ts:489-509）：
```typescript
const dockerCmd = [
  'docker run -d',
  `-e CONTAINER_ROLE=worker`,
  `-e NODE_ENV=production`,
  `-e TENANT_USER_ID=${userId}`,
  `-e WORKSPACE_BASE_DIR=/app/workspaces`,
  `-e USER_STORAGE_QUOTA_MB=${quota.storageQuotaMB}`,
  `-e USER_SESSION_LIMIT=${quota.maxSessions}`,
  `-e USER_PTY_LIMIT=${quota.maxPtyProcesses}`,
  `-e ANTHROPIC_AUTH_TOKEN=${process.env.ANTHROPIC_AUTH_TOKEN || ''}`,
  // ...
].join(' ')
```

### 6.5 数据库共享通信

**应用场景**：所有容器共享同一个MySQL数据库进行数据持久化

**代码实现**（containerOrchestrator.ts:328-332）：
```typescript
const dockerCmd = [
  'docker run -d',
  // 数据库连接信息（所有Worker共享同一个数据库）
  `-e DB_HOST=mysql`,
  `-e DB_PORT=3306`,
  `-e DB_USER=claude_user`,
  `-e DB_PASSWORD=userpassword123`,
  `-e DB_NAME=claude_code_haha`,
  // ...
].join(' ')
```

### 6.6 Nginx 反向代理（外部访问）

**应用场景**：为部署的项目提供外部域名访问

**代码实现**（reverseProxyService.ts:88-200）：
```typescript
async generateNginxConfig(config: ProxyConfig): Promise<string> {
  const { projectId, domain, workerPort, sslEnabled } = config
  
  // 构建上游服务器地址（Worker 容器的主端口）
  const upstreamServer = `http://localhost:${workerPort}`
  
  return `
upstream ${projectId}_backend {
    server ${upstreamServer};
    keepalive 32;
}

server {
    listen ${sslEnabled ? '443 ssl http2' : '80'};
    server_name ${domain};

    location / {
        proxy_pass ${upstreamServer};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
  `
}
```

### 6.7 通信方式对比

| 通信方式 | 使用场景 | 优点 | 缺点 |
|----------|----------|------|------|
| **Docker网络** | Master-Worker内部通信 | 无需端口映射，自动DNS解析 | 仅限同一Docker网络 |
| **端口映射** | 外部访问Worker | 可直接从宿主机访问 | 端口冲突风险 |
| **WebSocket** | 实时双向通信 | 全双工，服务器可推送 | 需要维护连接状态 |
| **共享卷** | 文件共享 | 数据持久化，高性能 | 并发写入需同步 |
| **环境变量** | 配置传递 | 简单直接 | 启动时固定，无法动态修改 |
| **数据库** | 数据共享 | 结构化数据，事务支持 | 需要数据库连接 |
| **Nginx代理** | 外部域名访问 | 支持SSL，负载均衡 | 需要额外配置 |

---

## 七、容器快照保存与恢复策略分析

### 7.1 当前实现方案

#### 7.1.1 快照数据结构

**数据库表结构**（add_work_snapshots.sql）：
```sql
CREATE TABLE IF NOT EXISTS work_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  container_id VARCHAR(64),
  snapshot_type ENUM('realtime', 'checkpoint', 'final'),
  workspace_path VARCHAR(512),
  workspace_size_bytes BIGINT,
  file_manifest JSON,        -- 文件清单（路径、校验和、修改时间）
  process_state JSON,        -- 运行中的进程状态
  git_state JSON,            -- Git状态
  execution_state JSON,      -- Agent执行状态
  compression_type ENUM('none', 'gzip', 'lz4') DEFAULT 'gzip',
  compressed_size_bytes BIGINT,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  restored_at TIMESTAMP
)
```

#### 7.1.2 快照创建流程

**代码实现**（workSnapshotService.ts:101-174）：
```typescript
async createSnapshot(options: CreateSnapshotOptions): Promise<WorkSnapshot> {
  const workspacePath = options.workspacePath || `/app/workspaces/sessions/${options.sessionId}`
  
  // 1. 收集文件清单（使用find + md5sum）
  const fileManifest = await this.collectFileManifest(workspacePath)
  
  // 2. 计算工作区大小
  const workspaceSizeBytes = await this.calculateWorkspaceSize(workspacePath)
  
  // 3. 收集进程状态（使用ps aux）
  let processState: RunningProcess[] | undefined
  if (options.includeProcessState) {
    processState = await this.collectProcessState()
  }
  
  // 4. 收集Git状态
  let gitState: GitState | undefined
  if (options.includeGitState) {
    gitState = await this.collectGitState(workspacePath)
  }
  
  // 5. 保存到数据库
  await pool.execute(
    `INSERT INTO work_snapshots (...) VALUES (...)`,
    [snapshotId, userId, sessionId, ...]
  )
}
```

#### 7.1.3 当前方案的局限性

| 问题 | 说明 | 影响 |
|------|------|------|
| **仅保存元数据** | 只保存文件清单和校验和，不保存实际文件内容 | 容器销毁后无法恢复文件 |
| **无实际恢复逻辑** | snapshot.routes.ts:270-278 显示恢复功能待实现 | 快照无法实际使用 |
| **进程状态不完整** | 仅保存进程列表，无法恢复进程状态 | 无法恢复运行中的任务 |
| **存储在数据库** | JSON数据存储在MySQL，不适合大文件 | 性能瓶颈 |
| **无增量备份** | 每次全量扫描文件 | 效率低下 |
| **无压缩存储** | 文件内容未压缩存储 | 占用空间大 |

### 7.2 改进方案建议

#### 方案一：Docker 原生 Checkpoint（推荐用于进程状态）

**原理**：使用 Docker Checkpoint 功能，基于 CRIU 实现容器热迁移

**优点**：
- 完整保存容器状态（内存、进程、文件描述符）
- 原生支持，无需额外开发
- 恢复后容器状态完全一致

**缺点**：
- 需要 Linux 内核支持 CRIU
- 文件系统需要单独处理
- 快照文件较大

**实现代码示例**：
```typescript
class DockerCheckpointService {
  /**
   * 创建容器检查点
   */
  async createCheckpoint(containerId: string, checkpointName: string): Promise<string> {
    try {
      // 使用 docker checkpoint 命令
      const { stdout } = await execAsync(
        `docker checkpoint create --checkpoint-dir=/var/lib/docker/checkpoints ${containerId} ${checkpointName}`
      )
      
      // 同时打包文件系统
      await this.createVolumeSnapshot(containerId, checkpointName)
      
      return checkpointName
    } catch (error) {
      logger.error(`[Checkpoint] 创建检查点失败:`, error)
      throw error
    }
  }
  
  /**
   * 从检查点恢复容器
   */
  async restoreFromCheckpoint(checkpointName: string, newContainerName: string): Promise<string> {
    try {
      // 先恢复文件系统
      await this.restoreVolumeSnapshot(checkpointName, newContainerName)
      
      // 使用 checkpoint 恢复容器
      const { stdout } = await execAsync(
        `docker create --name ${newContainerName} ` +
        `--checkpoint ${checkpointName} ` +
        `--checkpoint-dir=/var/lib/docker/checkpoints ` +
        `claw-web-backend-worker:latest`
      )
      
      await execAsync(`docker start ${newContainerName}`)
      
      return stdout.trim()
    } catch (error) {
      logger.error(`[Checkpoint] 恢复检查点失败:`, error)
      throw error
    }
  }
}
```

#### 方案二：文件系统级快照（推荐用于文件数据）

**原理**：使用 rsync + tar 增量备份，配合对象存储

**架构设计**：
```
┌─────────────────────────────────────────────────────────────┐
│                     快照创建流程                              │
├─────────────────────────────────────────────────────────────┤
│  1. 扫描文件变更（rsync --dry-run）                           │
│  2. 增量备份变更文件（rsync -avz）                            │
│  3. 打包为元数据 + 数据文件（tar）                             │
│  4. 上传到对象存储（S3/MinIO）                                │
│  5. 数据库记录快照元数据                                       │
└─────────────────────────────────────────────────────────────┘
```

**实现代码示例**：
```typescript
class FileSystemSnapshotService {
  private s3Client: S3Client
  private readonly SNAPSHOT_BUCKET = 'claw-web-snapshots'
  
  /**
   * 创建增量快照
   */
  async createIncrementalSnapshot(
    containerId: string,
    sessionId: string,
    baseSnapshotId?: string
  ): Promise<SnapshotInfo> {
    const snapshotId = uuidv4()
    const workspacePath = `/app/workspaces/sessions/${sessionId}`
    const tempDir = `/tmp/snapshots/${snapshotId}`
    
    try {
      // 1. 创建临时目录
      await execAsync(`mkdir -p ${tempDir}`)
      
      // 2. 如果有基础快照，下载基础文件
      if (baseSnapshotId) {
        await this.downloadBaseSnapshot(baseSnapshotId, tempDir)
      }
      
      // 3. 使用 rsync 进行增量备份
      const rsyncCmd = baseSnapshotId
        ? `rsync -avz --compare-dest=${tempDir}/base/ ${workspacePath}/ ${tempDir}/delta/`
        : `rsync -avz ${workspacePath}/ ${tempDir}/full/`
      
      await execAsync(rsyncCmd, { timeout: 120000 })
      
      // 4. 压缩打包
      const tarPath = `${tempDir}.tar.gz`
      await execAsync(
        `tar -czf ${tarPath} -C ${tempDir} .`,
        { timeout: 60000 }
      )
      
      // 5. 上传到 S3
      const s3Key = `snapshots/${sessionId}/${snapshotId}.tar.gz`
      await this.uploadToS3(tarPath, s3Key)
      
      // 6. 计算校验和
      const { stdout: checksum } = await execAsync(`md5sum ${tarPath}`)
      
      // 7. 保存元数据到数据库
      const snapshotInfo: SnapshotInfo = {
        id: snapshotId,
        sessionId,
        containerId,
        baseSnapshotId,
        s3Key,
        checksum: checksum.split(' ')[0],
        sizeBytes: (await fs.stat(tarPath)).size,
        createdAt: new Date()
      }
      
      await this.saveSnapshotMetadata(snapshotInfo)
      
      return snapshotInfo
    } finally {
      // 清理临时文件
      await execAsync(`rm -rf ${tempDir} ${tempDir}.tar.gz`)
    }
  }
  
  /**
   * 恢复快照
   */
  async restoreSnapshot(
    snapshotId: string,
    targetContainerId: string
  ): Promise<void> {
    const snapshot = await this.getSnapshotMetadata(snapshotId)
    const tempDir = `/tmp/restore/${snapshotId}`
    const workspacePath = `/app/workspaces/sessions/${snapshot.sessionId}`
    
    try {
      // 1. 创建临时目录
      await execAsync(`mkdir -p ${tempDir}`)
      
      // 2. 从 S3 下载快照
      const tarPath = `${tempDir}/snapshot.tar.gz`
      await this.downloadFromS3(snapshot.s3Key, tarPath)
      
      // 3. 校验文件完整性
      const { stdout: checksum } = await execAsync(`md5sum ${tarPath}`)
      if (checksum.split(' ')[0] !== snapshot.checksum) {
        throw new Error('快照文件校验失败')
      }
      
      // 4. 解压到目标容器
      await execAsync(
        `docker cp ${tarPath} ${targetContainerId}:/tmp/restore.tar.gz`
      )
      
      // 5. 在容器内解压
      await execAsync(
        `docker exec ${targetContainerId} bash -c 