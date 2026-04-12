# 后端容器化多用户隔离方案

## 📋 项目背景与现状分析

### 当前架构特点
- **单体后端服务**：所有用户共享同一个后端容器（claude-backend）
- **软件层面隔离**：通过 TenantIsolationMiddleware 实现用户身份验证和上下文绑定
- **文件系统隔离**：每个用户拥有独立的工作目录 `/app/workspaces/users/{userId}`
- **资源配额管理**：
  - 存储配额：500MB/用户
  - 会话限制：10个/用户
  - PTY进程：5个/用户
  - 文件数量：1000个/用户
- **技术栈**：Bun运行时 + MySQL + WebSocket
- **资源限制**：内存512MB，CPU 1核

### 现有优势
✅ 已实现基础的租户隔离中间件  
✅ 用户资源配额管理系统完善  
✅ 工作空间管理器支持多用户目录结构  
✅ 安全配置（非root用户运行、路径遍历防护）  

### 现有局限性
⚠️ 所有用户共享同一进程，存在资源竞争风险  
⚠️ 单点故障影响所有用户  
⚠️ 无法针对不同用户级别提供差异化资源配置  
⚠️ 内存泄漏或性能问题会影响全局  
⚠️ 扩展性受限，难以应对高并发场景  

---

## 🎯 方案目标

### 核心目标
1. **强隔离性**：实现进程级/容器级用户隔离，防止单用户故障扩散
2. **高性能**：最小化容器启动延迟，优化资源利用率
3. **内存优化**：智能内存管理，避免OOM（Out of Memory）
4. **高稳定性**：自动故障恢复、健康检查、优雅降级
5. **可扩展性**：支持水平扩展，适应不同规模的用户量

---

## 🏗️ 推荐方案：混合式容器池化架构（Hybrid Container Pooling）

### 架构概述

采用**主服务 + 用户容器池**的混合架构：

```
┌─────────────────────────────────────────────────────────────┐
│                    Nginx 反向代理 (负载均衡)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────┐    ┌─────────────────────┐
│   API Gateway    │    │   WebSocket Gateway  │
│  (认证/路由/限流) │    │  (连接管理/消息路由)  │
└────────┬────────┘    └──────────┬──────────┘
         │                       │
         └───────────┬───────────┘
                     ▼
        ┌────────────────────────┐
        │   主控制服务 (Master)    │
        │  - 用户管理             │
        │  - 容器调度器           │
        │  - 资源监控            │
        │  - 配置中心            │
        └─────────┬──────────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ User C1 │ │ User C2 │ │ User C3 │  ← 热容器池（预启动）
│(空闲)   │ │(活跃)   │ │(预热)   │
└─────────┘ └─────────┘ └─────────┘
      │           │
      ▼           ▼
┌─────────┐ ┌─────────┐
│ User C4 │ │ User C5 │  ← 冷容器（按需启动）
│(新建)   │ │(新建)   │
└─────────┘ └─────────┘
```

### 三种容器模式对比

| 特性 | 共享模式（当前） | 每用户容器 | 容器池化（推荐） |
|------|------------------|------------|------------------|
| **隔离强度** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **内存效率** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **启动速度** | N/A | ⭐⭐ | ⭐⭐⭐⭐ |
| **资源利用率** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **故障隔离** | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **运维复杂度** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **适用场景** | 开发/测试 | 高安全要求 | 生产环境推荐 |

---

## 📦 详细实施方案

### 阶段一：基础设施层改造（1-2周）

#### 1.1 引入 Docker-in-Docker 或 Sidecar 模式

**方案选择：Sidecar 模式（推荐）**

原因：
- ✅ 无需特权模式，安全性更高
- ✅ 与 Kubernetes 兼容性好
- ✅ 资源管理更精细
- ✅ 易于调试和监控

**实施步骤：**

1. **修改 docker-compose.yml**，添加容器调度服务

```yaml
services:
  # 主控制服务（保持现有功能）
  backend-master:
    build:
      context: .
      dockerfile: server/Dockerfile.master
    container_name: claude-backend-master
    environment:
      - ROLE=master
      - CONTAINER_POOL_SIZE=${CONTAINER_POOL_SIZE:-5}
      - MAX_CONTAINERS=${MAX_CONTAINERS:-50}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Docker socket挂载
      - user_workspaces:/app/workspaces/users
    deploy:
      resources:
        limits:
          memory: 768M
          cpus: '1.5'

  # 用户容器池模板（不直接启动，用于克隆）
  backend-worker-template:
    build:
      context: .
      dockerfile: server/Dockerfile.worker
    container_name: claude-worker-template
    entrypoint: ["tail", "-f", "/dev/null"]  # 保持运行但不执行业务
```

#### 1.2 创建 Worker 容器 Dockerfile

```dockerfile
# server/Dockerfile.worker
FROM oven/bun:1 AS worker

RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update && apt-get install -y \
    default-mysql-client \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json ./
ENV BUN_CONFIG_REGISTRY=https://registry.npmmirror.com
RUN bun install

COPY server/ .
RUN echo "# Environment set by container orchestrator" > .env

ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Asia/Shanghai \
    NODE_OPTIONS="--max-old-space-size=256 \
                 --optimize-for-size" \
    UV_THREADPOOL_SIZE=2 \
    TENANT_ISOLATION_ENABLED=true \
    MAX_USERS=1 \  # 每个容器只服务1个用户
    USER_STORAGE_QUOTA_MB=200 \
    USER_SESSION_LIMIT=5 \
    USER_PTY_LIMIT=2

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

USER bun

CMD ["bun", "--bun", "run", "src/index.ts"]
```

**关键优化点：**
- 内存限制降至256MB（单用户场景）
- 减少线程池大小（UV_THREADPOOL_SIZE=2）
- 降低单用户资源配额（更精细的控制）

---

### 阶段二：容器编排系统开发（2-3周）

#### 2.1 容器调度器（Container Orchestrator）

**核心模块：`server/src/orchestrator/containerOrchestrator.ts`**

```typescript
/**
 * ContainerOrchestrator - 容器编排调度器
 * 
 * 功能：
 * - 容器生命周期管理（创建/启动/停止/销毁）
 * - 热容器池维护（预启动、预热、回收）
 * - 用户到容器的映射管理
 * - 资源分配与回收
 * - 健康检查与故障转移
 */
```

**主要功能：**

1. **热容器池管理（Warm Pool）**
```typescript
class WarmPoolManager {
  private availableContainers: ContainerInstance[] = []
  private poolSize: number = 5  // 默认保持5个热容器
  
  /**
   * 预启动容器并加入热池
   */
  async prewarmContainer(): Promise<ContainerInstance>
  
  /**
   * 从热池获取可用容器
   */
  async acquireContainer(userId: string): Promise<ContainerInstance>
  
  /**
   * 归还容器到热池（清理用户数据后）
   */
  async releaseContainer(containerId: string): Promise<void>
  
  /**
   * 定期清理超时的空闲容器
   */
  startIdleCleanup(intervalMs: number = 300000): void  // 5分钟
}
```

2. **用户-容器映射表**
```typescript
interface UserContainerMapping {
  userId: string
  containerId: string
  containerPort: number  // 映射到宿主机端口
  status: 'active' | 'idle' | 'starting' | 'stopping'
  assignedAt: Date
  lastActivityAt: Date
  resourceUsage: {
    memoryMB: number
    cpuPercent: number
    sessionCount: number
  }
}
```

3. **智能调度策略**
```typescript
class SchedulingPolicy {
  /**
   * 根据用户等级选择调度策略
   * - VIP用户：独占容器，不回收
   * - 普通用户：共享容器池，空闲超时回收
   * - 新用户：优先使用热容器
   */
  async scheduleContainer(userTier: 'vip' | 'regular' | 'new'): Promise<SchedulingResult>
  
  /**
   * 资源不足时的降级策略
   * - 回收最长时间未活动的普通用户容器
   * - 限制新用户创建会话
   * - 返回友好错误提示
   */
  handleResourceExhaustion(): MitigationAction
}
```

#### 2.2 资源监控系统

**模块：`server/src/monitoring/resourceMonitor.ts`（增强版）**

```typescript
/**
 * EnhancedResourceMonitor - 增强型资源监控器
 * 
 * 监控维度：
 * - 容器级：CPU、内存、网络I/O
 * - 用户级：会话数、存储使用、请求频率
 * - 系统级：总容量、利用率趋势
 */
```

**关键指标：**
- 实时内存使用率（告警阈值：85%）
- 容器响应时间（P99 < 500ms）
- 容器启动成功率（>99%）
- 热容器池命中率（目标 > 80%）

---

### 阶段三：API网关与路由改造（1-2周）

#### 3.1 请求路由层

**修改 `server/src/server/httpServer.ts`**

```typescript
/**
 * 增强的HTTP服务器，支持动态路由到用户容器
 */
class EnhancedHttpServer {
  private orchestrator: ContainerOrchestrator
  
  /**
   * 请求路由逻辑：
   * 1. 提取用户身份（JWT验证）
   * 2. 查询用户对应的容器
   * 3. 若无容器，从热池分配或创建新的
   * 4. 反向代理请求到目标容器
   * 5. 返回响应给客户端
   */
  async routeRequest(request: Request): Promise<Response>
}
```

#### 3.2 WebSocket连接管理

**修改 `server/src/websocket/wsMessageRouter.ts`**

```typescript
/**
 * 支持WebSocket连接到用户专属容器
 * 
 * 实现方式：
 * - 主服务维护WebSocket连接列表
 * - 消息根据userId转发到对应容器
 * - 容器故障时自动重连
 */
class WsConnectionManager {
  private userConnections: Map<string, WebSocket[]> = new Map()
  
  /**
   * 建立用户WebSocket连接
   */
  async connectUserWebSocket(userId: string, ws: WebSocket): Promise<void>
  
  /**
   * 转发消息到用户容器
   */
  async forwardToContainer(userId: string, message: any): Promise<void>
}
```

---

### 阶段四：性能优化与稳定性保障（持续进行）

#### 4.1 内存优化策略

**A. 分级内存配置**

| 用户等级 | 容器内存限制 | V8堆内存 | 最大会话数 | 存储配额 |
|---------|-------------|----------|-----------|---------|
| VIP     | 512MB       | 384MB    | 15        | 1GB     |
| 普通    | 256MB       | 192MB    | 8         | 500MB   |
| 体验    | 128MB       | 96MB     | 3         | 200MB   |

**B. 智能GC（垃圾回收）策略**

```typescript
/**
 * MemoryOptimizer - 内存优化器
 * 
 * 策略：
 * 1. 监控内存使用率
 * 2. 达到70%时触发增量GC
 * 3. 达到85%时触发全量GC
 * 4. 达到95%时强制释放缓存
 * 5. 触发容器回收机制
 */
class MemoryOptimizer {
  /**
   * 根据内存压力调整GC策略
   */
  adjustGCPolicy(memoryPressure: number): GCStrategy
  
  /**
   * 清理非关键缓存
   */
  evictCaches(priority: 'low' | 'medium' | 'high'): void
}
```

**C. 会话数据卸载**

- 活跃会话保留在内存
- 不活跃会话（>30分钟无操作）持久化到MySQL
- 容器重启时从数据库恢复必要状态

#### 4.2 启动时间优化

**冷启动优化目标：< 3秒**

1. **镜像分层优化**
```dockerfile
# 将依赖层单独缓存
FROM oven/bun:1 AS deps
WORKDIR /app
COPY server/package.json ./
RUN bun install

# 运行时代码层
FROM oven/bun:1 AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY server/ .
```

2. **Init进程轻量化**
- 延迟加载非必需模块
- 异步初始化数据库连接池
- 预热关键代码路径（JIT编译）

3. **Checkpoint/Restore 技术（进阶）**
- 使用 CRIU（Checkpoint/Restore In Userspace）
- 快速恢复已 checkpoint 的容器状态
- 适用场景：批量创建用户容器

#### 4.3 故障恢复机制

**A. 自动健康检查**

```yaml
# docker-compose.yml增强配置
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 15s
  timeout: 5s
  retries: 3
  start_period: 10s
```

**B. 自动重启策略**

```yaml
deploy:
  restart_policy:
    condition: on-failure
    delay: 5s
    max_attempts: 3
    window: 120s
```

**C. 数据持久化保障**

- 用户工作目录使用Docker volume
- 定期快照（每5分钟）
- MySQL binlog开启，支持PITR（Point-in-Time Recovery）

#### 4.4 限流与熔断

**A. 用户级别限流**

```typescript
/**
 * RateLimiter - 令牌桶算法实现
 * 
 * 限制维度：
 * - API请求频率：100次/分钟/用户
 * - WebSocket消息频率：50条/秒/用户
 * - 文件上传频率：10次/分钟/用户
 * - 会话创建频率：5次/小时/用户
 */
class RateLimiter {
  /**
   * 检查是否允许请求
   */
  async checkRateLimit(userId: string, action: string): Promise<RateLimitResult>
}
```

**B. 熔断机制**

```typescript
/**
 * CircuitBreaker - 熔断器
 * 
 * 状态机：
 * CLOSED（正常）→ OPEN（熔断）→ HALF_OPEN（半开）→ CLOSED
 * 
 * 触发条件：
 * - 连续5次失败
 * - 错误率超过50%（滑动窗口1分钟）
 * - 响应时间P99超过5秒
 */
class CircuitBreaker {
  /**
   * 执行带熔断保护的操作
   */
  async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T>
}
```

---

## 🔧 实施路线图

### 第一阶段：基础搭建（第1-2周）
- [ ] 创建Worker容器Dockerfile
- [ ] 实现基础容器编排器（创建/删除/启停）
- [ ] 修改docker-compose.yml添加master-worker架构
- [ ] 实现简单的用户-容器映射
- [ ] 基础测试：手动创建用户容器并验证隔离性

### 第二阶段：池化与调度（第3-4周）
- [ ] 实现热容器池管理（预启动、获取、归还）
- [ ] 实现智能调度算法（用户等级、资源状况）
- [ ] 添加资源监控仪表盘API
- [ ] 性能测试：压测容器启动时间和并发能力
- [ ] 优化：调整池大小、预热策略

### 第三阶段：路由与网关（第5-6周）
- [ ] 实现API网关反向代理功能
- [ ] 改造WebSocket路由支持多容器
- [ ] 添加请求追踪（Trace ID）
- [ ] 集成限流和熔断组件
- [ ] 端到端测试：完整用户流程验证

### 第四阶段：优化与稳定（第7-8周）
- [ ] 内存优化：分级配置、智能GC
- [ ] 启动优化：镜像瘦身、懒加载
- [ ] 故障恢复：自动重启、数据备份
- [ ] 监控告警：Prometheus + Grafana集成
- [ ] 压力测试：模拟100+并发用户
- [ ] 文档编写：运维手册、故障排查指南

---

## 📊 资源需求评估

### 最小配置（支持50并发用户）

| 组件 | 实例数 | 内存/实例 | CPU/实例 | 总内存 | 总CPU |
|------|--------|----------|----------|--------|-------|
| Master服务 | 1 | 768MB | 1.5核 | 768MB | 1.5核 |
| MySQL | 1 | 256MB | 0.5核 | 256MB | 0.5核 |
| 热容器池 | 5 | 256MB | 0.5核 | 1280MB | 2.5核 |
| 用户容器（活跃） | 20 | 256MB | 0.5核 | 5120MB | 10核 |
| Nginx | 1 | 64MB | 0.25核 | 64MB | 0.25核 |
| **总计** | | | | **~7.5GB** | **~14.75核** |

### 推荐配置（支持200并发用户）

| 组件 | 实例数 | 内存/实例 | CPU/实例 | 总内存 | 总CPU |
|------|--------|----------|----------|--------|-------|
| Master服务 | 1 | 1024MB | 2核 | 1GB | 2核 |
| MySQL | 1 | 512MB | 1核 | 512MB | 1核 |
| 热容器池 | 10 | 256MB | 0.5核 | 2.56GB | 5核 |
| 用户容器（活跃） | 80 | 256MB | 0.5核 | 20.48GB | 40核 |
| Nginx | 1 | 128MB | 0.5核 | 128MB | 0.5核 |
| 监控服务 | 1 | 256MB | 0.5核 | 256MB | 0.5核 |
| **总计** | | | | **~25GB** | **49核** |

---

## ⚠️ 风险与应对措施

### 技术风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| Docker socket权限问题 | 无法创建容器 | 中 | 使用非特权模式 + Rootless Docker |
| 容器启动过慢 | 用户体验差 | 高 | 热池预热 + Checkpoint技术 |
| 内存碎片化 | OOM kill | 中 | 定期重启容器 + 内存整理 |
| 网络端口耗尽 | 新容器无法暴露 | 低 | 使用Docker网络proxy或内部代理 |
| 数据一致性 | 用户数据丢失 | 低 | 定期备份 + 事务保证 |

### 业务风险

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|----------|
| 迁移期间服务中断 | 用户投诉 | 中 | 蓝绿部署 + 灰度发布 |
| 学习成本高 | 团队效率下降 | 低 | 详细文档 + 培训 |
| 运维复杂度增加 | 故障排查困难 | 中 | 完善监控 + 自动化脚本 |

---

## 🎯 成功指标

### 性能指标
- **容器启动时间**：< 3秒（热池命中）/< 8秒（冷启动）
- **API响应时间**：P50 < 100ms, P99 < 500ms
- **并发支持**：200+用户同时在线
- **内存利用率**：70-85%（高效但不危险）

### 稳定性指标
- **服务可用性**：99.9%（月停机时间 < 43分钟）
- **故障恢复时间**（MTTR）：< 5分钟
- **数据丢失率**：0（通过备份保证）
- **容器崩溃率**：< 0.1%/天

### 隔离性指标
- **用户间干扰**：0（完全隔离）
- **故障扩散范围**：单用户（不影响其他用户）
- **资源公平性**：偏差 < ±10%

---

## 📝 总结与建议

### 为什么推荐混合式容器池化架构？

1. **平衡了隔离性与资源效率**
   - 相比纯每用户容器方案，节省60-70%内存
   - 相比纯共享方案，隔离性强得多

2. **兼顾性能与成本**
   - 热容器池保证大部分请求快速响应
   - 按需扩缩容，避免资源浪费

3. **渐进式演进路径**
   - 可先在部分用户中试点
   - 逐步扩大范围，降低风险
   - 与现有架构兼容，可回滚

4. **生产级可靠性**
   - 多层故障恢复机制
   - 完善的监控告警体系
   - 自动化运维减少人为失误

### 下一步行动建议

1. **立即开始**：创建PoC（概念验证），验证核心技术可行性
2. **两周内**：完成基础容器编排功能，在测试环境验证
3. **一个月内**：实现热池功能，进行小规模用户测试
6. **两个月内**：全面上线，持续优化调优

---

**文档版本**: v1.0  
**最后更新**: 2026-04-12  
**作者**: AI Assistant  
**审核状态**: 待审核
