Claw-Web AI Context & Rules

项目概览
- 定位：类似 Manus 的 AI 智能体执行沙箱（TS + Bun + Docker + vue）
- 架构：严格的 Master-Worker 分布式隔离架构

架构铁律（绝对禁忌）
1. Master 禁区：禁止在 Master 执行任何用户命令、创建 PTY、或直接读写沙盒文件
2. Worker 禁区：禁止 Worker 连接数据库、处理用户鉴权。Worker 必须是无状态的
3. 安全隔离：Master 与 Worker 通信必须携带 X-Master-Token，Worker 必须网络隔离（无法访问 MySQL）

工作空间隔离架构原则
- 隔离粒度：工作空间按用户隔离，不按会话隔离
- 路径格式：/data/claws/workspaces/users/{userId}/
- 容器映射：一个用户 = 一个 Worker 容器 = 一个 /workspace 挂载
- 会话共享：同一用户的所有会话共享同一个容器和工作空间文件系统
- 禁止使用 sessionId 作为路径参数：会话只是数据库中的逻辑概念，用于保存聊天历史，不应参与文件系统路径构建或容器分配
- 容器管理原则：
  - 每个用户有且仅有一个 Worker 容器
  - 不区分会话级别的容器管理
  - 用户的所有会话共享同一个容器和工作空间
  - 容器的创建、分配、释放都基于用户级别，不基于会话级别
  - 释放容器时检查用户是否还有其他活跃活动，如果没有则释放

核心目录索引 (server/src/)
- /master：控制层（端口 3000）。鉴权、网关、会话管理、容器调度
- /worker：执行层（端口 4000）。沙箱、PTY 伪终端、文件操作
- /shared：共享模块。定义通信 Type、Constants 和 Utils（必须保持两端同步）
- /orchestrator：容器编排。管理 Worker 的热池和用户绑定

核心交互数据流
- 普通命令：前端 -> Master(3000) -> Worker(4000 /internal/exec) -> 返回
- PTY 终端：前端 -[WS]-> Master -[转发器 workerForwarder]-> Worker PTY
- Agent 执行：所有 Agent 命令必须转发到 Worker 容器执行，禁止在 Master 本地执行

AI 编码规范
- 文件路径：所有 Worker 的文件操作，必须经过 isPathSafe() 限制在 /workspace
- 添加功能：先判断属于控制层（放 Master）还是执行层（放 Worker）
- 通信修改：修改 API 时，必须优先在 server/src/shared/ 中更新类型
- PTY 创建：Master 禁止直接创建 PTY，必须通过 wsPTYBridge -> WorkerForwarder -> Worker

Docker 构建优化指南（AI 必读）

开发环境构建
使用 Bind Mount 实现代码热更新，修改代码后无需重建镜像：
# 步骤 1：首次构建镜像（只需一次）
docker-compose build
# 步骤 2：启动开发环境（代码修改后自动重载）
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

生产环境构建
# 使用缓存加速构建（不要滥用 --no-cache）
docker-compose build
# 只构建特定服务（更快）
docker-compose build master
docker-compose build frontend
# 强制重建（仅当必要时）
docker-compose build --no-cache master

构建优化注意事项
1. 不要滥用 --no-cache
   日常开发使用缓存
   仅在基础镜像更新或系统依赖变更时使用 --no-cache
2. Dockerfile 缓存优化
   先复制依赖文件（package.json）
   再安装依赖（利用缓存）
   最后复制源代码（代码变化不影响依赖层）
3. 开发环境使用专用配置
   docker-compose.dev.yml 提供 Bind Mount 热更新
   使用 --watch 模式自动重载
   前端使用 Vite 开发服务器

当前开发项目为web：claw-web/web，手机app：claw-web/chat_application，后端：claw-web/server
测试账号：3301767269@qq.com
测试密码：123456
单文件不得超过500行