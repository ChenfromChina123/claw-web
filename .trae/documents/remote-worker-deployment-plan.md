# 远程 Worker 部署功能计划文档

## 1. 需求概述

### 1.1 目标
实现 Master 自动将 Worker 组件部署到远程服务器的功能，用户只需提供：
- 服务器 IP 地址
- SSH 用户名
- SSH 密码

### 1.2 关键要求
1. **Master 不关闭远程 Worker**：远程 Worker 由 Master 部署后，Master 不应主动关闭它
2. **宽松的健康检查**：远程 Worker 的健康检查策略需要更宽松
3. **环境自动检查**：部署前自动检查远程服务器环境是否满足要求

## 2. 现有架构分析

### 2.1 当前架构
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │───▶│   Master    │───▶│    MySQL    │
│  (Nginx:80) │    │ (Bun:3000)  │    │   (3306)    │
└─────────────┘    └──────┬──────┘    └─────────────┘
                          │
                    ┌─────┴─────┐
                    │ Worker ×N │  ← 本地 Docker 容器
                    │(Node:4000)│
                    └───────────┘
```

### 2.2 核心组件
- **ContainerOrchestrator** (`server/src/master/orchestrator/containerOrchestrator.ts`)：容器编排调度器
- **ContainerLifecycle** (`server/src/master/orchestrator/containerLifecycle.ts`)：容器生命周期管理
- **HealthMonitor** (`server/src/master/orchestrator/healthMonitor.ts`)：健康检查监控
- **WorkerDeploymentClient** (`server/src/master/integrations/workerDeploymentClient.ts`)：Worker 部署客户端

### 2.3 Master-Worker 通信
- Master 通过 HTTP API (`/internal/*`) 与 Worker 通信
- 使用 `X-Master-Token` 进行认证
- Worker 运行在 Docker 容器中，端口映射到宿主机

## 3. 远程 Worker 部署方案

### 3.1 新架构设计
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │───▶│   Master    │───▶│    MySQL    │
│  (Nginx:80) │    │ (Bun:3000)  │    │   (3306)    │
└─────────────┘    └──────┬──────┘    └─────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
    │ Local     │   │ Remote    │   │ Remote    │
    │ Worker 1  │   │ Worker 2  │   │ Worker 3  │
    │(Docker)   │   │(SSH部署)  │   │(SSH部署)  │
    └───────────┘   └───────────┘   └───────────┘
```

### 3.2 部署流程

```
用户请求部署远程 Worker
        │
        ▼
┌───────────────────┐
│ 1. 环境预检查      │ ← 检查远程服务器是否满足条件
│    - Docker 安装   │
│    - 端口可用性    │
│    - 系统资源      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 2. SSH 连接建立    │ ← 使用 node-ssh 库
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 3. 传输部署文件    │ ← Dockerfile、docker-compose.yml、启动脚本
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 4. 构建 Worker 镜像│ ← 在远程服务器上执行 docker build
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 5. 启动 Worker 容器│ ← docker run
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 6. 注册到 Master   │ ← Worker 启动后向 Master 注册
└─────────┬─────────┘
          │
          ▼
    部署完成
```

## 4. 实现计划

### 4.1 新增模块

#### 4.1.1 RemoteWorkerDeployer (`server/src/master/orchestrator/remoteWorkerDeployer.ts`)
负责远程 Worker 的部署逻辑：
- SSH 连接管理
- 环境检查
- 文件传输
- 远程命令执行
- 部署状态跟踪

#### 4.1.2 RemoteWorkerRegistry (`server/src/master/orchestrator/remoteWorkerRegistry.ts`)
管理远程 Worker 的注册和发现：
- 远程 Worker 信息存储
- 健康检查（宽松模式）
- 负载均衡策略

#### 4.1.3 EnvironmentChecker (`server/src/master/orchestrator/environmentChecker.ts`)
远程服务器环境检查：
- Docker 版本检查
- 系统资源检查（CPU、内存、磁盘）
- 网络连通性检查
- 端口可用性检查

### 4.2 修改现有模块

#### 4.2.1 ContainerOrchestrator
- 添加远程 Worker 支持
- 区分本地 Worker 和远程 Worker
- 路由请求到正确的 Worker

#### 4.2.2 HealthMonitor
- 添加远程 Worker 健康检查模式
- 更宽松的检查策略（更长的超时、更少的重试）
- 不自动关闭远程 Worker（只标记状态）

#### 4.2.3 类型定义 (`server/src/master/orchestrator/types.ts`)
- 添加远程 Worker 相关类型
- 添加部署配置类型

### 4.3 API 设计

#### 4.3.1 部署远程 Worker
```typescript
POST /api/admin/remote-workers/deploy
{
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "password": "password",
  "workerPort": 4000,        // Worker 服务端口
  "labels": {                // 可选标签
    "region": "beijing",
    "type": "gpu"
  }
}

Response:
{
  "success": true,
  "data": {
    "workerId": "remote-worker-xxx",
    "status": "deploying",
    "host": "192.168.1.100",
    "port": 4000,
    "progress": [
      { "step": "env_check", "status": "completed", "message": "环境检查通过" },
      { "step": "ssh_connect", "status": "completed", "message": "SSH连接成功" },
      { "step": "file_transfer", "status": "in_progress", "message": "传输部署文件中..." }
    ]
  }
}
```

#### 4.3.2 获取部署状态
```typescript
GET /api/admin/remote-workers/:workerId/status

Response:
{
  "success": true,
  "data": {
    "workerId": "remote-worker-xxx",
    "status": "running",  // deploying | running | error | offline
    "host": "192.168.1.100",
    "port": 4000,
    "lastHeartbeat": "2024-01-15T10:30:00Z",
    "health": {
      "status": "healthy",
      "checks": {
        "connectivity": true,
        "docker": true,
        "disk": true
      }
    }
  }
}
```

#### 4.3.3 列出所有远程 Worker
```typescript
GET /api/admin/remote-workers

Response:
{
  "success": true,
  "data": {
    "workers": [
      {
        "workerId": "remote-worker-xxx",
        "status": "running",
        "host": "192.168.1.100",
        "port": 4000,
        "labels": { "region": "beijing" },
        "createdAt": "2024-01-15T10:00:00Z"
      }
    ]
  }
}
```

#### 4.3.4 预检查环境
```typescript
POST /api/admin/remote-workers/precheck
{
  "host": "192.168.1.100",
  "port": 22,
  "username": "root",
  "password": "password",
  "workerPort": 4000
}

Response:
{
  "success": true,
  "data": {
    "passed": true,
    "checks": [
      { "name": "ssh_connectivity", "passed": true, "message": "SSH连接正常" },
      { "name": "docker_installed", "passed": true, "message": "Docker版本 24.0.7" },
      { "name": "docker_running", "passed": true, "message": "Docker服务运行中" },
      { "name": "port_available", "passed": true, "message": "端口 4000 可用" },
      { "name": "disk_space", "passed": true, "message": "磁盘空间充足 (50GB可用)" },
      { "name": "memory", "passed": true, "message": "内存充足 (8GB可用)" }
    ]
  }
}
```

### 4.4 数据库表设计

```sql
-- 远程 Worker 表
CREATE TABLE remote_workers (
  id VARCHAR(64) PRIMARY KEY,
  host VARCHAR(255) NOT NULL,
  port INT NOT NULL DEFAULT 4000,
  ssh_port INT NOT NULL DEFAULT 22,
  ssh_username VARCHAR(255) NOT NULL,
  -- 密码加密存储
  ssh_password_encrypted TEXT,
  status ENUM('deploying', 'running', 'error', 'offline', 'removing') DEFAULT 'deploying',
  labels JSON,
  last_heartbeat TIMESTAMP NULL,
  health_status ENUM('healthy', 'unhealthy', 'unknown') DEFAULT 'unknown',
  docker_version VARCHAR(50),
  system_info JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_health (health_status)
);

-- 远程 Worker 部署日志表
CREATE TABLE remote_worker_deploy_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  worker_id VARCHAR(64) NOT NULL,
  step VARCHAR(100) NOT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending',
  message TEXT,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worker_id) REFERENCES remote_workers(id) ON DELETE CASCADE,
  INDEX idx_worker_id (worker_id)
);
```

## 5. 详细实现步骤

### 5.1 第一阶段：基础架构

#### 5.1.1 创建远程 Worker 类型定义
**文件**: `server/src/master/orchestrator/types.ts`

添加以下内容：
```typescript
/**
 * 远程 Worker 实例信息
 */
export interface RemoteWorkerInstance {
  /** Worker ID */
  workerId: string
  /** 远程主机地址 */
  host: string
  /** Worker 服务端口 */
  port: number
  /** SSH 端口 */
  sshPort: number
  /** SSH 用户名 */
  sshUsername: string
  /** 状态 */
  status: 'deploying' | 'running' | 'error' | 'offline' | 'removing'
  /** 健康状态 */
  healthStatus: 'healthy' | 'unhealthy' | 'unknown'
  /** 标签 */
  labels?: Record<string, string>
  /** 最后心跳时间 */
  lastHeartbeatAt?: Date
  /** Docker 版本 */
  dockerVersion?: string
  /** 系统信息 */
  systemInfo?: {
    os?: string
    arch?: string
    cpuCores?: number
    memoryGB?: number
    diskGB?: number
  }
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 远程 Worker 部署配置
 */
export interface RemoteWorkerDeployConfig {
  /** 远程主机地址 */
  host: string
  /** SSH 端口 */
  sshPort?: number
  /** SSH 用户名 */
  username: string
  /** SSH 密码 */
  password: string
  /** Worker 服务端口 */
  workerPort?: number
  /** 标签 */
  labels?: Record<string, string>
}

/**
 * 环境检查结果
 */
export interface EnvironmentCheckResult {
  /** 是否通过 */
  passed: boolean
  /** 检查项列表 */
  checks: Array<{
    name: string
    passed: boolean
    message: string
    details?: any
  }>
}

/**
 * 部署进度项
 */
export interface DeployProgressItem {
  step: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  message: string
  timestamp: Date
}
```

#### 5.1.2 创建环境检查器
**文件**: `server/src/master/orchestrator/environmentChecker.ts`

```typescript
/**
 * 远程服务器环境检查器
 * 
 * 功能：
 * - 检查远程服务器是否满足 Worker 部署条件
 * - 检查 Docker 安装和运行状态
 * - 检查系统资源（CPU、内存、磁盘）
 * - 检查端口可用性
 */

import { NodeSSH } from 'node-ssh'
import type { EnvironmentCheckResult } from './types'

export class EnvironmentChecker {
  /**
   * 执行完整的环境检查
   */
  async checkEnvironment(
    host: string,
    port: number,
    username: string,
    password: string,
    workerPort: number
  ): Promise<EnvironmentCheckResult> {
    const checks: EnvironmentCheckResult['checks'] = []
    let passed = true

    const ssh = new NodeSSH()

    try {
      // 1. SSH 连接检查
      try {
        await ssh.connect({ host, port, username, password })
        checks.push({
          name: 'ssh_connectivity',
          passed: true,
          message: `SSH连接成功 (${username}@${host}:${port})`
        })
      } catch (error) {
        checks.push({
          name: 'ssh_connectivity',
          passed: false,
          message: `SSH连接失败: ${error instanceof Error ? error.message : '未知错误'}`
        })
        passed = false
        return { passed, checks }
      }

      // 2. Docker 安装检查
      const dockerVersionResult = await ssh.execCommand('docker --version')
      if (dockerVersionResult.code === 0) {
        checks.push({
          name: 'docker_installed',
          passed: true,
          message: `Docker已安装: ${dockerVersionResult.stdout.trim()}`
        })
      } else {
        checks.push({
          name: 'docker_installed',
          passed: false,
          message: 'Docker未安装'
        })
        passed = false
      }

      // 3. Docker 运行状态检查
      const dockerInfoResult = await ssh.execCommand('docker info')
      if (dockerInfoResult.code === 0) {
        checks.push({
          name: 'docker_running',
          passed: true,
          message: 'Docker服务运行正常'
        })
      } else {
        checks.push({
          name: 'docker_running',
          passed: false,
          message: 'Docker服务未运行'
        })
        passed = false
      }

      // 4. 端口可用性检查
      const portCheckResult = await ssh.execCommand(
        `netstat -tlnp 2>/dev/null | grep ':${workerPort} ' || ss -tlnp 2>/dev/null | grep ':${workerPort} ' || echo "Port available"`
      )
      if (portCheckResult.stdout.includes('Port available')) {
        checks.push({
          name: 'port_available',
          passed: true,
          message: `端口 ${workerPort} 可用`
        })
      } else {
        checks.push({
          name: 'port_available',
          passed: false,
          message: `端口 ${workerPort} 已被占用`
        })
        passed = false
      }

      // 5. 磁盘空间检查
      const diskResult = await ssh.execCommand("df -h / | tail -1 | awk '{print $4}'")
      const availableSpace = diskResult.stdout.trim()
      checks.push({
        name: 'disk_space',
        passed: true,
        message: `磁盘空间可用: ${availableSpace}`
      })

      // 6. 内存检查
      const memResult = await ssh.execCommand("free -h | grep Mem | awk '{print $7}'")
      const availableMem = memResult.stdout.trim()
      checks.push({
        name: 'memory',
        passed: true,
        message: `内存可用: ${availableMem}`
      })

      // 7. 系统架构检查
      const archResult = await ssh.execCommand('uname -m')
      checks.push({
        name: 'system_arch',
        passed: true,
        message: `系统架构: ${archResult.stdout.trim()}`,
        details: { arch: archResult.stdout.trim() }
      })

    } catch (error) {
      checks.push({
        name: 'general',
        passed: false,
        message: `检查过程出错: ${error instanceof Error ? error.message : '未知错误'}`
      })
      passed = false
    } finally {
      ssh.dispose()
    }

    return { passed, checks }
  }
}

export const environmentChecker = new EnvironmentChecker()
```

#### 5.1.3 创建远程 Worker 部署器
**文件**: `server/src/master/orchestrator/remoteWorkerDeployer.ts`

核心功能：
1. SSH 连接到远程服务器
2. 传输部署文件（Dockerfile、启动脚本）
3. 在远程服务器上构建和启动 Worker
4. 跟踪部署进度
5. 注册 Worker 到 Master

#### 5.1.4 创建远程 Worker 注册表
**文件**: `server/src/master/orchestrator/remoteWorkerRegistry.ts`

核心功能：
1. 管理远程 Worker 列表
2. 宽松的健康检查（不关闭 Worker，只标记状态）
3. 负载均衡（选择合适的远程 Worker）

### 5.2 第二阶段：健康检查适配

#### 5.2.1 修改 HealthMonitor
**文件**: `server/src/master/orchestrator/healthMonitor.ts`

添加远程 Worker 健康检查逻辑：
- 更长的检查间隔（例如 5 分钟）
- 更长的超时时间（例如 30 秒）
- 失败后只标记状态，不关闭容器
- 支持配置是否自动恢复

### 5.3 第三阶段：API 和路由

#### 5.3.1 创建远程 Worker 管理路由
**文件**: `server/src/master/routes/remoteWorker.routes.ts`

实现以下端点：
- `POST /api/admin/remote-workers/precheck` - 环境预检查
- `POST /api/admin/remote-workers/deploy` - 部署远程 Worker
- `GET /api/admin/remote-workers` - 列出所有远程 Worker
- `GET /api/admin/remote-workers/:id` - 获取远程 Worker 详情
- `GET /api/admin/remote-workers/:id/status` - 获取部署状态
- `DELETE /api/admin/remote-workers/:id` - 移除远程 Worker

### 5.4 第四阶段：集成和测试

#### 5.4.1 修改 ContainerOrchestrator
- 集成远程 Worker 注册表
- 修改请求路由逻辑，支持远程 Worker

#### 5.4.2 数据库迁移
- 创建 `remote_workers` 表
- 创建 `remote_worker_deploy_logs` 表

## 6. 部署文件模板

### 6.1 远程 Worker Dockerfile 模板
```dockerfile
# 远程 Worker Dockerfile
# 由 Master 自动生成并传输到远程服务器

FROM node:20-slim

# 安装必要工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# 设置环境变量
ENV NODE_ENV=production
ENV CONTAINER_ROLE=worker
ENV PORT=4000
ENV WORKER_INTERNAL_PORT=4000

# 工作目录
WORKDIR /app

# 复制 Worker 代码
COPY worker/ ./

# 安装依赖
RUN npm install --production

# 暴露端口
EXPOSE 4000

# 健康检查
HEALTHCHECK --interval=60s --timeout=30s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:4000/internal/health || exit 1

# 启动命令
CMD ["node", "src/index.js"]
```

### 6.2 远程 Worker 启动脚本
```bash
#!/bin/bash
# deploy-remote-worker.sh
# 在远程服务器上执行的部署脚本

set -e

WORKER_PORT=${1:-4000}
MASTER_HOST=${2:-"master.claw-web.local"}
MASTER_PORT=${3:-3000}
MASTER_TOKEN=${4:-""}

echo "[Remote Worker] 开始部署..."
echo "  Worker Port: $WORKER_PORT"
echo "  Master Host: $MASTER_HOST:$MASTER_PORT"

# 创建工作目录
mkdir -p /opt/claw-web-worker
cd /opt/claw-web-worker

# 构建镜像
docker build -t claw-web-remote-worker:latest .

# 停止旧容器（如果存在）
docker stop claw-web-remote-worker 2>/dev/null || true
docker rm claw-web-remote-worker 2>/dev/null || true

# 启动新容器
docker run -d \
  --name claw-web-remote-worker \
  --restart unless-stopped \
  -p ${WORKER_PORT}:4000 \
  -e CONTAINER_ROLE=worker \
  -e PORT=4000 \
  -e MASTER_HOST=${MASTER_HOST} \
  -e MASTER_PORT=${MASTER_PORT} \
  -e MASTER_INTERNAL_TOKEN=${MASTER_TOKEN} \
  -e WORKER_ID=$(hostname)-${WORKER_PORT} \
  -v /var/run/docker.sock:/var/run/docker.sock \
  claw-web-remote-worker:latest

echo "[Remote Worker] 部署完成"
echo "  Container ID: $(docker ps -q -f name=claw-web-remote-worker)"
```

## 7. 安全考虑

1. **SSH 密码加密**：数据库中存储的 SSH 密码需要加密
2. **Token 安全**：Master-Worker 通信 Token 需要安全传输
3. **网络隔离**：远程 Worker 不应直接访问数据库
4. **权限控制**：只有管理员可以部署远程 Worker

## 8. 依赖安装

需要添加以下依赖：
```bash
cd server
npm install node-ssh
```

## 9. 实施时间表

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 1 | 基础架构（类型定义、环境检查器） | 1 天 |
| 2 | 远程 Worker 部署器 | 1 天 |
| 3 | 远程 Worker 注册表和健康检查 | 1 天 |
| 4 | API 路由和集成 | 1 天 |
| 5 | 测试和调试 | 1 天 |
| **总计** | | **5 天** |

## 10. 风险和对策

| 风险 | 影响 | 对策 |
|------|------|------|
| SSH 连接不稳定 | 部署失败 | 实现重试机制，最多重试 3 次 |
| 远程服务器环境不满足 | 部署失败 | 预检查阶段发现并提示用户 |
| 网络延迟高 | 健康检查误判 | 增加超时时间和重试次数 |
| 远程 Worker 失联 | 服务不可用 | 标记为 offline，路由时跳过 |
