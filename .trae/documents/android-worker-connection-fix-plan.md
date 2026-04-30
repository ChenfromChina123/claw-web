# 安卓App登录后无法连接Worker问题修复计划

## 问题分析

### 现象
1. 安卓App登录后执行命令（如 `uname -a`）失败
2. 错误信息：`{"success":false,"error":"Worker 请求失败: Unable to connect. Is the computer able to access the url?"}`
3. 后端日志显示 `Tool execution timeout` 在 `sessionConversationManager.ts:952`

### 根本原因

#### 1. 网络配置问题（安卓App端）
- `NetworkConfig.kt` 中默认使用 `10.0.2.2`（Android模拟器回环地址）
- 真机环境需要使用局域网IP（如 `192.168.65.123`）
- 当前配置可能无法正确检测真机环境

#### 2. Worker连接问题（后端）
从代码分析，Worker连接流程如下：
1. `sessionConversationManager.processMessage()` 调用 `workerForwarder.ensureUserWorkerConnection(userId)`
2. `workerForwarder` 尝试通过 `containerOrchestrator` 获取或分配Worker容器
3. `workerToolExecutor.executeTool()` 通过HTTP向Worker发送请求：`http://localhost:${container.hostPort}/internal/exec`

**关键问题**：
- Worker容器可能未正确启动或分配
- 容器状态可能为 `paused`，恢复失败
- Worker端口映射可能有问题

#### 3. 工具执行超时
- `sessionConversationManager.ts:952` 设置了30秒超时
- 如果Worker连接失败，会导致工具执行超时

## 修复方案

### 方案1：修复安卓App网络配置检测

**文件**: `chat_application/app/src/main/java/com/example/claw_code_application/util/NetworkConfig.kt`

**修改内容**:
1. 改进环境检测逻辑，确保真机环境正确识别
2. 添加网络连通性检测功能
3. 优化自动探测后端地址的逻辑

### 方案2：修复Worker容器分配和连接

**文件**: `server/src/master/websocket/workerForwarder.ts`

**修改内容**:
1. 改进 `ensureUserWorkerConnection()` 的错误处理和日志
2. 确保容器分配失败时返回明确的错误信息
3. 修复容器状态检查和恢复逻辑

**文件**: `server/src/master/orchestrator/containerOrchestrator.ts`

**修改内容**:
1. 检查容器分配逻辑
2. 确保Worker容器正确启动和端口映射

### 方案3：改进错误信息传递

**文件**: `server/src/master/integrations/workerToolExecutor.ts`

**修改内容**:
1. 改进错误信息，区分不同类型的连接失败
2. 添加更详细的日志记录

## 实施步骤

### 步骤1：检查并修复安卓App网络配置
- [ ] 检查 `NetworkEnvironment.detectEnvironment()` 实现
- [ ] 确保真机环境正确识别
- [ ] 添加后端连通性测试功能

### 步骤2：检查Worker容器编排
- [ ] 检查 `containerOrchestrator.ts` 容器分配逻辑
- [ ] 确保Worker容器正确启动
- [ ] 验证端口映射配置

### 步骤3：改进错误处理和日志
- [ ] 在 `workerForwarder.ts` 添加详细日志
- [ ] 在 `workerToolExecutor.ts` 改进错误信息
- [ ] 确保错误信息能正确传递到前端

### 步骤4：测试验证
- [ ] 测试安卓App连接后端
- [ ] 测试Worker容器分配
- [ ] 测试工具执行流程

## 预期结果

1. 安卓App能够正确检测网络环境并连接到后端
2. Worker容器能够正确分配和连接
3. 工具执行不再超时，返回正确结果

## 相关文件

### 安卓App端
- `chat_application/app/src/main/java/com/example/claw_code_application/util/NetworkConfig.kt`
- `chat_application/app/src/main/java/com/example/claw_code_application/util/NetworkEnvironment.kt` (需要检查)

### 后端
- `server/src/master/services/conversation/sessionConversationManager.ts`
- `server/src/master/websocket/workerForwarder.ts`
- `server/src/master/integrations/workerToolExecutor.ts`
- `server/src/master/orchestrator/containerOrchestrator.ts` (需要检查)
