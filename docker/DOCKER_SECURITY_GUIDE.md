# Docker 安全部署指南

本文档介绍如何在生产环境中安全部署 Claude Code HAHA 应用。

## 📋 目录

- [安全特性概述](#安全特性概述)
- [生产环境部署](#生产环境部署)
- [开发环境部署](#开发环境部署)
- [安全配置说明](#安全配置说明)
- [故障排查](#故障排查)

---

## 🔒 安全特性概述

### 应用层安全（已实现）

✅ **脚本执行安全防护**
- 脚本内容静态分析（检测危险模式）
- 远程脚本下载检测（阻止 `curl | bash` 等）
- 脚本执行路径验证
- 文件大小限制（1MB）

✅ **命令验证**
- 解释器调用检测（Python、Node.js 等）
- 路径沙箱隔离
- 命令白名单/黑名单
- 改进的 `cd ..` 处理（允许在安全范围内）

✅ **审计日志**
- 脚本执行审计
- 命令执行审计
- 安全事件分级（low/medium/high/critical）

### 容器层安全（本阶段实现）

✅ **细粒度能力控制**
- 丢弃所有能力（`cap_drop: ALL`）
- 仅添加必需能力（CHOWN, SETUID, SETGID, MKNOD, AUDIT_WRITE）
- 替代 `privileged: true`（过于宽松）

✅ **Seccomp 安全配置文件**
- 限制系统调用
- 仅允许必要的系统调用
- 阻止危险操作

✅ **文件系统安全**
- 只读根文件系统（`read_only: true`）
- 临时文件系统（noexec, nosuid）
- 禁止执行用户目录中的二进制文件

✅ **资源限制**
- CPU 限制
- 内存限制
- 进程数限制

---

## 🚀 生产环境部署

### 1. 准备文件

```bash
# 确保以下文件存在
docker/seccomp-profile.json          # Seccomp 安全配置文件
docker/docker-compose.prod.yml       # 生产环境配置
server/Dockerfile                     # 后端 Dockerfile（已优化）
```

### 2. 部署命令

```bash
# 使用生产环境配置启动
docker-compose -f docker/docker-compose.prod.yml up -d

# 查看容器状态
docker-compose -f docker/docker-compose.prod.yml ps

# 查看日志
docker-compose -f docker/docker-compose.prod.yml logs -f backend
```

### 3. 验证安全配置

```bash
# 验证 1：检查容器是否以非 root 用户运行
docker exec claude-backend-prod whoami
# 应该输出：bun

# 验证 2：检查能力配置
docker inspect claude-backend-prod | grep -A 10 CapDrop
# CapDrop 应该包含 ALL
# CapAdd 应该包含 CHOWN, SETUID, SETGID, MKNOD, AUDIT_WRITE

# 验证 3：检查只读文件系统
docker exec claude-backend-prod touch /test-file
# 应该失败：Read-only file system

# 验证 4：检查 Seccomp 配置
docker inspect claude-backend-prod | grep -i seccomp
# 应该输出：SecurityOpt 包含 seccomp 配置文件路径
```

---

## 💻 开发环境部署

### 1. 使用开发环境配置

```bash
# 使用开发环境配置启动
docker-compose -f docker/docker-compose.dev.yml up -d

# 开发环境特点：
# - 不禁用根文件系统写权限（方便调试）
# - 包含基础能力控制
# - 包含临时文件系统
```

### 2. 热部署开发

```bash
# 开发环境下，代码修改会自动同步
# 因为挂载了 ./server:/app:cached

# 重启容器应用修改
docker-compose -f docker/docker-compose.dev.yml restart backend
```

---

## 📊 安全配置说明

### 能力（Capabilities）配置

#### 丢弃的能力
```yaml
cap_drop:
  - ALL  # 丢弃所有能力，默认禁止所有特权操作
```

#### 添加的能力
```yaml
cap_add:
  - CHOWN        # 允许修改文件所有者（PTY 需要）
  - SETUID       # 允许设置用户 ID（PTY 需要）
  - SETGID       # 允许设置组 ID（PTY 需要）
  - MKNOD        # 允许创建设备节点（PTY 需要）
  - AUDIT_WRITE  # 允许写入审计日志（可选）
```

### Seccomp 配置文件

Seccomp（Secure Computing Mode）是 Linux 内核提供的系统调用过滤机制。

#### 允许的系统调用

我们的 Seccomp 配置文件允许以下系统调用：

1. **文件操作**
   - `open`, `openat`, `read`, `write`, `close`
   - `stat`, `fstat`, `lstat`
   - `lseek`, `pread64`, `pwrite64`

2. **进程控制**
   - `fork`, `exit`, `exit_group`
   - `getpid`, `getppid`, `gettid`
   - `wait4`, `waitid`

3. **网络操作**
   - `socket`, `bind`, `connect`
   - `accept`, `send`, `recv`
   - `listen`, `shutdown`

4. **PTY 相关**（终端支持）
   - `ptsname`, `ptsname_r`
   - `unlockpt`, `grantpt`
   - `tcgetattr`, `tcsetattr`

#### 阻止的系统调用

默认阻止所有未明确允许的系统调用，包括：
- `mount`, `umount`（挂载文件系统）
- `ptrace`（进程跟踪）
- `reboot`（重启系统）
- `sethostname`（修改主机名）
- 等等...

### 临时文件系统（tmpfs）

```yaml
tmpfs:
  - /tmp:noexec,nosuid,size=100m,mode=1777
  - /var/tmp:noexec,nosuid,size=50m,mode=1777
```

#### 挂载选项说明

- `noexec`：禁止执行二进制文件
- `nosuid`：忽略 setuid 位
- `size=100m`：限制大小为 100MB
- `mode=1777`：所有用户可读写，但只能删除自己的文件（sticky bit）

---

## 🐛 故障排查

### 问题 1：PTY 无法工作

**症状**：终端无法连接或无法输入

**原因**：能力配置不足，无法访问 PTY 设备

**解决方案**：
```yaml
cap_add:
  - CHOWN
  - SETUID
  - SETGID
  - MKNOD
```

### 问题 2：无法创建临时文件

**症状**：应用报错无法创建临时文件

**原因**：根文件系统只读且没有配置 tmpfs

**解决方案**：
```yaml
read_only: true
tmpfs:
  - /tmp:noexec,nosuid,size=100m
```

### 问题 3：Seccomp 阻止了必要的系统调用

**症状**：应用崩溃或某些功能无法使用

**原因**：Seccomp 配置文件过于严格

**解决方案**：
1. 查看被阻止的系统调用：
```bash
dmesg | grep -i seccomp
```

2. 在 `seccomp-profile.json` 中添加允许的系统调用

### 问题 4：内存不足

**症状**：容器被 OOM Killer 终止

**原因**：内存限制过低

**解决方案**：
```yaml
deploy:
  resources:
    limits:
      memory: 1024M  # 增加内存限制
```

---

## 📈 性能影响

### 安全配置的性能开销

| 特性 | CPU 开销 | 内存开销 | I/O 影响 |
|------|----------|----------|----------|
| Seccomp | < 1% | 无 | 无 |
| 能力限制 | 无 | 无 | 无 |
| 只读文件系统 | 无 | 无 | 轻微（写操作重定向） |
| tmpfs noexec | 无 | 少量（临时文件内存） | 无 |

### 推荐配置

**最低配置**（2GB RAM）：
- 使用开发环境配置
- 禁用部分安全特性

**标准配置**（4GB RAM）：
- 使用生产环境配置
- 所有安全特性启用

**高性能配置**（8GB+ RAM）：
- 使用生产环境配置
- 增加内存限制
- 可选：用户级容器隔离

---

## 🔗 参考资料

- [Docker 安全最佳实践](https://docs.docker.com/engine/security/)
- [Seccomp 官方文档](https://docs.docker.com/engine/security/seccomp/)
- [Linux Capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [Docker 用户命名空间](https://docs.docker.com/engine/security/userns-remap/)

---

**文档版本**：v1.0  
**创建日期**：2026-04-10  
**最后更新**：2026-04-10
