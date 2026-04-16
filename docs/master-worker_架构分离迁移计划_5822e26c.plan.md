---
name: Master-Worker 架构分离迁移计划
overview: 将散落在 server/src 根目录的非 Worker 模块迁移到 master/ 目录，实现严格的 Master-Worker 架构分离。包含：1) shared 目录纯净性检查；2) PTY 转发性能优化；3) TypeScript 路径配置一致性。
todos:
  - id: "1"
    content: 创建 master 目录结构
    status: completed
  - id: "2"
    content: 移动模块到 master 目录（按依赖顺序）
    status: completed
  - id: "3"
    content: 更新所有 import 路径引用
    status: completed
  - id: "4"
    content: 更新入口文件（index.ts, docker-compose.yml）
    status: completed
  - id: "5"
    content: 验证 TypeScript 编译和构建
    status: completed
  - id: "6"
    content: 检查 shared/ 目录污染（禁止 fs/db/axios）
    status: completed
  - id: "7"
    content: 优化 PTY 转发（Buffer + 心跳检测）
    status: completed
isProject: false
---

# Master-Worker 架构分离迁移计划

## 一、迁移目标

将 `server/src/` 根目录下的所有非 Worker 模块迁移到 `server/src/master/` 目录，实现严格的架构分离：

- **Master（控制层）**：认证、数据库、容器编排、API 路由、Agent 引擎等
- **Worker（执行层）**：沙箱执行、PTY 终端、Internal API（保持不变）
- **Shared（共享）**：类型、常量、工具函数（保持不变）

---

## 二、迁移范围

### 2.1 迁移到 Master 的模块（20个目录）


| 模块              | 文件数 | 主要功能                             | 迁移原因                           |
| --------------- | --- | -------------------------------- | ------------------------------ |
| `agents/`       | 21  | Agent 引擎、注册表、团队管理、MCP            | 需要数据库和 Master Token            |
| `config/`       | 1   | 硬件资源配置                           | Master 配置管理                    |
| `db/`           | 18  | MySQL 连接池、Repository 层           | **Master 禁区规则：Worker 禁止连接数据库** |
| `integration/`  | 8   | WebSocket 桥接、工具执行器、PTY 管理        | Master HTTP/WS 服务              |
| `integrations/` | 13  | MCP Bridge、ToolRegistry、CLI 加载器  | Master 集成层                     |
| `middleware/`   | 5   | 限流、路由、租户隔离                       | HTTP 中间件                       |
| `models/`       | 1   | 数据模型类型                           | 共享类型                           |
| `monitoring/`   | 8   | 性能监控、日志、备份                       | Master 监控服务                    |
| `orchestrator/` | 4   | 容器编排、热池管理、调度策略                   | **Master 核心职责**                |
| `prompts/`      | 6   | AI 提示词模板                         | Master AI 服务                   |
| `routes/`       | 22  | HTTP API 路由（Auth、Session、Agent等） | **Master API 层**               |
| `scripts/`      | 1   | 容器生命周期脚本                         | Master 运维                      |
| `security/`     | 9   | 访问控制、审计、配额、沙箱                    | Master 安全                      |
| `server/`       | 4   | HTTP 服务器、Agent API、SSE 解析器       | **Master 入口**                  |
| `services/`     | 33  | 业务服务（认证、会话、LLM、部署等）              | **Master 业务层**                 |
| `skills/`       | 16  | 技能系统、内置技能                        | Master 技能管理                    |
| `tools/`        | 11  | 工具定义和别名                          | Master 工具定义                    |
| `types/`        | 3   | 路由、WebSocket 类型                  | 共享类型                           |
| `utils/`        | 4   | 认证、常量、功能开关                       | Master 工具                      |
| `websocket/`    | 2   | 消息路由、Worker 转发器                  | **Master WS 层**                |
| `__tests__/`    | -   | 测试文件（可选）                         | 测试代码                           |


### 2.2 保持不变的模块


| 模块        | 位置                   | 原因                          |
| --------- | -------------------- | --------------------------- |
| `shared/` | `server/src/shared/` | Master 和 Worker 共享的类型、常量、工具 |


### 2.3 Worker 保留模块（已在正确位置）

```
server/src/worker/
├── sandbox/          # 命令执行沙箱（保持）
├── server/          # Internal API（保持）
├── terminal/         # PTY 终端（保持）
└── index.ts          # 入口（保持）
```

---

## 三、迁移步骤

### 步骤 1：创建 master 目录结构

```
server/src/master/
├── agents/
├── config/
├── db/
├── integration/
├── integrations/
├── middleware/
├── models/
├── monitoring/
├── orchestrator/
├── prompts/
├── routes/
├── scripts/
├── security/
├── server/
├── services/
├── skills/
├── tools/
├── types/
├── utils/
├── websocket/
├── httpServer.ts      # 从 server/ 移动
├── services.ts       # 新建服务初始化
└── index.ts          # 更新入口
```

### 步骤 2：移动文件到 master 目录

执行以下移动操作：

```bash
# 移动控制层模块到 master
Move-Item server/src/agents        -> server/src/master/agents
Move-Item server/src/config      -> server/src/master/config
Move-Item server/src/db          -> server/src/master/db
Move-Item server/src/integration -> server/src/master/integration
Move-Item server/src/integrations -> server/src/master/integrations
Move-Item server/src/middleware  -> server/src/master/middleware
Move-Item server/src/models       -> server/src/master/models
Move-Item server/src/monitoring  -> server/src/master/monitoring
Move-Item server/src/orchestrator -> server/src/master/orchestrator
Move-Item server/src/prompts     -> server/src/master/prompts
Move-Item server/src/routes      -> server/src/master/routes
Move-Item server/src/scripts     -> server/src/master/scripts
Move-Item server/src/security    -> server/src/master/security
Move-Item server/src/server      -> server/src/master/server
Move-Item server/src/services    -> server/src/master/services
Move-Item server/src/skills      -> server/src/master/skills
Move-Item server/src/tools        -> server/src/master/tools
Move-Item server/src/types       -> server/src/master/types
Move-Item server/src/utils       -> server/src/master/utils
Move-Item server/src/websocket   -> server/src/master/websocket
```

### 步骤 3：更新 import 路径

所有被移动文件的 import 路径需要更新：

**模式 A：从 `../xxx` 变为 `../xxx`（内部引用）**

```typescript
// 移动前
import { authService } from '../services/authService'

// 移动后（同一 master 目录内）
import { authService } from '../services/authService'
// 路径不变，因为都在 master/ 下
```

**模式 B：从 `./xxx` 变为 `./xxx/xxx`（主入口引用）**

```typescript
// 移动前 (server/src/index.ts)
import { startServer } from './server/httpServer'

// 移动后 (server/src/index.ts)
import { startServer } from './master/server/httpServer'
```

### 步骤 4：更新 master/index.ts 入口

```typescript:server/src/master/index.ts
/**
 * Master Entry Point - Master 容器入口
 */
import { isMasterContainer } from '../shared/utils'

if (!isMasterContainer()) {
  console.error('[Master] Error: CONTAINER_ROLE must be set to "master"')
  process.exit(1)
}

// 更新导入路径
import { startHTTPServer } from './server/httpServer'
import { startMasterServices } from './services'

async function main() {
  console.log('[Master] Starting Master container...')
  await startHTTPServer()
  await startMasterServices()
  console.log('[Master] Master is ready!')
}
```

### 步骤 5：更新根目录入口 server/src/index.ts

```typescript:server/src/index.ts
// 更新导入路径
import { startHTTPServer } from './master/server/httpServer'
import { initializeSkills } from './master/skills'
```

### 步骤 6：更新 docker-compose.yml

更新构建上下文和挂载路径：

```yaml:docker-compose.yml
services:
  master:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        ENTRY_POINT: master      # 新增：指定入口点
    volumes:
      # 更新挂载路径
      - ./server/src/master:/app/src
      - mysql_data:/var/lib/mysql
      - workspaces_data:/app/workspaces
      - master_logs:/app/logs
      - /var/run/docker.sock:/var/run/docker.sock
      # 挂载 shared 供两边使用
      - ./server/src/shared:/app/src/shared:ro
```

### 步骤 7：更新 Dockerfile

支持指定入口点：

```dockerfile:Dockerfile
ARG ENTRY_POINT=master
COPY server/src/${ENTRY_POINT} /app/src/
# 根据 ENTRY_POINT 复制对应目录
```

---

## 四、文件变更清单

### 4.1 需要移动的目录（按依赖顺序）


| 顺序  | 目录              | 文件数 | 依赖关系                           |
| --- | --------------- | --- | ------------------------------ |
| 1   | `models/`       | 1   | 无依赖                            |
| 2   | `types/`        | 3   | 依赖 models                      |
| 3   | `utils/`        | 4   | 依赖 types                       |
| 4   | `shared/`       | 3   | 保持不变（共享）                       |
| 5   | `db/`           | 18  | 依赖 types, utils                |
| 6   | `config/`       | 1   | 依赖 utils                       |
| 7   | `services/`     | 33  | 依赖 db, utils                   |
| 8   | `routes/`       | 22  | 依赖 services                    |
| 9   | `middleware/`   | 5   | 依赖 routes                      |
| 10  | `security/`     | 9   | 依赖 db, services                |
| 11  | `monitoring/`   | 8   | 依赖 services                    |
| 12  | `prompts/`      | 6   | 依赖 services                    |
| 13  | `integration/`  | 8   | 依赖 services                    |
| 14  | `integrations/` | 13  | 依赖 integration                 |
| 15  | `skills/`       | 16  | 依赖 integrations                |
| 16  | `tools/`        | 11  | 依赖 integrations                |
| 17  | `agents/`       | 21  | 依赖 skills, tools, integrations |
| 18  | `orchestrator/` | 4   | 依赖 agents, integration         |
| 19  | `scripts/`      | 1   | 依赖 orchestrator                |
| 20  | `websocket/`    | 2   | 依赖 routes, integration         |
| 21  | `server/`       | 4   | 依赖以上所有                         |
| 22  | `__tests__/`    | -   | 依赖以上所有                         |


### 4.2 需要更新的入口文件


| 文件                                     | 变更内容                          |
| -------------------------------------- | ----------------------------- |
| `server/src/index.ts`                  | 更新 import 路径指向 `./master/...` |
| `server/src/index.master.ts`           | 更新 import 路径指向 `./master/...` |
| `server/src/master/index.ts`           | 更新内部 import 路径                |
| `server/src/master/websocket/index.ts` | 更新 workerForwarder 导入路径       |
| `docker-compose.yml`                   | 更新 volume 挂载路径                |
| `Dockerfile`                           | 支持 ENTRY_POINT 参数             |


---

## 五、架构验证

### 5.1 迁移后的目录结构

```
server/src/
├── master/                    # 控制层（新增）
│   ├── agents/               # Agent 引擎
│   ├── config/                # 配置
│   ├── db/                   # MySQL 数据库
│   ├── integration/          # 集成
│   ├── integrations/         # 集成扩展
│   ├── middleware/           # 中间件
│   ├── models/               # 数据模型
│   ├── monitoring/           # 监控
│   ├── orchestrator/         # 容器编排
│   ├── prompts/             # 提示词
│   ├── routes/              # HTTP API
│   ├── scripts/             # 脚本
│   ├── security/            # 安全
│   ├── server/              # HTTP 服务器
│   ├── services/            # 业务服务
│   ├── skills/              # 技能系统
│   ├── tools/              # 工具
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   ├── websocket/          # WebSocket
│   ├── httpServer.ts       # HTTP 入口
│   └── index.ts            # Master 入口
├── worker/                  # 执行层（保持）
│   ├── sandbox/            # 沙箱
│   ├── server/             # Internal API
│   ├── terminal/           # PTY
│   └── index.ts            # Worker 入口
├── shared/                  # 共享模块（保持）
│   ├── constants/
│   ├── types/
│   └── utils/
└── index.ts                # 统一入口
```

### 5.2 架构规则验证


| 规则                                | 验证结果                        |
| --------------------------------- | --------------------------- |
| Master 禁止执行用户命令                   | ✅ 验证通过（用户命令在 Worker）        |
| Worker 禁止连接数据库                    | ✅ 验证通过（db/ 只在 Master）       |
| Master-Worker 通信使用 X-Master-Token | ✅ 验证通过（Worker Internal API） |
| Worker 网络隔离                       | ✅ docker-compose 网络配置已隔离    |


---

## 六、进阶优化（必须遵循）

### 6.1 Shared 目录纯净性原则

**原则**：`shared/` 只放 **Interfaces (类型)**、**Constants (常量)** 和 **Pure Utils (纯工具函数)**

**禁忌**：禁止在 `shared/` 中包含任何涉及：

- `fs`（文件系统）
- `db`（数据库）
- `axios`（网络请求）
- 任何 Master 独有的库

**原因**：Worker 镜像需要干净，不应包含 Master 的依赖

**检查清单**：

- 迁移后检查 `shared/` 中的每个文件
- 移除任何对 `mysql`、`axios`、`fs` 等的引用
- 确保所有共享类型都是纯 TypeScript interface/type

```typescript
// ✅ 正确：纯类型和常量
interface UserInfo { id: string; name: string }
const MAX_TIMEOUT = 30000
function parseEnvVar(env: string | undefined): string { ... }

// ❌ 错误：包含库依赖
import { getPool } from '../db/mysql'           // 禁止
import axios from 'axios'                       // 禁止
import fs from 'fs'                             // 禁止
```

### 6.2 PTY 转发的健壮性优化

**问题**：WebSocket 嵌套（前端 -> Master -> Worker）会增加延迟

**优化要求**：

```typescript:server/src/master/websocket/workerForwarder.ts
// 1. 使用 Buffer 而非字符串传输二进制流
ws.on('message', (data: Buffer) => {
  // 直接转发 Buffer，不转字符串
  workerWs.send(data)
})

// 2. 心跳检测机制
const HEARTBEAT_INTERVAL = 30000 // 30秒
setInterval(() => {
  if (Date.now() - lastPong > HEARTBEAT_INTERVAL * 2) {
    // 断开并通知前端
    masterWs.close(4001, 'Worker connection lost')
    return
  }
  masterWs.ping()
}, HEARTBEAT_INTERVAL)

// 3. 断连感知与通知
workerWs.on('close', () => {
  // 通知前端 Worker 已断开
  masterWs.send(JSON.stringify({
    type: 'worker_disconnected',
    sessionId: sessionId
  }))
})
```

### 6.3 TypeScript 路径配置一致性

**问题**：Docker 挂载 `./server/src/master:/app/src` 后，需要确保 tsconfig.json 正确识别

**解决方案**：

```json:tsconfig.json (根目录 - 供 IDE 识别)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@master/*": ["server/src/master/*"],
      "@worker/*": ["server/src/worker/*"],
      "@shared/*": ["server/src/shared/*"]
    }
  }
}
```

```json:server/src/master/tsconfig.build.json (精简构建配置)
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/master",
    "rootDir": "."
  },
  "include": ["./**/*"]
}
```

**Dockerfile 更新**：

```dockerfile:Dockerfile
ARG ENTRY_POINT=master

# 根据 ENTRY_POINT 复制对应目录和共享模块
COPY server/src/${ENTRY_POINT} /app/src/
COPY server/src/shared /app/src/shared/

# 复制精简的 tsconfig（避免暴露敏感路径）
COPY server/src/${ENTRY_POINT}/tsconfig.build.json /app/src/tsconfig.json
```

---

## 七、风险与注意事项

### 7.1 主要风险

1. **循环依赖**：部分模块间存在复杂依赖关系
2. **路径更新遗漏**：大量 import 路径需要逐一更新
3. **测试失败**：测试文件中的路径引用需要同步更新
4. **shared 污染**：不小心将 Master 依赖引入 shared

### 7.2 注意事项

1. **分步执行**：按依赖顺序逐步迁移，每步验证构建
2. **备份**：迁移前建议 git commit 当前状态
3. **测试**：每步迁移后运行 `bun run build` 验证
4. **类型检查**：`bun run type-check` 确保类型安全
5. **shared 检查**：每步迁移后检查 shared/ 是否被污染

---

## 八、预计工作量


| 任务           | 数量    | 说明                             |
| ------------ | ----- | ------------------------------ |
| 移动目录         | 20个   | 按依赖顺序                          |
| 更新 import 路径 | ~500处 | 使用 IDE 全局替换                    |
| 更新入口文件       | 6个    | index.ts, docker-compose.yml 等 |
| 验证构建         | 3次    | 每阶段验证                          |
| shared 污染检查  | 1次    | 迁移完成后全面检查                      |


