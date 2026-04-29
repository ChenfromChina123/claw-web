/**
 * 远程服务器环境检查器
 *
 * 功能：
 * - 检查远程服务器是否满足 Worker 部署条件
 * - 检查 Docker 安装和运行状态
 * - 检查系统资源（CPU、内存、磁盘）
 * - 检查端口可用性
 *
 * @module EnvironmentChecker
 */

import { NodeSSH } from 'node-ssh'
import type { EnvironmentCheckResult } from './types'

/**
 * 环境检查器类
 * 用于检查远程服务器是否满足部署 Worker 的条件
 */
export class EnvironmentChecker {
  /**
   * 执行完整的环境检查
   *
   * @param host - 远程主机地址
   * @param port - SSH 端口
   * @param username - SSH 用户名
   * @param password - SSH 密码
   * @param workerPort - Worker 服务端口
   * @returns 环境检查结果
   */
  async checkEnvironment(
    host: string,
    port: number,
    username: string,
    password: string,
    workerPort: number
  ): Promise<EnvironmentCheckResult> {
    const checks: EnvironmentCheckResult['checks'] = []
    let passed = true

    const ssh = new NodeSSH()

    try {
      // 1. SSH 连接检查
      try {
        await ssh.connect({ host, port, username, password })
        checks.push({
          name: 'ssh_connectivity',
          passed: true,
          message: `SSH连接成功 (${username}@${host}:${port})`
        })
      } catch (error) {
        checks.push({
          name: 'ssh_connectivity',
          passed: false,
          message: `SSH连接失败: ${error instanceof Error ? error.message : '未知错误'}`
        })
        passed = false
        return { passed, checks }
      }

      // 2. Docker 安装检查
      const dockerVersionResult = await ssh.execCommand('docker --version')
      if (dockerVersionResult.code === 0) {
        checks.push({
          name: 'docker_installed',
          passed: true,
          message: `Docker已安装: ${dockerVersionResult.stdout.trim()}`
        })
      } else {
        checks.push({
          name: 'docker_installed',
          passed: false,
          message: 'Docker未安装'
        })
        passed = false
      }

      // 3. Docker 运行状态检查
      const dockerInfoResult = await ssh.execCommand('docker info')
      if (dockerInfoResult.code === 0) {
        checks.push({
          name: 'docker_running',
          passed: true,
          message: 'Docker服务运行正常'
        })
      } else {
        checks.push({
          name: 'docker_running',
          passed: false,
          message: 'Docker服务未运行'
        })
        passed = false
      }

      // 4. 端口可用性检查
      const portCheckResult = await ssh.execCommand(
        `netstat -tlnp 2>/dev/null | grep ':${workerPort} ' || ss -tlnp 2>/dev/null | grep ':${workerPort} ' || echo "Port available"`
      )
      if (portCheckResult.stdout.includes('Port available')) {
        checks.push({
          name: 'port_available',
          passed: true,
          message: `端口 ${workerPort} 可用`
        })
      } else {
        checks.push({
          name: 'port_available',
          passed: false,
          message: `端口 ${workerPort} 已被占用`
        })
        passed = false
      }

      // 5. 磁盘空间检查
      try {
        const diskResult = await ssh.execCommand("df -h / | tail -1 | awk '{print $4}'")
        const availableSpace = diskResult.stdout.trim()
        checks.push({
          name: 'disk_space',
          passed: true,
          message: `磁盘空间可用: ${availableSpace}`
        })
      } catch (error) {
        checks.push({
          name: 'disk_space',
          passed: false,
          message: `磁盘空间检查失败: ${error instanceof Error ? error.message : '未知错误'}`
        })
      }

      // 6. 内存检查
      try {
        const memResult = await ssh.execCommand("free -h | grep Mem | awk '{print $7}'")
        const availableMem = memResult.stdout.trim()
        checks.push({
          name: 'memory',
          passed: true,
          message: `内存可用: ${availableMem}`
        })
      } catch (error) {
        checks.push({
          name: 'memory',
          passed: false,
          message: `内存检查失败: ${error instanceof Error ? error.message : '未知错误'}`
        })
      }

      // 7. 系统架构检查
      try {
        const archResult = await ssh.execCommand('uname -m')
        checks.push({
          name: 'system_arch',
          passed: true,
          message: `系统架构: ${archResult.stdout.trim()}`,
          details: { arch: archResult.stdout.trim() }
        })
      } catch (error) {
        checks.push({
          name: 'system_arch',
          passed: false,
          message: `系统架构检查失败: ${error instanceof Error ? error.message : '未知错误'}`
        })
      }

      // 8. curl 安装检查（用于健康检查）
      const curlResult = await ssh.execCommand('which curl')
      if (curlResult.code === 0) {
        checks.push({
          name: 'curl_installed',
          passed: true,
          message: 'curl 已安装'
        })
      } else {
        checks.push({
          name: 'curl_installed',
          passed: false,
          message: 'curl 未安装（Worker 健康检查需要）'
        })
        passed = false
      }

    } catch (error) {
      checks.push({
        name: 'general',
        passed: false,
        message: `检查过程出错: ${error instanceof Error ? error.message : '未知错误'}`
      })
      passed = false
    } finally {
      ssh.dispose()
    }

    return { passed, checks }
  }

  /**
   * 获取远程服务器的系统信息
   *
   * @param host - 远程主机地址
   * @param port - SSH 端口
   * @param username - SSH 用户名
   * @param password - SSH 密码
   * @returns 系统信息对象
   */
  async getSystemInfo(
    host: string,
    port: number,
    username: string,
    password: string
  ): Promise<{
    os?: string
    arch?: string
    cpuCores?: number
    memoryGB?: number
    diskGB?: number
    dockerVersion?: string
  }> {
    const ssh = new NodeSSH()
    const info: ReturnType<EnvironmentChecker['getSystemInfo']> extends Promise<infer T> ? T : never = {}

    try {
      await ssh.connect({ host, port, username, password })

      // 获取操作系统
      try {
        const osResult = await ssh.execCommand('cat /etc/os-release | grep PRETTY_NAME | cut -d\'"\' -f2')
        if (osResult.code === 0) {
          info.os = osResult.stdout.trim()
        }
      } catch {
        // 忽略错误
      }

      // 获取架构
      try {
        const archResult = await ssh.execCommand('uname -m')
        if (archResult.code === 0) {
          info.arch = archResult.stdout.trim()
        }
      } catch {
        // 忽略错误
      }

      // 获取 CPU 核心数
      try {
        const cpuResult = await ssh.execCommand('nproc')
        if (cpuResult.code === 0) {
          info.cpuCores = parseInt(cpuResult.stdout.trim(), 10)
        }
      } catch {
        // 忽略错误
      }

      // 获取内存大小（GB）
      try {
        const memResult = await ssh.execCommand("free -g | grep Mem | awk '{print $2}'")
        if (memResult.code === 0) {
          info.memoryGB = parseInt(memResult.stdout.trim(), 10)
        }
      } catch {
        // 忽略错误
      }

      // 获取磁盘大小（GB）
      try {
        const diskResult = await ssh.execCommand("df -BG / | tail -1 | awk '{print $2}' | sed 's/G//'")
        if (diskResult.code === 0) {
          info.diskGB = parseInt(diskResult.stdout.trim(), 10)
        }
      } catch {
        // 忽略错误
      }

      // 获取 Docker 版本
      try {
        const dockerResult = await ssh.execCommand('docker --version')
        if (dockerResult.code === 0) {
          info.dockerVersion = dockerResult.stdout.trim()
        }
      } catch {
        // 忽略错误
      }

    } catch (error) {
      console.error('[EnvironmentChecker] 获取系统信息失败:', error)
    } finally {
      ssh.dispose()
    }

    return info
  }
}

/**
 * 环境检查器单例实例
 */
export const environmentChecker = new EnvironmentChecker()
