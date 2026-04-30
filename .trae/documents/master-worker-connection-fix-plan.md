# Master连接Worker失败问题修复计划

## 问题确认

用户说得对！架构流程应该是：
```
安卓App → Master(3000) → Worker(4000)
```

安卓App只需要连接Master，Worker连接是Master负责的。

## 根本原因分析

### 问题现象
- 安卓App执行命令失败：`Worker 请求失败: Unable to connect`
- 后端日志：`Tool execution timeout` 在 `sessionConversationManager.ts:952`

### 代码流程分析

1. **工具执行流程**：
   - `sessionConversationManager.processMessage()` 调用 `executeToolCalls()`
   - `executeToolCalls()` 调用 `toolRegistry.executeTool()` (line 984)
   - `toolRegistry` 调用 `workerToolExecutor.executeTool()`

2. **WorkerToolExecutor.executeTool()** (`workerToolExecutor.ts:66`):
   ```typescript
   const workerUrl = `http://localhost:${container.hostPort}/internal/exec`
   ```
   Master通过`localhost` + 容器映射的端口访问Worker

3. **容器创建流程**：
   - `containerOrchestrator.assignContainerToUser()` 创建容器
   - `containerLifecycle.createContainer()` 执行docker run
   - 端口映射：`-p ${port}:4000`
   - 健康检查：`checkContainerHealthViaExec()` 使用 `docker exec` 检查 `http://localhost:4000/internal/health`

4. **Worker启动流程**：
   - Worker容器启动后运行 `src/worker/index.ts`
   - 启动 `workerInternalAPI.start(port)`
   - 监听 `0.0.0.0:4000`
   - 提供 `/internal/health` 和 `/internal/exec` 端点

### 可能的问题点

1. **Worker容器未正确启动**
   - Dockerfile中Worker使用Node.js + tsx运行
   - 健康检查可能失败

2. **端口映射问题**
   - 容器端口映射可能未正确设置
   - `localhost:${hostPort}` 无法访问

3. **Worker启动超时**
   - 容器创建后需要等待健康检查
   - 90秒超时可能不够或检查逻辑有问题

4. **Docker网络问题**
   - Master和Worker容器之间的网络通信
   - `localhost`访问容器映射端口的问题

## 修复方案

### 方案1：修复Worker容器健康检查

**文件**: `server/src/master/orchestrator/containerOperations.ts`

**问题**: `checkContainerHealthViaExec()` 使用 `docker exec` 在容器内检查健康状态

**修复**: 
1. 改进健康检查逻辑
2. 添加更详细的日志
3. 检查Worker是否正确启动

### 方案2：修复Worker启动问题

**文件**: `server/src/worker/index.ts` 和 `server/src/worker/server/index.ts`

**检查**:
1. Worker是否正确启动
2. 端口监听是否正常
3. 健康检查端点是否可用

### 方案3：修复Master到Worker的HTTP连接

**文件**: `server/src/master/integrations/workerToolExecutor.ts`

**问题**: `fetch(http://localhost:${container.hostPort}/internal/exec)` 可能连接失败

**修复**:
1. 改进错误处理和日志
2. 检查容器状态后再发送请求
3. 添加重试机制

### 方案4：检查Docker端口映射

**文件**: `server/src/master/orchestrator/containerLifecycle.ts`

**检查**:
1. 容器是否正确映射端口
2. `hostPort` 是否正确保存到映射中

## 实施步骤

### 步骤1：添加详细日志诊断
- [ ] 在 `workerToolExecutor.ts` 添加连接前的日志
- [ ] 在 `containerLifecycle.ts` 添加容器创建后的状态日志
- [ ] 在 `workerForwarder.ts` 添加连接日志

### 步骤2：检查Worker启动
- [ ] 检查Worker容器日志
- [ ] 验证Worker健康检查端点
- [ ] 确认Worker是否正确监听4000端口

### 步骤3：修复连接问题
- [ ] 修复 `workerToolExecutor.executeTool()` 中的连接逻辑
- [ ] 确保容器健康后才发送请求
- [ ] 添加连接重试机制

### 步骤4：测试验证
- [ ] 测试容器创建流程
- [ ] 测试Worker健康检查
- [ ] 测试Master到Worker的HTTP连接
- [ ] 测试完整工具执行流程

## 相关文件

### Master端
- `server/src/master/services/conversation/sessionConversationManager.ts`
- `server/src/master/integrations/workerToolExecutor.ts`
- `server/src/master/websocket/workerForwarder.ts`
- `server/src/master/orchestrator/containerOrchestrator.ts`
- `server/src/master/orchestrator/containerLifecycle.ts`
- `server/src/master/orchestrator/containerOperations.ts`

### Worker端
- `server/src/worker/index.ts`
- `server/src/worker/server/index.ts`

### Docker配置
- `server/Dockerfile`
