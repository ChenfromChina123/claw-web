/**
 * Shell 执行工具集
 *
 * 功能：
 * - Bash: 执行 Shell 命令（Linux/Mac）
 * - PowerShell: 执行 PowerShell 命令（Windows）
 * - Python: 执行 Python 代码
 * - Node: 执行 Node.js 代码
 * - Go: 执行 Go 代码
 * - Rust: 执行 Rust 代码
 * - GCC: 编译 C/C++ 代码
 * - 以及各种构建工具和包管理器
 *
 * 安全特性：
 * - 命令验证：检查危险命令和路径遍历攻击
 * - 结果截断：防止大输出导致 Token 超限
 */

import { spawn, execSync } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { EventSender, ToolDefinition, ToolExecutionContext, ToolResult } from '../types/toolTypes'
import { validateCommandForTraversal } from '../../utils/pathSecurity'
import { TOOL_RESULT_LIMITS, truncateString, formatBytes } from '../../utils/fileLimits'

/**
 * Shell 输出截断配置
 */
const OUTPUT_LIMITS = {
  MAX_OUTPUT_CHARS: TOOL_RESULT_LIMITS.MAX_CHARS,      // 50KB
  MAX_STDERR_CHARS: TOOL_RESULT_LIMITS.MAX_CHARS / 2, // 25KB
  PROGRESS_DEBOUNCE_MS: 100,                          // 进度事件防抖
}

/**
 * 验证 Shell 命令安全性
 */
function validateShellCommand(command: string): { valid: boolean; reason?: string } {
  // 1. 检查路径遍历攻击
  const traversalResult = validateCommandForTraversal(command)
  if (!traversalResult.allowed) {
    return { valid: false, reason: traversalResult.reason }
  }

  // 2. 检查危险命令模式
  const dangerousPatterns = [
    { pattern: /rm\s+-rf\s+\/(?!proc|sys|dev)/i, reason: '危险命令: rm -rf /' },
    { pattern: /curl.*\|.*sh/i, reason: '管道到 shell 的 curl' },
    { pattern: /wget.*\|.*sh/i, reason: '管道到 shell 的 wget' },
    { pattern: /;\s*rm\s+/i, reason: '命令后跟 rm' },
    { pattern: /\|\s*bash$/i, reason: '管道到 bash' },
    { pattern: /\|\s*sh$/i, reason: '管道到 sh' },
    { pattern: />\s*\/etc\//i, reason: '写入系统目录' },
    { pattern: /chmod\s+-R\s+777/i, reason: '危险的 chmod 777' },
    { pattern: /;\s*nc\s+-e/i, reason: 'Netcat 反向 shell' },
    { pattern: /eval\s*\(/i, reason: '危险的 eval' },
    { pattern: /exec\s*\(/i, reason: '危险的 exec' },
  ]

  for (const { pattern, reason } of dangerousPatterns) {
    if (pattern.test(command)) {
      return { valid: false, reason: `❌ 安全限制：${reason}` }
    }
  }

  return { valid: true }
}

/**
 * 截断输出内容
 */
function truncateOutput(stdout: string, stderr: string): {
  stdout: string
  stderr: string
  wasTruncated: boolean
  notice: string
} {
  let truncated = false
  let notice = ''

  if (stdout.length > OUTPUT_LIMITS.MAX_OUTPUT_CHARS) {
    const result = truncateString(stdout, OUTPUT_LIMITS.MAX_OUTPUT_CHARS)
    stdout = result.truncated
    truncated = true
  }

  if (stderr.length > OUTPUT_LIMITS.MAX_STDERR_CHARS) {
    const result = truncateString(stderr, OUTPUT_LIMITS.MAX_STDERR_CHARS)
    stderr = result.truncated
    truncated = true
  }

  if (truncated) {
    notice = '\n\n[输出已截断以防止 Token 超限]'
  }

  return { stdout, stderr, wasTruncated: truncated, notice }
}

/**
 * 创建 Shell 工具定义列表
 */
export function createShellTools(): ToolDefinition[] {
  return [
    {
      name: 'Bash',
      description: 'Execute shell commands in the terminal',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
          env: { type: 'object', description: 'Environment variables' },
        },
        required: ['command'],
      },
      category: 'shell',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = input.command as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000
        const env = (input.env as Record<string, string>) || {}

        // 安全检查
        const validation = validateShellCommand(command)
        if (!validation.valid) {
          return {
            success: false,
            error: validation.reason,
          }
        }

        sendEvent?.('tool_progress', { output: `$ ${command}\n` })

        return new Promise((resolve) => {
          const isWindows = process.platform === 'win32'
          const shell = isWindows ? 'powershell.exe' : '/bin/bash'
          const args = isWindows
            ? ['-NoProfile', '-Command', command]
            : ['-c', command]

          const child = spawn(shell, args, {
            cwd,
            timeout,
            env: { ...process.env, ...env },
          })

          let stdout = ''
          let stderr = ''
          let lastProgressTime = 0

          child.stdout?.on('data', (data) => {
            const text = data.toString()
            stdout += text

            // 防抖发送进度事件
            const now = Date.now()
            if (now - lastProgressTime > OUTPUT_LIMITS.PROGRESS_DEBOUNCE_MS) {
              sendEvent?.('tool_progress', { output: text })
              lastProgressTime = now
            }
          })

          child.stderr?.on('data', (data) => {
            const text = data.toString()
            stderr += text
            sendEvent?.('tool_progress', { output: `[stderr] ${text}` })
          })

          child.on('error', (error) => {
            stderr += error.message
          })

          child.on('close', (code) => {
            // 截断输出
            const truncated = truncateOutput(stdout, stderr)

            resolve({
              success: (code || 0) === 0,
              result: {
                stdout: truncated.stdout,
                stderr: truncated.stderr,
                exitCode: code || 0,
                wasTruncated: truncated.wasTruncated,
              },
              output: truncated.stdout + (truncated.stderr ? `\n[stderr]\n${truncated.stderr}` : '') + truncated.notice,
            })
          })

          setTimeout(() => {
            child.kill()
            stderr += '\n[Process killed due to timeout]'
            const truncated = truncateOutput(stdout, stderr)
            resolve({
              success: false,
              error: 'Process killed due to timeout',
              result: { stdout: truncated.stdout, stderr, exitCode: 124 },
              output: truncated.stdout + `\n[stderr]\n${stderr}`,
            })
          }, timeout)
        })
      },
    },

    {
      name: 'PowerShell',
      description: 'Execute PowerShell commands (Windows only)',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'PowerShell command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
        },
        required: ['command'],
      },
      category: 'shell',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        if (process.platform !== 'win32') {
          return {
            success: false,
            error: 'PowerShell tool is only available on Windows',
          }
        }

        const command = input.command as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000

        // 安全检查
        const validation = validateShellCommand(command)
        if (!validation.valid) {
          return {
            success: false,
            error: validation.reason,
          }
        }

        sendEvent?.('tool_progress', { output: `PS> ${command}\n` })

        return new Promise((resolve) => {
          const child = spawn('powershell.exe', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            command
          ], {
            cwd,
            timeout,
          })

          let stdout = ''
          let stderr = ''

          child.stdout?.on('data', (data) => {
            const text = data.toString()
            stdout += text
            sendEvent?.('tool_progress', { output: text })
          })

          child.stderr?.on('data', (data) => {
            const text = data.toString()
            stderr += text
            sendEvent?.('tool_progress', { output: `[stderr] ${text}` })
          })

          child.on('error', (error) => {
            stderr += error.message
          })

          child.on('close', (code) => {
            // 截断输出
            const truncated = truncateOutput(stdout, stderr)

            resolve({
              success: (code || 0) === 0,
              result: {
                stdout: truncated.stdout,
                stderr: truncated.stderr,
                exitCode: code || 0,
                wasTruncated: truncated.wasTruncated,
              },
              output: truncated.stdout + (truncated.stderr ? `\n[stderr]\n${truncated.stderr}` : '') + truncated.notice,
            })
          })

          setTimeout(() => {
            child.kill()
            stderr += '\n[Process killed due to timeout]'
            const truncated = truncateOutput(stdout, stderr)
            resolve({
              success: false,
              error: 'Process killed due to timeout',
              result: { stdout: truncated.stdout, stderr, exitCode: 124 },
              output: truncated.stdout + `\n[stderr]\n${stderr}`,
            })
          }, timeout)
        })
      },
    },

    // ========== Python 工具 ==========
    {
      name: 'Python',
      description: 'Execute Python code or scripts',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code or script path' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command line arguments' },
          version: { type: 'string', enum: ['2', '3', 'auto'], description: 'Python version', default: 'auto' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
        },
        required: ['code'],
      },
      category: 'language',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const code = input.code as string
        const args = (input.args as string[]) || []
        const version = (input.version as string) || 'auto'
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000

        const pythonCmd = version === '2' ? 'python2' : version === '3' ? 'python3' : 'python'
        
        // 判断是代码还是文件路径
        const isFile = code.endsWith('.py') && !code.includes('\n')
        const cmdArgs = isFile 
          ? [code, ...args]
          : ['-c', code, ...args]

        sendEvent?.('tool_progress', { output: `$ ${pythonCmd} ${cmdArgs.join(' ')}\n` })

        return executeShellCommand(pythonCmd, cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Pip 工具 ==========
    {
      name: 'Pip',
      description: 'Python pip package manager',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['install', 'uninstall', 'list', 'show', 'freeze', 'search', 'check'], description: 'pip command' },
          package: { type: 'string', description: 'Package name' },
          version: { type: 'string', description: 'Package version' },
          options: { type: 'string', description: 'Extra options' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 },
        },
        required: ['command'],
      },
      category: 'package',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = input.command as string
        const packageName = input.package as string
        const version = input.version as string
        const options = input.options as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 120000

        const cmdArgs = ['pip', command]
        if (packageName) {
          cmdArgs.push(version ? `${packageName}==${version}` : packageName)
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }

        sendEvent?.('tool_progress', { output: `$ pip ${cmdArgs.slice(1).join(' ')}\n` })

        return executeShellCommand(process.platform === 'win32' ? 'pip' : 'pip3', cmdArgs.slice(1), cwd, timeout, sendEvent)
      },
    },

    // ========== Node 工具 ==========
    {
      name: 'Node',
      description: 'Execute Node.js code or scripts',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript code or script path' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command line arguments' },
          moduleType: { type: 'string', enum: ['commonjs', 'module', 'auto'], description: 'Module type', default: 'auto' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
        },
        required: ['code'],
      },
      category: 'language',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const code = input.code as string
        const args = (input.args as string[]) || []
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000

        // 判断是代码还是文件路径
        const isFile = code.endsWith('.js') || code.endsWith('.mjs') || code.endsWith('.cjs')
        const isInline = !isFile && !code.includes('\n') === false
        
        let cmdArgs: string[]
        if (isInline) {
          // 创建临时文件执行
          const tempFile = path.join(os.tmpdir(), `temp_script_${Date.now()}.mjs`)
          await fs.writeFile(tempFile, code)
          cmdArgs = [tempFile, ...args]
        } else {
          cmdArgs = [code, ...args]
        }

        sendEvent?.('tool_progress', { output: `$ node ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('node', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== NPM 工具 ==========
    {
      name: 'Npm',
      description: 'Node.js NPM package manager',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['install', 'uninstall', 'update', 'list', 'outdated', 'run', 'init', 'pack', 'publish', 'version'], description: 'npm command' },
          package: { type: 'string', description: 'Package name' },
          version: { type: 'string', description: 'Version or tag' },
          options: { type: 'array', items: { type: 'string' }, description: 'Extra options' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 180000 },
        },
        required: ['command'],
      },
      category: 'package',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = input.command as string
        const packageName = input.package as string
        const version = input.version as string
        const options = (input.options as string[]) || []
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 180000

        const cmdArgs = [command]
        if (packageName) {
          if (command === 'install' || command === 'add') {
            cmdArgs.push(version ? `${packageName}@${version}` : packageName)
          } else {
            cmdArgs.push(packageName)
          }
        }
        cmdArgs.push(...options)

        sendEvent?.('tool_progress', { output: `$ npm ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('npm', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Go 工具 ==========
    {
      name: 'Go',
      description: 'Execute Go code or scripts',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Go code or script path' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command line arguments' },
          subcommand: { type: 'string', enum: ['run', 'build', 'test', 'get', 'install'], description: 'Go subcommand', default: 'run' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
        },
        required: ['code'],
      },
      category: 'language',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const code = input.code as string
        const args = (input.args as string[]) || []
        const subcommand = (input.subcommand as string) || 'run'
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000

        // 判断是代码还是文件路径
        const isFile = code.endsWith('.go') && !code.includes('package ')
        
        let cmdArgs: string[]
        if (isFile) {
          cmdArgs = [subcommand, code, ...args]
        } else {
          // 创建临时文件
          const tempFile = path.join(os.tmpdir(), `temp_script_${Date.now()}.go`)
          await fs.writeFile(tempFile, code)
          cmdArgs = [subcommand, tempFile, ...args]
        }

        sendEvent?.('tool_progress', { output: `$ go ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('go', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Rust 工具 ==========
    {
      name: 'Rust',
      description: 'Execute Rust code or build with Cargo',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Rust code or script path' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command line arguments' },
          subcommand: { type: 'string', enum: ['run', 'build', 'test', 'check', 'clippy', 'fmt'], description: 'Cargo subcommand', default: 'run' },
          release: { type: 'boolean', description: 'Release mode', default: false },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 },
        },
        required: ['code'],
      },
      category: 'language',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const code = input.code as string
        const args = (input.args as string[]) || []
        const subcommand = (input.subcommand as string) || 'run'
        const release = input.release as boolean
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 120000

        // 判断是代码还是文件路径
        const isFile = code.endsWith('.rs') && !code.includes('fn main')
        
        let cmdArgs: string[]
        if (isFile) {
          cmdArgs = [subcommand, code, ...args]
        } else {
          // 创建临时文件
          const tempFile = path.join(os.tmpdir(), `temp_script_${Date.now()}.rs`)
          await fs.writeFile(tempFile, code)
          cmdArgs = [subcommand, tempFile, ...args]
        }

        if (release) {
          cmdArgs.push('--release')
        }

        sendEvent?.('tool_progress', { output: `$ cargo ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('cargo', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Java 工具 ==========
    {
      name: 'Java',
      description: 'Execute Java code or compile Java programs',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Java code or .java file path' },
          args: { type: 'array', items: { type: 'string' }, description: 'Command line arguments' },
          subcommand: { type: 'string', enum: ['run', 'compile', 'jar'], description: 'Subcommand', default: 'run' },
          className: { type: 'string', description: 'Main class name' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
        },
        required: ['code'],
      },
      category: 'language',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const code = input.code as string
        const args = (input.args as string[]) || []
        const subcommand = (input.subcommand as string) || 'run'
        const className = input.className as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000

        const isFile = code.endsWith('.java')
        
        if (subcommand === 'compile' || !isFile) {
          // 创建临时目录和文件
          const tempDir = path.join(os.tmpdir(), `java_temp_${Date.now()}`)
          await fs.mkdir(tempDir, { recursive: true })
          
          const fileName = className ? `${className}.java` : 'Main.java'
          const tempFile = path.join(tempDir, fileName)
          await fs.writeFile(tempFile, code)
          
          if (subcommand === 'compile') {
            sendEvent?.('tool_progress', { output: `$ javac ${fileName}\n` })
            return executeShellCommand('javac', [fileName], tempDir, timeout, sendEvent)
          } else {
            // 编译并运行
            await executeShellCommand('javac', [fileName], tempDir, timeout, sendEvent)
            const mainClass = className || 'Main'
            sendEvent?.('tool_progress', { output: `$ java ${mainClass}\n` })
            return executeShellCommand('java', ['-cp', tempDir, mainClass, ...args], tempDir, timeout, sendEvent)
          }
        } else {
          sendEvent?.('tool_progress', { output: `$ java ${code}\n` })
          return executeShellCommand('java', [code, ...args], cwd, timeout, sendEvent)
        }
      },
    },

    // ========== GCC 工具 ==========
    {
      name: 'GCC',
      description: 'GNU C/C++ compiler',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'C/C++ code or source file path' },
          language: { type: 'string', enum: ['c', 'cpp', 'auto'], description: 'Language type', default: 'auto' },
          output: { type: 'string', description: 'Output filename' },
          options: { type: 'string', description: 'Compiler options' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
        },
        required: ['code'],
      },
      category: 'language',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const code = input.code as string
        const language = (input.language as string) || 'auto'
        const output = input.output as string
        const options = input.options as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000

        const isFile = (code.endsWith('.c') || code.endsWith('.cpp') || code.endsWith('.cc'))
        
        let compiler = 'gcc'
        let compileArgs: string[]
        
        if (language === 'cpp' || (language === 'auto' && (code.includes('iostream') || code.includes('std::')))) {
          compiler = 'g++'
        }
        
        if (isFile) {
          compileArgs = [code]
        } else {
          // 创建临时文件
          const ext = language === 'cpp' ? '.cpp' : '.c'
          const tempFile = path.join(os.tmpdir(), `temp_script_${Date.now()}${ext}`)
          await fs.writeFile(tempFile, code)
          compileArgs = [tempFile]
        }

        if (output) {
          compileArgs.push('-o', output)
        }
        if (options) {
          compileArgs.push(...options.split(' ').filter(Boolean))
        }

        sendEvent?.('tool_progress', { output: `$ ${compiler} ${compileArgs.join(' ')}\n` })

        return executeShellCommand(compiler, compileArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Make 工具 ==========
    {
      name: 'Make',
      description: 'GNU Make build tool',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Build target', default: 'all' },
          makefile: { type: 'string', description: 'Makefile path' },
          jobs: { type: 'number', description: 'Parallel jobs', default: 1 },
          options: { type: 'string', description: 'Extra options' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 300000 },
        },
      },
      category: 'builder',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const target = (input.target as string) || 'all'
        const makefile = input.makefile as string
        const jobs = (input.jobs as number) || 1
        const options = input.options as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 300000

        const cmdArgs = []
        if (makefile) {
          cmdArgs.push('-f', makefile)
        }
        if (jobs > 1) {
          cmdArgs.push(`-j${jobs}`)
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }
        cmdArgs.push(target)

        sendEvent?.('tool_progress', { output: `$ make ${cmdArgs.join(' ')}\n` })

        const makeCmd = process.platform === 'win32' ? 'nmake' : 'make'
        return executeShellCommand(makeCmd, cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Cargo 工具 ==========
    {
      name: 'Cargo',
      description: 'Rust Cargo package manager',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['build', 'run', 'test', 'check', 'update', 'add', 'remove', 'search', 'publish', 'doc', 'fmt', 'clippy'], description: 'cargo command' },
          package: { type: 'string', description: 'Package name' },
          version: { type: 'string', description: 'Version constraint' },
          options: { type: 'string', description: 'Extra options' },
          release: { type: 'boolean', description: 'Release mode', default: false },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 300000 },
        },
      },
      category: 'package',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = input.command as string
        const packageName = input.package as string
        const version = input.version as string
        const options = input.options as string
        const release = input.release as boolean
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 300000

        const cmdArgs = [command]
        if (packageName) {
          cmdArgs.push(version ? `${packageName}:${version}` : packageName)
        }
        if (release) {
          cmdArgs.push('--release')
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }

        sendEvent?.('tool_progress', { output: `$ cargo ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('cargo', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Composer 工具 ==========
    {
      name: 'Composer',
      description: 'PHP Composer package manager',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['install', 'require', 'remove', 'update', 'dump-autoload', 'show', 'outdated', 'init'], description: 'composer command' },
          package: { type: 'string', description: 'Package name' },
          version: { type: 'string', description: 'Version constraint' },
          options: { type: 'string', description: 'Extra options' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 },
        },
        required: ['command'],
      },
      category: 'package',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = input.command as string
        const packageName = input.package as string
        const version = input.version as string
        const options = input.options as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 120000

        const cmdArgs = [command]
        if (packageName) {
          cmdArgs.push(version ? `${packageName}:${version}` : packageName)
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }

        sendEvent?.('tool_progress', { output: `$ composer ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('composer', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Gradle 工具 ==========
    {
      name: 'Gradle',
      description: 'Gradle build tool',
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Gradle task', default: 'build' },
          options: { type: 'string', description: 'Extra options' },
          buildFile: { type: 'string', description: 'build.gradle path' },
          daemon: { type: 'boolean', description: 'Use Gradle Daemon', default: true },
          parallel: { type: 'boolean', description: 'Parallel execution', default: false },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 300000 },
        },
      },
      category: 'builder',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const task = (input.task as string) || 'build'
        const options = input.options as string
        const buildFile = input.buildFile as string
        const daemon = input.daemon as boolean
        const parallel = input.parallel as boolean
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 300000

        const cmdArgs = []
        if (buildFile) {
          cmdArgs.push('-b', buildFile)
        }
        if (!daemon) {
          cmdArgs.push('--no-daemon')
        }
        if (parallel) {
          cmdArgs.push('--parallel')
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }
        cmdArgs.push(task)

        sendEvent?.('tool_progress', { output: `$ gradle ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('gradle', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Maven 工具 ==========
    {
      name: 'Maven',
      description: 'Apache Maven build tool',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Maven goal', default: 'compile' },
          phase: { type: 'string', description: 'Lifecycle phase' },
          options: { type: 'string', description: 'Extra options' },
          pomFile: { type: 'string', description: 'pom.xml path' },
          threads: { type: 'string', description: 'Parallel threads' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 300000 },
        },
      },
      category: 'builder',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const goal = (input.goal as string) || 'compile'
        const phase = input.phase as string
        const options = input.options as string
        const pomFile = input.pomFile as string
        const threads = input.threads as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 300000

        const cmdArgs = []
        if (pomFile) {
          cmdArgs.push('-f', pomFile)
        }
        if (threads) {
          cmdArgs.push(`-T${threads}`)
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }
        cmdArgs.push(phase || goal)

        sendEvent?.('tool_progress', { output: `$ mvn ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('mvn', cmdArgs, cwd, timeout, sendEvent)
      },
    },

    // ========== Vite 工具 ==========
    {
      name: 'Vite',
      description: 'Vite build tool',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['build', 'dev', 'preview', 'optimize'], description: 'Command', default: 'build' },
          config: { type: 'string', description: 'Config file path' },
          mode: { type: 'string', description: 'Environment mode', default: 'production' },
          options: { type: 'string', description: 'Extra options' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 },
        },
      },
      category: 'builder',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = (input.command as string) || 'build'
        const config = input.config as string
        const mode = input.mode as string
        const options = input.options as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 120000

        const cmdArgs = [command]
        if (config) {
          cmdArgs.push('--config', config)
        }
        if (mode) {
          cmdArgs.push('--mode', mode)
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }

        sendEvent?.('tool_progress', { output: `$ vite ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('npx', ['vite', ...cmdArgs], cwd, timeout, sendEvent)
      },
    },

    // ========== Webpack 工具 ==========
    {
      name: 'Webpack',
      description: 'Webpack bundler',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: ['build', 'watch', 'serve', 'info'], description: 'Command', default: 'build' },
          config: { type: 'string', description: 'Config file path' },
          mode: { type: 'string', enum: ['production', 'development'], description: 'Build mode', default: 'production' },
          options: { type: 'string', description: 'Extra options' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 },
        },
      },
      category: 'builder',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = (input.command as string) || 'build'
        const config = input.config as string
        const mode = input.mode as string
        const options = input.options as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 120000

        const cmdArgs = []
        if (config) {
          cmdArgs.push('--config', config)
        }
        if (mode) {
          cmdArgs.push('--mode', mode)
        }
        if (options) {
          cmdArgs.push(...options.split(' ').filter(Boolean))
        }

        sendEvent?.('tool_progress', { output: `$ webpack ${cmdArgs.join(' ')}\n` })

        return executeShellCommand('npx', ['webpack', command, ...cmdArgs], cwd, timeout, sendEvent)
      },
    },
  ]
}

/**
 * 通用 Shell 命令执行函数
 */
async function executeShellCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  sendEvent?: EventSender
): Promise<ToolResult> {
  const fullCommand = `${command} ${args.join(' ')}`
  
  // 安全检查
  const validation = validateShellCommand(`${command} ${args.join(' ')}`)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.reason,
    }
  }

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'cmd.exe' : '/bin/sh'
    const shellArgs = isWindows 
      ? ['/c', fullCommand]
      : ['-c', fullCommand]

    const child = spawn(shell, shellArgs, {
      cwd,
      timeout,
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let lastProgressTime = 0

    child.stdout?.on('data', (data) => {
      const text = data.toString()
      stdout += text

      const now = Date.now()
      if (now - lastProgressTime > OUTPUT_LIMITS.PROGRESS_DEBOUNCE_MS) {
        sendEvent?.('tool_progress', { output: text })
        lastProgressTime = now
      }
    })

    child.stderr?.on('data', (data) => {
      const text = data.toString()
      stderr += text
      sendEvent?.('tool_progress', { output: `[stderr] ${text}` })
    })

    child.on('error', (error) => {
      stderr += error.message
    })

    child.on('close', (code) => {
      const truncated = truncateOutput(stdout, stderr)

      resolve({
        success: (code || 0) === 0,
        result: {
          stdout: truncated.stdout,
          stderr: truncated.stderr,
          exitCode: code || 0,
          wasTruncated: truncated.wasTruncated,
        },
        output: truncated.stdout + (truncated.stderr ? `\n[stderr]\n${truncated.stderr}` : '') + truncated.notice,
      })
    })

    setTimeout(() => {
      child.kill()
      stderr += '\n[Process killed due to timeout]'
      const truncated = truncateOutput(stdout, stderr)
      resolve({
        success: false,
        error: 'Process killed due to timeout',
        result: { stdout: truncated.stdout, stderr, exitCode: 124 },
        output: truncated.stdout + `\n[stderr]\n${stderr}`,
      })
    }, timeout)
  })
}
