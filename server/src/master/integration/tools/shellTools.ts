/**
 * Shell 执行工具集
 *
 * 功能：
 * - Bash: 执行 Shell 命令（Linux/Mac）
 * - PowerShell: 执行 PowerShell 命令（Windows）
 */

import { spawn } from 'child_process'
import type { EventSender, ToolDefinition, ToolExecutionContext, ToolResult } from '../types/toolTypes'

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
            resolve({
              success: (code || 0) === 0,
              result: { stdout, stderr, exitCode: code || 0 },
              output: stdout + (stderr ? `\n[stderr]\n${stderr}` : ''),
            })
          })

          setTimeout(() => {
            child.kill()
            stderr += '\n[Process killed due to timeout]'
            resolve({
              success: false,
              error: 'Process killed due to timeout',
              result: { stdout, stderr, exitCode: 124 },
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
            resolve({
              success: (code || 0) === 0,
              result: { stdout, stderr, exitCode: code || 0 },
              output: stdout + (stderr ? `\n[stderr]\n${stderr}` : ''),
            })
          })

          setTimeout(() => {
            child.kill()
            stderr += '\n[Process killed due to timeout]'
            resolve({
              success: false,
              error: 'Process killed due to timeout',
              result: { stdout, stderr, exitCode: 124 },
            })
          }, timeout)
        })
      },
    },
  ]
}
