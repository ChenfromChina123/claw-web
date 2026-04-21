/**
 * 系统工具集
 * 
 * 功能：
 * - ClipboardRead: 读取剪贴板
 * - ClipboardWrite: 写入剪贴板
 * - SystemInfo: 获取系统信息
 * - ProcessList: 列出运行中的进程
 * - EnvGet: 获取环境变量
 * - EnvSet: 设置环境变量
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'

const execAsync = promisify(exec)

/**
 * 系统工具配置
 */
const SYSTEM_CONFIG = {
  // CPU 架构
  CPU_ARCH: process.arch,
  // 平台
  PLATFORM: process.platform,
  // Node 版本
  NODE_VERSION: process.version,
}

/**
 * 获取 CPU 使用率（简化实现）
 */
function getCpuUsage(): string {
  const cpus = os.cpus()
  const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0)
  const totalTick = cpus.reduce(
    (acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    0
  )
  const usage = ((1 - totalIdle / totalTick) * 100).toFixed(1)
  return `${usage}%`
}

/**
 * 获取内存使用情况
 */
function getMemoryUsage(): { total: number; used: number; free: number; usagePercent: string } {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  const usagePercent = ((used / total) * 100).toFixed(1)
  return { total, used, free, usagePercent: `${usagePercent}%` }
}

/**
 * 创建系统工具定义列表
 */
export function createSystemTools(): any[] {
  return [
    // ========== 剪贴板工具 ==========
    {
      name: 'ClipboardRead',
      description: 'Read content from clipboard',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      category: 'system',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async () => {
        try {
          if (process.platform === 'win32') {
            const { stdout } = await execAsync('powershell -Command "Get-Clipboard"')
            return {
              success: true,
              result: { content: stdout.trim() },
              output: stdout.trim() || '(clipboard is empty)',
            }
          } else {
            // macOS/Linux
            const { stdout } = await execAsync('pbpaste 2>/dev/null || xclip -selection clipboard -o 2>/dev/null || echo ""')
            return {
              success: true,
              result: { content: stdout.trim() },
              output: stdout.trim() || '(clipboard is empty)',
            }
          }
        } catch {
          return {
            success: true,
            result: { content: '' },
            output: '(clipboard is empty or unavailable)',
          }
        }
      },
    },

    {
      name: 'ClipboardWrite',
      description: 'Write content to clipboard',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to write to clipboard' },
          append: { type: 'boolean', description: 'Append to existing clipboard', default: false },
          newline: { type: 'boolean', description: 'Add newline at end', default: false },
        },
        required: ['content'],
      },
      category: 'system',
      handler: async (input) => {
        let content = input.content as string
        
        if (input.newline) {
          content += '\n'
        }

        try {
          if (process.platform === 'win32') {
            // Windows PowerShell
            const escaped = content.replace(/'/g, "''")
            await execAsync(`powershell -Command "Set-Clipboard -Value '${escaped}'"`)
          } else if (process.platform === 'darwin') {
            // macOS
            await execAsync(`echo '${content.replace(/'/g, "\\'")}' | pbcopy`)
          } else {
            // Linux
            await execAsync(`echo '${content.replace(/'/g, "'")}' | xclip -selection clipboard`)
          }
          
          return {
            success: true,
            result: { copied: true, length: content.length },
            output: `Copied ${content.length} characters to clipboard`,
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to write to clipboard: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== 系统信息工具 ==========
    {
      name: 'SystemInfo',
      description: 'Get system information',
      inputSchema: {
        type: 'object',
        properties: {
          detail: { 
            type: 'boolean', 
            description: 'Show detailed information',
            default: false 
          },
        },
      },
      category: 'system',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const memory = getMemoryUsage()
        const cpuUsage = getCpuUsage()
        
        const info = {
          platform: os.platform(),
          arch: os.arch(),
          hostname: os.hostname(),
          cpuCores: os.cpus().length,
          cpuModel: os.cpus()[0]?.model || 'Unknown',
          cpuUsage,
          totalMemory: memory.total,
          usedMemory: memory.used,
          freeMemory: memory.free,
          memoryUsage: memory.usagePercent,
          uptime: os.uptime(),
          nodeVersion: process.version,
          workingDirectory: process.cwd(),
        }

        let output = `System Information:
- Platform: ${info.platform} (${info.arch})
- Hostname: ${info.hostname}
- CPU: ${info.cpuCores} cores - ${info.cpuModel}
- CPU Usage: ${cpuUsage}
- Memory: ${formatBytes(info.usedMemory)} / ${formatBytes(info.totalMemory)} (${memory.usagePercent})
- Uptime: ${formatUptime(info.uptime)}
- Node.js: ${info.nodeVersion}
- Working Directory: ${info.workingDirectory}`

        return {
          success: true,
          result: info,
          output,
        }
      },
    },

    // ========== 进程列表工具 ==========
    {
      name: 'ProcessList',
      description: 'List running processes',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of processes', default: 20 },
          sortBy: { 
            type: 'string', 
            description: 'Sort by: cpu, memory, pid',
            enum: ['cpu', 'memory', 'pid'],
            default: 'pid' 
          },
          filter: { type: 'string', description: 'Filter by process name' },
        },
      },
      category: 'system',
      isReadOnly: true,
      handler: async (input) => {
        const limit = (input.limit as number) || 20
        const sortBy = (input.sortBy as string) || 'pid'
        const filter = (input.filter as string)?.toLowerCase()

        try {
          let command: string
          if (process.platform === 'win32') {
            command = 'powershell -Command "Get-Process | Select-Object -Property Name,Id,CPU,WorkingSet64 | ConvertTo-Json"'
          } else {
            command = 'ps aux --no-headers'
          }

          const { stdout } = await execAsync(command, { maxBuffer: 1024 * 1024 })

          let processes: Array<{ name: string; pid: number; cpu: number; memory: number }> = []

          if (process.platform === 'win32') {
            try {
              const parsed = JSON.parse(stdout)
              const procs = Array.isArray(parsed) ? parsed : [parsed]
              processes = procs.map((p: any) => ({
                name: p.Name || '',
                pid: p.Id || 0,
                cpu: p.CPU || 0,
                memory: p.WorkingSet64 || 0,
              }))
            } catch {
              processes = []
            }
          } else {
            const lines = stdout.split('\n').filter(Boolean)
            processes = lines.slice(0, 100).map(line => {
              const parts = line.trim().split(/\s+/)
              return {
                name: parts[10] || 'unknown',
                pid: parseInt(parts[1]) || 0,
                cpu: parseFloat(parts[2]) || 0,
                memory: parseInt(parts[5]) || 0,
              }
            })
          }

          // 过滤
          if (filter) {
            processes = processes.filter(p => 
              p.name.toLowerCase().includes(filter)
            )
          }

          // 排序
          if (sortBy === 'cpu') {
            processes.sort((a, b) => b.cpu - a.cpu)
          } else if (sortBy === 'memory') {
            processes.sort((a, b) => b.memory - a.memory)
          } else {
            processes.sort((a, b) => a.pid - b.pid)
          }

          // 限制数量
          processes = processes.slice(0, limit)

          const output = processes.map(p => 
            `${p.pid.toString().padStart(6)} ${formatBytes(p.memory).padStart(10)} ${p.cpu.toFixed(1).padStart(6)}% ${p.name}`
          ).join('\n')

          return {
            success: true,
            result: {
              count: processes.length,
              processes,
            },
            output: `    PID      MEMORY      CPU%   NAME\n${output}`,
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to list processes: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== 环境变量工具 ==========
    {
      name: 'EnvGet',
      description: 'Get environment variables',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Variable name (leave empty for all)' },
          prefix: { type: 'string', description: 'Filter by prefix' },
        },
      },
      category: 'system',
      isReadOnly: true,
      handler: async (input) => {
        const key = input.key as string
        const prefix = input.prefix as string

        if (key) {
          const value = process.env[key]
          return {
            success: true,
            result: { [key]: value || null },
            output: value !== undefined ? `${key}=${value}` : `${key} is not set`,
          }
        }

        const env = process.env
        let keys = Object.keys(env)

        if (prefix) {
          keys = keys.filter(k => k.startsWith(prefix))
        }

        keys.sort()
        
        const vars = keys.map(k => `${k}=${env[k]}`)
        const output = vars.join('\n')

        return {
          success: true,
          result: { count: keys.length, variables: vars },
          output: `[${keys.length} environment variables]\n${output}`,
        }
      },
    },

    {
      name: 'EnvSet',
      description: 'Set environment variables (session only)',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Variable name' },
          value: { type: 'string', description: 'Variable value' },
          append: { type: 'boolean', description: 'Append to existing value', default: false },
        },
        required: ['key', 'value'],
      },
      category: 'system',
      handler: async (input) => {
        const key = input.key as string
        let value = input.value as string
        const append = (input.append as boolean) || false

        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          return {
            success: false,
            error: 'Invalid environment variable name',
          }
        }

        if (append && process.env[key]) {
          value = process.env[key] + value
        }

        process.env[key] = value

        return {
          success: true,
          result: { [key]: value },
          output: `${key}=${value}`,
        }
      },
    },
  ]
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  
  return parts.join(' ') || '<1m'
}

export default createSystemTools
