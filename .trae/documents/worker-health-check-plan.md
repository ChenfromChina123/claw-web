# Worker健康检查与创建逻辑检查计划

## 问题现象

从日志可以看到：
```
[ContainerLifecycle] 容器健康检查进行中... containerId=641c4050e540c25abd6e46ff9db87e41549ef364c45fde59229843ed34365ef4, 检查次数=15, 耗时=43763ms
```

容器健康检查进行了15次（约45秒），但仍在进行中，说明健康检查一直失败。

## 检查目标

1. 检查Worker容器的健康检查逻辑
2. 检查Worker容器是否正确启动
3. 检查Master如何访问Worker的健康检查端点
4. 找出健康检查失败的根本原因

## 检查步骤

### 步骤1：检查Worker健康检查端点实现
- [ ] 查看 `server/src/worker/server/index.ts` 中的 `/internal/health` 端点
- [ ] 确认端点是否正确响应

### 步骤2：检查Master的健康检查调用
- [ ] 查看 `server/src/master/orchestrator/containerOperations.ts` 中的 `checkContainerHealthViaExec()`
- [ ] 确认健康检查命令是否正确
- [ ] 检查健康检查是通过容器内curl还是外部访问

### 步骤3：检查容器创建后的状态
- [ ] 查看 `server/src/master/orchestrator/containerLifecycle.ts` 中的健康检查循环
- [ ] 确认健康检查超时逻辑

### 步骤4：检查Worker是否正确监听
- [ ] 检查Worker是否绑定到正确的地址和端口
- [ ] 检查Docker端口映射是否正确

### 步骤5：诊断问题并修复
- [ ] 根据检查结果确定问题原因
- [ ] 实施修复

## 相关文件

- `server/src/worker/server/index.ts` - Worker健康检查端点
- `server/src/master/orchestrator/containerOperations.ts` - Master健康检查调用
- `server/src/master/orchestrator/containerLifecycle.ts` - 容器创建和健康检查循环
