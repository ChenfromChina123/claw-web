# Claw-Web AI Context & Rules

## 📌 项目概览
- **定位**：类似 Manus 的 AI 智能体执行沙箱（TS + Bun + Docker）。
- **架构**：严格的 **Master-Worker** 分布式隔离架构。

## 🛡️ 架构铁律（绝对禁忌）
1. **Master 禁区**：禁止在 Master 执行任何用户命令、创建 PTY、或直接读写沙盒文件。
2. **Worker 禁区**：禁止 Worker 连接数据库、处理用户鉴权。Worker 必须是无状态的。
3. **安全隔离**：Master 与 Worker 通信必须携带 `X-Master-Token`，Worker 必须网络隔离（无法访问 MySQL）。

## � 工作空间隔离架构原则
- **隔离粒度**：工作空间按**用户**隔离，不按会话隔离。
- **路径格式**：`/data/claws/workspaces/users/{userId}/`
- **容器映射**：一个用户 = 一个 Worker 容器 = 一个 `/workspace` 挂载。
- **会话共享**：同一用户的所有会话共享同一个工作空间文件系统。
- **禁止使用 sessionId 作为路径参数**：会话（Session）只是数据库中的逻辑概念，用于保存聊天历史，不应参与文件系统路径构建。
- **原因**：
  - ✅ 简化路径管理，避免嵌套挂载导致的路径冲突
  - ✅ 用户的所有会话可以共享文件（如代码项目、配置文件）
  - ✅ 容器重启后文件不丢失
  - ✅ 实现用户间完全隔离

## �📂 核心目录索引 (server/src/)
- `/master`：控制层（端口 3000）。鉴权、网关、会话管理、容器调度。
- `/worker`：执行层（端口 4000）。沙箱、PTY 伪终端、文件操作。
- `/shared`：共享模块。定义通信 Type、Constants 和 Utils（必须保持两端同步！）。
- `/orchestrator`：容器编排。管理 Worker 的热池和用户绑定。

## 🔄 核心交互数据流
- **普通命令**：前端 -> Master(3000) -> Worker(4000 `/internal/exec`) -> 返回。
- **PTY 终端**：前端 -[WS]-> Master -[转发器 `workerForwarder`]-> Worker PTY。
- **Agent 执行**：所有 Agent 命令必须转发到 Worker 容器执行，禁止在 Master 本地执行。

## ⚠️ AI 编码规范
- **文件路径**：所有 Worker 的文件操作，必须经过 `isPathSafe()` 限制在 `/workspace`。
- **添加功能**：先判断属于控制层（放 Master）还是执行层（放 Worker）。
- **通信修改**：修改 API 时，必须优先在 `server/src/shared/` 中更新类型。
- **PTY 创建**：Master 禁止直接创建 PTY，必须通过 `wsPTYBridge` → `WorkerForwarder` → Worker。
