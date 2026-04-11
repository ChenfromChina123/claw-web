# 终端隔离使用指南

## 概述

终端隔离功能为每个用户提供安全的沙箱环境，确保用户只能在其工作目录内操作，无法访问上层目录或其他用户的数据。

## 核心功能

### 1. 路径隔离
- 用户只能访问其工作目录及其子目录
- 禁止使用 `cd ..` 切换到父目录
- 禁止使用 `../` 路径遍历访问受限区域

### 2. 命令验证
- 白名单机制：只允许执行安全的命令
- 黑名单机制：阻止危险命令（如 sudo、mount、ssh 等）
- 路径参数验证：检查命令中的路径是否在允许范围内

### 3. 路径虚拟化
- 隐藏真实路径，只显示用户 ID
- 示例：`/app/workspaces/users/user123` 显示为 `/user123`

### 4. 审计日志
- 记录所有命令执行
- 记录被阻止的危险操作
- 支持按用户和会话查询日志

## 使用示例

### 基本用法

```typescript
import { ptyManager } from './integration/ptyManager'

// 创建带隔离的终端会话
const session = ptyManager.createSession({
  connectionId: 'conn-123',
  userId: 'user-456',
  userRoot: '/workspaces/users/user-456',  // 用户工作目录
  enableIsolation: true,  // 启用隔离（默认 true）
  strictMode: true,       // 严格模式（只允许白名单命令）
  cols: 120,
  rows: 30,
})

// 发送命令（会自动验证）
ptyManager.write(session.id, 'ls -la\n')

// 监听输出
ptyManager.onOutput(session.id, (output) => {
  console.log(output.data)
})
```

### 路径沙箱直接用法

```typescript
import { createPathSandbox } from './security'

// 创建路径沙箱
const sandbox = createPathSandbox(
  'user-456',
  '/workspaces/users/user-456'
)

// 验证路径
const result = sandbox.resolvePath('../etc/passwd')
if (!result.allowed) {
  console.log(result.reason)
  // 输出：❌ 安全限制：路径包含 ".."（父目录引用），禁止访问工作目录外的区域。
}

// 验证命令
const cmdResult = sandbox.validateCommand('cat ../../etc/passwd')
if (!cmdResult.allowed) {
  console.log(cmdResult.reason)
  // 输出：检测到路径遍历攻击
}

// 获取虚拟路径
const virtualPath = sandbox.getVirtualPath('/workspaces/users/user-456/src')
console.log(virtualPath)
// 输出：/user-456/src
```

### 审计日志查询

```typescript
import { ptyManager } from './integration/ptyManager'

// 获取所有审计日志
const allLogs = ptyManager.getAuditLog({ limit: 50 })

// 按用户查询
const userLogs = ptyManager.getAuditLog({
  userId: 'user-456',
  limit: 100
})

// 按会话查询
const sessionLogs = ptyManager.getAuditLog({
  sessionId: 'session-789',
  limit: 50
})

// 只查看被阻止的命令
const blockedLogs = allLogs.filter(log => log.type === 'command_blocked')
```

## 安全配置

### 命令白名单

默认允许的命令：

```typescript
const DEFAULT_ALLOWED_COMMANDS = [
  // 基础命令
  'ls', 'dir', 'pwd', 'cd', 'echo', 'cat', 'less', 'more',
  'grep', 'find', 'which', 'whereis',
  
  // 文件操作
  'mkdir', 'rm', 'cp', 'mv', 'touch', 'ln',
  
  // 文本编辑
  'vi', 'vim', 'nano', 'emacs',
  
  // 开发工具
  'node', 'bun', 'npm', 'yarn', 'pnpm',
  'python', 'python3', 'pip',
  'git', 'diff', 'patch',
  
  // 系统信息
  'ps', 'top', 'htop', 'uptime', 'free', 'df', 'du',
  
  // 网络（受限）
  'curl', 'wget', 'ping',
]
```

### 命令黑名单

默认禁止的命令：

```typescript
const DANGEROUS_COMMANDS = [
  // 权限提升
  'sudo', 'su', 'pkexec',
  
  // 系统操作
  'mount', 'umount', 'fdisk', 'mkfs', 'dd',
  'shutdown', 'reboot',
  
  // 网络攻击
  'nc', 'netcat', 'telnet', 'ftp',
  'ssh', 'scp', 'rsync',
  'nmap', 'tcpdump',
  
  // 用户管理
  'useradd', 'userdel', 'passwd',
]
```

### 自定义白名单/黑名单

```typescript
import { createPathSandbox } from './security'

const sandbox = createPathSandbox('user-123', '/workspaces/user-123', {
  strictMode: true,
  allowedCommands: ['custom-cmd', 'my-tool'],  // 添加自定义允许命令
  blockedCommands: ['dangerous-tool']          // 添加自定义禁止命令
})
```

## 环境变量隔离

启用隔离后，会自动设置安全的环境变量：

```typescript
{
  HOME: '/workspaces/users/user-456',  // 用户工作目录
  USER: 'user-456',                     // 用户 ID
  USERNAME: 'user-456',
  PS1: 'user-456\\$ ',                  // 安全的提示符
  HISTFILE: '/dev/null',                // 禁用历史记录
  HISTSIZE: '0',
  HISTFILESIZE: '0',
  PATH: '/usr/local/bin:/usr/bin:/bin', // 受限的 PATH
}
```

## 平台兼容性

### Linux/macOS
- 完整支持所有隔离功能
- 支持 Namespaces 隔离（需要 root 权限）

### Windows
- 支持命令验证和路径沙箱
- 使用 PowerShell 作为默认 shell
- 部分 Unix 命令不可用

## 安全最佳实践

1. **始终启用隔离模式**：除非有特殊需求，否则应始终启用 `enableIsolation: true`

2. **使用严格模式**：在生产环境中使用 `strictMode: true`，只允许白名单命令

3. **定期审查审计日志**：监控被阻止的命令和路径违规尝试

4. **限制环境变量**：避免传递敏感的环境变量到隔离环境

5. **更新白名单**：定期审查和更新命令白名单，移除不必要的命令

## 故障排查

### 命令被阻止

如果合法命令被阻止，可以：

1. 检查命令是否在白名单中
2. 检查命令中的路径参数是否合法
3. 查看审计日志了解被阻止的原因

```typescript
const logs = ptyManager.getAuditLog({ userId: 'user-123', limit: 10 })
console.log(logs.filter(log => log.type === 'command_blocked'))
```

### 路径访问被拒绝

如果合法路径被拒绝：

1. 确认路径在用户工作目录内
2. 检查是否有符号链接指向外部
3. 确认没有使用 `..` 引用

## 性能考虑

- 命令验证的开销很小（< 1ms）
- 审计日志会缓存最近的 1000 条记录
- 建议定期导出审计日志到外部存储

## 未来计划

- [ ] 支持 Linux Namespaces 隔离（需要 root 权限）
- [ ] 支持资源配额管理（CPU、内存、磁盘）
- [ ] 支持命令执行超时限制
- [ ] 支持更细粒度的权限控制

## 参考资料

- [终端隔离方案设计文档](../.trae/documents/终端隔离方案.md)
- [PathSandbox API 文档](./security/pathSandbox.ts)
- [SecureTerminal API 文档](./security/secureTerminal.ts)
