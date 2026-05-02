# Worker 外网访问、持久化防休眠、端口映射与安全审计计划

## 一、现状分析

### 1.1 Worker 外网连接能力

**当前状态**：Worker 容器**可以**连接外网。

- 动态创建的 Worker 容器加入 `worker-network`（bridge 网络），Docker bridge 默认有 NAT 出站能力
- 没有任何出站网络限制（无 iptables/egress 过滤）
- 这是**有意设计**：AI Agent 需要联网下载文件、安装包等
- 但缺乏细粒度的出站控制，存在滥用风险

### 1.2 持久化程序防休眠机制

**当前状态**：**缺失**，存在严重问题。

- 空闲检测（`healthMonitor.ts:213-270`）仅检查 **WebSocket 连接状态**
- 不检查 Worker 内是否有活跃的部署项目在运行
- 用户部署了持久化程序后，如果用户离线超过空闲超时（REGULAR: 30分钟），容器会被 `docker pause` 休眠
- **`docker pause` 会冻结所有进程**，导致持久化部署的项目完全停止响应
- 没有机制查询 Worker 内是否有活跃部署

### 1.3 外网映射（端口转发）

**当前状态**：**存在严重缺陷**。

- Worker 容器只映射了 `-p {hostPort}:4000`（Worker API 端口）
- 用户项目在容器内部分配端口 10000-20000，**未映射到宿主机**
- 反向代理配置 `proxy_pass http://localhost:${workerPort}` 指向的是 Worker API 端口（4000 的映射），**不是用户项目端口**
- 这意味着外部访问流量被转发到 Worker API 而非用户项目，**外部访问功能实际上不可用**

### 1.4 安全性评估

| 安全维度 | 状态 | 风险等级 |
|---------|------|---------|
| 网络隔离（Worker↔MySQL） | 已实现 | ✅ 低 |
| X-Master-Token 双向认证 | 已实现 | ✅ 低 |
| 路径安全 isPathSafe | 已实现（简单版） | ⚠️ 中 |
| 命令安全（黑名单） | 已实现 | ✅ 低 |
| 容器特权模式 `--privileged` | **未修复** | 🔴 高 |
| 默认 Token 硬编码 | **未修复** | ⚠️ 中 |
| 出站网络控制 | **未实现** | ⚠️ 中 |
| Worker 端路径符号链接解析 | **未实现** | ⚠️ 中 |

---

## 二、实施计划

### 任务 1：修复持久化程序防休眠机制（高优先级）

**问题**：部署了持久化项目的 Worker 容器在用户离线后会被休眠，导致服务中断。

**方案**：在空闲检测中增加"活跃部署"检查维度。

**修改文件**：
1. `server/src/master/orchestrator/healthMonitor.ts` - 修改 `startIdleDetectionLoop()` 和 `checkUserActiveConnections()`
2. `server/src/master/integrations/workerDeploymentClient.ts` - 添加查询 Worker 内活跃部署的方法
3. `server/src/worker/deployment/index.ts` - 添加查询活跃部署列表的 API
4. `server/src/worker/server/index.ts` - 注册部署状态查询路由

**具体步骤**：

1. **Worker 端**：在 `WorkerDeploymentManager` 中添加 `getActiveDeployments()` 方法，返回正在运行的项目列表
2. **Worker 端**：在 HTTP 路由中注册 `/internal/deploy/active` 端点
3. **Master 端**：在 `WorkerDeploymentClient` 中添加 `getActiveDeployments()` 方法
4. **Master 端**：修改 `healthMonitor.ts` 的 `checkUserActiveConnections()` 方法，增加部署活跃检查：
   - 调用 Worker 的活跃部署查询 API
   - 如果有活跃部署，视为"有活跃连接"，跳过休眠
   - 更新 `lastActivityAt` 防止误杀

**验证标准**：
- 部署了持久化项目的 Worker 容器在用户离线后不会被休眠
- 没有活跃部署的 Worker 容器仍然正常进入休眠
- 日志中明确记录跳过休眠的原因（"有活跃部署"）

---

### 任务 2：修复外网映射/端口转发（高优先级）

**问题**：用户项目的端口（10000-20000）未映射到宿主机，Nginx 反向代理指向了错误的端口。

**方案**：动态映射用户项目端口到宿主机，并修正反向代理配置。

**修改文件**：
1. `server/src/master/orchestrator/containerOperations.ts` - 修改容器创建命令，支持动态端口映射
2. `server/src/master/services/reverseProxyService.ts` - 修正 `proxy_pass` 指向
3. `server/src/master/services/projectDeploymentService.ts` - 在部署流程中增加端口映射步骤
4. `server/src/master/integrations/workerDeploymentClient.ts` - 更新部署结果处理

**具体步骤**：

1. **方案选择**：使用 Docker 网络直接通信（推荐），而非额外端口映射
   - Nginx 反向代理运行在 Master 容器或宿主机
   - 通过 Docker 网络（`worker-network`）直接访问 Worker 容器
   - `proxy_pass http://{containerName}:{internalPort}` 替代 `http://localhost:{workerPort}`
   - 这样无需额外映射端口，更安全更高效

2. **修改反向代理配置**：
   - `reverseProxyService.ts` 中 `upstreamServer` 改为使用容器名 + 内部端口
   - `upstreamServer = http://${containerName}:${internalPort}`

3. **确保 Nginx 与 Worker 在同一 Docker 网络**：
   - 检查 Nginx（前端/Master）是否已加入 `worker-network`
   - 如果没有，需要将 Nginx 容器也加入 `worker-network`

4. **备选方案**（如果 Nginx 不在 Docker 网络中）：
   - 在部署时动态添加端口映射：`docker port add {container} {internalPort}/tcp`
   - 或者使用 `iptables` 规则转发
   - 或者在创建容器时预留端口映射范围

**验证标准**：
- 外部用户通过域名可以访问到部署的项目
- Nginx 日志显示正确的 upstream 响应
- 健康检查端点返回 200

---

### 任务 3：移除 `--privileged` 特权模式（高优先级）

**问题**：Worker 容器以 `--privileged` 模式运行，拥有宿主机所有内核能力，被攻破可影响宿主机安全。

**方案**：替换为最小权限的 `--cap-add` 参数。

**修改文件**：
1. `server/src/master/orchestrator/containerOperations.ts` - 修改 `securityArgs`

**具体步骤**：

1. 分析 PTY 功能所需的最小权限：
   - `SYS_PTRACE`：node-pty 需要 ptrace 系统调用
   - `SETUID`/`SETGID`：进程用户切换
   - `CHOWN`：文件所有权变更
   - `DAC_OVERRIDE`：文件权限覆盖

2. 替换 `--privileged` 为具体的 `--cap-add` 列表：
   ```
   --cap-add=SYS_PTRACE
   --cap-add=SETUID
   --cap-add=SETGID
   --cap-add=CHOWN
   --cap-add=DAC_OVERRIDE
   ```

3. 添加其他安全加固参数：
   ```
   --security-opt=no-new-privileges
   --read-only=/app  (可选，只读应用目录)
   ```

4. 测试 PTY 功能是否正常工作

**验证标准**：
- PTY 终端功能正常（创建、输入、输出）
- 文件操作正常（读写、权限变更）
- 容器无法执行 `mount`、`insmod` 等特权操作
- `cat /proc/1/status | grep Cap` 显示受限的能力集

---

### 任务 4：添加出站网络控制（中优先级）

**问题**：Worker 容器可以无限制地访问外网，存在滥用风险（如挖矿、DDoS、数据外泄）。

**方案**：使用 Docker 网络选项或 iptables 限制出站流量。

**修改文件**：
1. `server/src/master/orchestrator/containerOperations.ts` - 添加网络限制参数
2. `docker-compose.yml` - 添加网络配置

**具体步骤**：

1. **方案选择**：使用 Docker 的 `--network` 选项配合 iptables 规则
   - 创建专用的 Worker 外网网络，配置出站规则
   - 允许 HTTP/HTTPS 出站（80, 443）
   - 允许 DNS 出站（53）
   - 阻止其他所有出站流量

2. **实现方式**：
   - 在 `docker-compose.yml` 中定义带出站规则的网络
   - 或在容器创建后通过 iptables 添加规则
   - 推荐使用 Docker 的 `--network-opt` 或外部 iptables 脚本

3. **添加出站流量监控**：
   - 记录 Worker 的出站连接日志
   - 设置异常流量告警阈值

**验证标准**：
- Worker 可以正常 `curl https://example.com`（HTTP/HTTPS 出站）
- Worker 可以正常 `npm install`/`pip install`（包管理器出站）
- Worker 无法发起非 HTTP/HTTPS 的出站连接
- 日志中记录出站连接信息

---

### 任务 5：修复默认 Token 硬编码问题（中优先级）

**问题**：`MASTER_INTERNAL_TOKEN` 默认值 `internal-master-worker-token-2024` 硬编码在配置中。

**方案**：启动时自动生成随机 Token，强制用户配置或使用随机值。

**修改文件**：
1. `docker-compose.yml` - 移除默认值或添加启动脚本
2. `server/src/shared/utils/index.ts` - 添加 Token 生成逻辑
3. `server/src/master/server/index.ts` - 添加启动检查

**具体步骤**：

1. 在 Master 启动时检查 `MASTER_INTERNAL_TOKEN` 是否为默认值
2. 如果是默认值，打印警告并自动生成随机 Token
3. 将生成的 Token 通过环境变量传递给动态创建的 Worker 容器
4. 在 `.env.example` 中说明必须配置此值

**验证标准**：
- 使用默认 Token 启动时，日志中有明确警告
- Worker 容器使用动态生成的 Token
- Master 和 Worker 通信正常

---

### 任务 6：增强 Worker 端路径安全（低优先级）

**问题**：Worker 端的 `isPathSafe()` 实现简单，未处理符号链接解析。

**方案**：将 Master 端更完善的 `pathSecurity.ts` 逻辑同步到 Worker 端。

**修改文件**：
1. `server/src/shared/utils/index.ts` - 增强 `isPathSafe()` 函数
2. `server/src/worker/sandbox/index.ts` - 使用增强版路径验证

**具体步骤**：

1. 在 `isPathSafe()` 中增加符号链接解析（`fs.realpath`）
2. 增加路径规范化（去除多余分隔符、尾随斜杠）
3. 增加对特殊文件系统的保护（/proc, /sys, /dev）
4. 在 Worker sandbox 中使用增强版

**验证标准**：
- 通过符号链接逃逸 `/workspace` 的攻击被阻止
- 访问 `/proc`, `/sys`, `/dev` 被阻止
- 正常文件操作不受影响

---

## 三、实施优先级

| 优先级 | 任务 | 影响范围 | 风险 |
|-------|------|---------|------|
| P0 | 任务 1：持久化防休眠 | 部署功能完全不可用 | 高 |
| P0 | 任务 2：外网映射修复 | 外部访问完全不可用 | 高 |
| P0 | 任务 3：移除特权模式 | 宿主机安全风险 | 高 |
| P1 | 任务 4：出站网络控制 | 滥用风险 | 中 |
| P1 | 任务 5：Token 硬编码 | 认证安全风险 | 中 |
| P2 | 任务 6：路径安全增强 | 沙箱逃逸风险 | 低 |

---

## 四、执行顺序

1. **任务 1**（持久化防休眠）→ 验证：部署项目后用户离线，容器不被休眠
2. **任务 2**（外网映射修复）→ 验证：通过域名可访问部署的项目
3. **任务 3**（移除特权模式）→ 验证：PTY 功能正常，特权操作被阻止
4. **任务 4**（出站网络控制）→ 验证：HTTP/HTTPS 出站正常，其他被阻止
5. **任务 5**（Token 硬编码）→ 验证：默认 Token 触发警告，通信正常
6. **任务 6**（路径安全增强）→ 验证：符号链接逃逸被阻止
