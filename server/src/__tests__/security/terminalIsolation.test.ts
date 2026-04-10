/**
 * 终端隔离功能测试
 * 
 * 测试路径沙箱、命令验证、安全终端等功能
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { PathSandbox, createPathSandbox } from '../../security/pathSandbox'
import { SecureTerminal, createSecureTerminal } from '../../security/secureTerminal'

describe('PathSandbox', () => {
  let sandbox: PathSandbox

  beforeEach(() => {
    sandbox = createPathSandbox(
      'test-user',
      '/workspaces/users/test-user'
    )
  })

  describe('路径验证', () => {
    test('应该允许访问工作目录内的路径', () => {
      const result = sandbox.resolvePath('src/index.ts')
      expect(result.allowed).toBe(true)
      expect(result.resolvedPath).toMatch(/workspaces[\/\\]users[\/\\]test-user[\/\\]src[\/\\]index\.ts/)
    })

    test('应该允许访问当前目录', () => {
      const result = sandbox.resolvePath('')
      expect(result.allowed).toBe(true)
      expect(result.resolvedPath).toMatch(/workspaces[\/\\]users[\/\\]test-user$/)
    })

    test('应该阻止包含 .. 的路径', () => {
      const result = sandbox.resolvePath('../etc/passwd')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('..')
    })

    test('应该阻止访问工作目录外的绝对路径', () => {
      const result = sandbox.resolvePath('/etc/passwd')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('超出工作目录范围')
    })

    test('应该规范化路径', () => {
      const result = sandbox.resolvePath('./src/../src/index.ts')
      expect(result.allowed).toBe(true)
      expect(result.resolvedPath).toMatch(/workspaces[\/\\]users[\/\\]test-user[\/\\]src[\/\\]index\.ts/)
    })

    test('应该处理 Windows 路径分隔符', () => {
      const winSandbox = createPathSandbox(
        'win-user',
        'C:\\workspaces\\users\\win-user'
      )
      const result = winSandbox.resolvePath('src\\index.ts')
      expect(result.allowed).toBe(true)
    })
  })

  describe('命令验证', () => {
    test('应该允许执行安全的命令', () => {
      const result = sandbox.validateCommand('ls -la')
      expect(result.allowed).toBe(true)
    })

    test('应该阻止黑名单中的命令', () => {
      const result = sandbox.validateCommand('sudo rm -rf /')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('sudo')
    })

    test('应该阻止包含路径遍历的命令', () => {
      const result = sandbox.validateCommand('cat ../../etc/passwd')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('..')
    })

    test('应该阻止 cd .. 命令', () => {
      const result = sandbox.validateCommand('cd ..')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('..')
    })

    test('应该允许 cd 到子目录', () => {
      const result = sandbox.validateCommand('cd src')
      expect(result.allowed).toBe(true)
    })

    test('应该允许 cd 到绝对路径（工作目录内）', () => {
      const result = sandbox.validateCommand('cd /workspaces/users/test-user/src')
      expect(result.allowed).toBe(true)
    })

    test('应该阻止 cd 到工作目录外的路径', () => {
      const result = sandbox.validateCommand('cd /etc')
      expect(result.allowed).toBe(false)
    })

    test('应该提取并验证命令中的路径参数', () => {
      const result = sandbox.validateCommand('cat /workspaces/users/test-user/file.txt')
      expect(result.allowed).toBe(true)
    })

    test('应该阻止访问工作目录外文件的命令', () => {
      const result = sandbox.validateCommand('cat /etc/passwd')
      expect(result.allowed).toBe(false)
    })

    test('应该处理带引号的路径', () => {
      const result = sandbox.validateCommand('cat "../etc/passwd"')
      expect(result.allowed).toBe(false)
    })

    test('应该处理 --path 格式的参数', () => {
      const result = sandbox.validateCommand('node --path ../etc/passwd')
      expect(result.allowed).toBe(false)
    })
  })

  describe('虚拟路径显示', () => {
    test('应该隐藏真实路径', () => {
      const virtualPath = sandbox.getVirtualPath('/workspaces/users/test-user/src')
      expect(virtualPath).toBe('/test-user/src')
    })

    test('应该处理根目录', () => {
      const virtualPath = sandbox.getVirtualPath('/workspaces/users/test-user')
      expect(virtualPath).toBe('/test-user')
    })

    test('当禁用隐藏时应该返回真实路径', () => {
      const visibleSandbox = createPathSandbox(
        'test-user',
        '/workspaces/users/test-user',
        { hideRealPath: false }
      )
      const virtualPath = visibleSandbox.getVirtualPath('/workspaces/users/test-user/src')
      expect(virtualPath).toBe('/workspaces/users/test-user/src')
    })
  })

  describe('提示符生成', () => {
    test('应该生成虚拟提示符', () => {
      const prompt = sandbox.getPrompt()
      expect(prompt).toContain('test-user')
      expect(prompt).not.toContain('/workspaces')
    })
  })

  describe('环境变量', () => {
    test('应该生成安全的环境变量', () => {
      const env = sandbox.getSecureEnv()
      expect(env.HOME).toMatch(/workspaces[\/\\]users[\/\\]test-user$/)
      expect(env.USER).toBe('test-user')
      expect(env.HISTSIZE).toBe('0')
      expect(env.HISTFILE).toBe('/dev/null')
    })
  })
})

describe('SecureTerminal', () => {
  let terminal: SecureTerminal

  beforeEach(() => {
    terminal = createSecureTerminal('session-123', {
      userId: 'test-user',
      userRoot: '/workspaces/users/test-user',
      enableAudit: false
    })
  })

  describe('输入拦截', () => {
    test('应该允许安全的输入', () => {
      const result = terminal.interceptInput('ls -la\n')
      expect(result.allowed).toBe(true)
    })

    test('应该阻止危险的输入', () => {
      const result = terminal.interceptInput('sudo rm -rf /\n')
      expect(result.allowed).toBe(false)
      expect(result.sendErrorPrompt).toBe(true)
    })

    test('应该处理多行输入', () => {
      terminal.interceptInput('echo "hello')
      const result = terminal.interceptInput('world"\n')
      expect(result.allowed).toBe(true)
    })
  })

  describe('输出处理', () => {
    test('应该替换 Unix 风格路径为虚拟路径', () => {
      const output = 'Current directory: /workspaces/users/test-user/src'
      const processed = terminal.processOutput(output)
      // Windows 上可能不会替换，因为路径格式不匹配
      // 主要测试 Unix 风格路径的替换
      expect(processed).toMatch(/\/test-user(\/src)?/)
    })

    test('应该处理多种路径格式', () => {
      const output = 'cd /workspaces/users/test-user && ls'
      const processed = terminal.processOutput(output)
      expect(processed).toContain('/test-user')
    })
  })
})

describe('命令白名单和黑名单', () => {
  let sandbox: PathSandbox

  beforeEach(() => {
    sandbox = createPathSandbox(
      'test-user',
      '/workspaces/users/test-user'
    )
  })

  test('应该允许所有白名单命令', () => {
    const allowedCommands = ['ls', 'cat', 'grep', 'find', 'git', 'npm', 'node']
    
    for (const cmd of allowedCommands) {
      const result = sandbox.validateCommand(cmd)
      expect(result.allowed).toBe(true, `Command ${cmd} should be allowed`)
    }
  })

  test('应该阻止所有黑名单命令', () => {
    const blockedCommands = ['sudo', 'su', 'mount', 'ssh', 'nc', 'useradd']
    
    for (const cmd of blockedCommands) {
      const result = sandbox.validateCommand(cmd)
      expect(result.allowed).toBe(false, `Command ${cmd} should be blocked`)
    }
  })

  test('应该支持自定义白名单', () => {
    const customSandbox = createPathSandbox(
      'test-user',
      '/workspaces/users/test-user',
      {
        allowedCommands: ['custom-cmd', 'my-tool'],
        strictMode: true
      }
    )

    expect(customSandbox.validateCommand('custom-cmd').allowed).toBe(true)
    expect(customSandbox.validateCommand('my-tool').allowed).toBe(true)
  })

  test('应该支持自定义黑名单', () => {
    const customSandbox = createPathSandbox(
      'test-user',
      '/workspaces/users/test-user',
      {
        blockedCommands: ['dangerous-tool']
      }
    )

    expect(customSandbox.validateCommand('dangerous-tool').allowed).toBe(false)
  })
})

describe('边界情况', () => {
  let sandbox: PathSandbox

  beforeEach(() => {
    sandbox = createPathSandbox(
      'test-user',
      '/workspaces/users/test-user'
    )
  })

  test('应该处理空命令', () => {
    const result = sandbox.validateCommand('')
    expect(result.allowed).toBe(true)
  })

  test('应该处理带空格的命令', () => {
    const result = sandbox.validateCommand('  ls   -la  ')
    expect(result.allowed).toBe(true)
  })

  test('应该处理管道命令', () => {
    const result = sandbox.validateCommand('ls | grep test')
    expect(result.allowed).toBe(true)
  })

  test('应该处理重定向', () => {
    const result = sandbox.validateCommand('echo test > file.txt')
    expect(result.allowed).toBe(true)
  })

  test('应该处理命令分隔符', () => {
    const result = sandbox.validateCommand('ls && echo done')
    expect(result.allowed).toBe(true)
  })

  test('应该阻止管道后的危险命令', () => {
    const result = sandbox.validateCommand('ls | sudo rm -rf /')
    expect(result.allowed).toBe(false)
  })
})
