/**
 * 内网穿透服务
 * 
 * 功能：
 * - 支持多种内网穿透方案（Cloudflare Tunnel、cpolar、frp）
 * - 自动创建和管理隧道
 * - 隧道状态监控
 * - 域名绑定
 * 
 * 使用场景：
 * - 无公网 IP 环境下的外部访问
 * - 开发测试环境的临时访问
 * - 安全的内网服务暴露
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * 隧道类型
 */
export type TunnelType = 'cloudflare' | 'cpolar' | 'frp' | 'ngrok'

/**
 * 隧道配置
 */
export interface TunnelConfig {
  projectId: string
  type: TunnelType
  localPort: number
  subdomain?: string
  customDomain?: string
  region?: string
  auth?: {
    token?: string
    apiKey?: string
    email?: string
  }
}

/**
 * 隧道信息
 */
export interface TunnelInfo {
  tunnelId: string
  projectId: string
  type: TunnelType
  publicUrl: string
  localPort: number
  status: 'active' | 'inactive' | 'error'
  createdAt: Date
  expiresAt?: Date
  bandwidth?: {
    in: number
    out: number
  }
}

/**
 * Cloudflare Tunnel 配置
 */
export interface CloudflareTunnelConfig extends TunnelConfig {
  type: 'cloudflare'
  tunnelToken?: string
  accountId?: string
  zoneId?: string
}

/**
 * cpolar 配置
 */
export interface CpolarTunnelConfig extends TunnelConfig {
  type: 'cpolar'
  authtoken?: string
}

/**
 * frp 配置
 */
export interface FrpTunnelConfig extends TunnelConfig {
  type: 'frp'
  serverAddr: string
  serverPort: number
  auth?: {
    token?: string
    user?: string
    password?: string
  }
}

// ==================== 内网穿透服务 ====================

export class TunnelService {
  private tunnelConfigDir: string

  constructor(tunnelConfigDir: string = '/etc/tunnels') {
    this.tunnelConfigDir = tunnelConfigDir
  }

  /**
   * 创建隧道
   */
  async createTunnel(config: TunnelConfig): Promise<TunnelInfo> {
    switch (config.type) {
      case 'cloudflare':
        return await this.createCloudflareTunnel(config as CloudflareTunnelConfig)
      case 'cpolar':
        return await this.createCpolarTunnel(config as CpolarTunnelConfig)
      case 'frp':
        return await this.createFrpTunnel(config as FrpTunnelConfig)
      default:
        throw new Error(`不支持的隧道类型: ${config.type}`)
    }
  }

  /**
   * 创建 Cloudflare Tunnel
   */
  private async createCloudflareTunnel(config: CloudflareTunnelConfig): Promise<TunnelInfo> {
    try {
      console.log(`[TunnelService] 创建 Cloudflare Tunnel: ${config.projectId}`)

      const tunnelId = `cf-${config.projectId}`

      // 检查 cloudflared 是否安装
      try {
        await execAsync('which cloudflared')
      } catch {
        throw new Error('cloudflared 未安装，请先安装 cloudflared')
      }

      // 使用 Tunnel Token 启动隧道（推荐方式）
      if (config.tunnelToken) {
        const command = `cloudflared tunnel run --token ${config.tunnelToken}`

        // 后台启动
        await execAsync(`nohup ${command} > /var/log/cloudflared-${tunnelId}.log 2>&1 &`)

        // 等待隧道启动
        await this.waitForTunnel(tunnelId, 'cloudflare')

        // 获取公网 URL（需要从日志中解析）
        const publicUrl = await this.getCloudflareTunnelUrl(tunnelId)

        return {
          tunnelId,
          projectId: config.projectId,
          type: 'cloudflare',
          publicUrl,
          localPort: config.localPort,
          status: 'active',
          createdAt: new Date()
        }
      }

      // 使用配置文件方式
      const configFile = path.join(this.tunnelConfigDir, `${tunnelId}.yml`)
      const configContent = `
tunnel: ${tunnelId}
credentials-file: /root/.cloudflared/${tunnelId}.json

ingress:
  - hostname: ${config.customDomain || `${config.subdomain || config.projectId}.your-domain.com`}
    service: http://localhost:${config.localPort}
  - service: http_status:404
`

      await fs.writeFile(configFile, configContent, 'utf-8')

      // 启动隧道
      await execAsync(`nohup cloudflared tunnel --config ${configFile} run > /var/log/cloudflared-${tunnelId}.log 2>&1 &`)

      const publicUrl = `https://${config.customDomain || `${config.subdomain || config.projectId}.your-domain.com`}`

      return {
        tunnelId,
        projectId: config.projectId,
        type: 'cloudflare',
        publicUrl,
        localPort: config.localPort,
        status: 'active',
        createdAt: new Date()
      }
    } catch (error) {
      console.error('[TunnelService] 创建 Cloudflare Tunnel 失败:', error)
      throw error
    }
  }

  /**
   * 创建 cpolar 隧道
   */
  private async createCpolarTunnel(config: CpolarTunnelConfig): Promise<TunnelInfo> {
    try {
      console.log(`[TunnelService] 创建 cpolar 隧道: ${config.projectId}`)

      const tunnelId = `cp-${config.projectId}`

      // 检查 cpolar 是否安装
      try {
        await execAsync('which cpolar')
      } catch {
        throw new Error('cpolar 未安装，请先安装 cpolar')
      }

      // 启动 cpolar 隧道
      const command = `cpolar http -subdomain=${config.subdomain || config.projectId} ${config.localPort}`

      await execAsync(`nohup ${command} > /var/log/cpolar-${tunnelId}.log 2>&1 &`)

      // 等待隧道启动
      await this.waitForTunnel(tunnelId, 'cpolar')

      // 获取公网 URL
      const publicUrl = await this.getCpolarTunnelUrl(tunnelId)

      return {
        tunnelId,
        projectId: config.projectId,
        type: 'cpolar',
        publicUrl,
        localPort: config.localPort,
        status: 'active',
        createdAt: new Date()
      }
    } catch (error) {
      console.error('[TunnelService] 创建 cpolar 隧道失败:', error)
      throw error
    }
  }

  /**
   * 创建 frp 隧道
   */
  private async createFrpTunnel(config: FrpTunnelConfig): Promise<TunnelInfo> {
    try {
      console.log(`[TunnelService] 创建 frp 隧道: ${config.projectId}`)

      const tunnelId = `frp-${config.projectId}`

      // 检查 frpc 是否安装
      try {
        await execAsync('which frpc')
      } catch {
        throw new Error('frpc 未安装，请先安装 frp')
      }

      // 生成 frp 配置文件
      const configFile = path.join(this.tunnelConfigDir, `${tunnelId}.ini`)
      const configContent = `
[common]
server_addr = ${config.serverAddr}
server_port = ${config.serverPort}
${config.auth?.token ? `token = ${config.auth.token}` : ''}
${config.auth?.user ? `user = ${config.auth.user}` : ''}

[${config.projectId}]
type = http
local_ip = 127.0.0.1
local_port = ${config.localPort}
custom_domains = ${config.customDomain || `${config.subdomain || config.projectId}.frp.com`}
`

      await fs.writeFile(configFile, configContent, 'utf-8')

      // 启动 frp 客户端
      await execAsync(`nohup frpc -c ${configFile} > /var/log/frpc-${tunnelId}.log 2>&1 &`)

      // 等待隧道启动
      await this.waitForTunnel(tunnelId, 'frp')

      const publicUrl = `http://${config.customDomain || `${config.subdomain || config.projectId}.frp.com`}`

      return {
        tunnelId,
        projectId: config.projectId,
        type: 'frp',
        publicUrl,
        localPort: config.localPort,
        status: 'active',
        createdAt: new Date()
      }
    } catch (error) {
      console.error('[TunnelService] 创建 frp 隧道失败:', error)
      throw error
    }
  }

  /**
   * 停止隧道
   */
  async stopTunnel(tunnelId: string, type: TunnelType): Promise<boolean> {
    try {
      console.log(`[TunnelService] 停止隧道: ${tunnelId}`)

      let processName = ''

      switch (type) {
        case 'cloudflare':
          processName = 'cloudflared'
          break
        case 'cpolar':
          processName = 'cpolar'
          break
        case 'frp':
          processName = 'frpc'
          break
        case 'ngrok':
          processName = 'ngrok'
          break
      }

      // 查找并终止进程
      const { stdout } = await execAsync(`pgrep -f "${processName}.*${tunnelId}" || echo ""`)

      if (stdout.trim()) {
        await execAsync(`pkill -f "${processName}.*${tunnelId}"`)
        console.log(`[TunnelService] 隧道已停止: ${tunnelId}`)
      }

      return true
    } catch (error) {
      console.error('[TunnelService] 停止隧道失败:', error)
      return false
    }
  }

  /**
   * 获取隧道状态
   */
  async getTunnelStatus(tunnelId: string, type: TunnelType): Promise<TunnelInfo['status']> {
    try {
      let processName = ''

      switch (type) {
        case 'cloudflare':
          processName = 'cloudflared'
          break
        case 'cpolar':
          processName = 'cpolar'
          break
        case 'frp':
          processName = 'frpc'
          break
        case 'ngrok':
          processName = 'ngrok'
          break
      }

      const { stdout } = await execAsync(`pgrep -f "${processName}.*${tunnelId}" || echo ""`)

      return stdout.trim().length > 0 ? 'active' : 'inactive'
    } catch (error) {
      return 'error'
    }
  }

  /**
   * 列出所有隧道
   */
  async listTunnels(): Promise<TunnelInfo[]> {
    // TODO: 从数据库查询所有隧道
    return []
  }

  /**
   * 等待隧道启动
   */
  private async waitForTunnel(tunnelId: string, type: TunnelType, timeout: number = 30000): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const status = await this.getTunnelStatus(tunnelId, type)
      if (status === 'active') {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error(`隧道启动超时: ${tunnelId}`)
  }

  /**
   * 获取 Cloudflare Tunnel URL
   */
  private async getCloudflareTunnelUrl(tunnelId: string): Promise<string> {
    try {
      const logFile = `/var/log/cloudflared-${tunnelId}.log`
      const { stdout } = await execAsync(`tail -n 100 ${logFile} | grep -o 'https://[^ ]*' | head -n 1 || echo ""`)

      return stdout.trim() || `https://${tunnelId}.trycloudflare.com`
    } catch (error) {
      return `https://${tunnelId}.trycloudflare.com`
    }
  }

  /**
   * 获取 cpolar Tunnel URL
   */
  private async getCpolarTunnelUrl(tunnelId: string): Promise<string> {
    try {
      // cpolar 提供 API 查询隧道信息
      const { stdout } = await execAsync('curl -s http://localhost:9200/api/v1/tunnels || echo ""')
      const tunnels = JSON.parse(stdout)

      const tunnel = tunnels.find((t: any) => t.name.includes(tunnelId))
      return tunnel?.public_url || `https://${tunnelId}.cpolar.cn`
    } catch (error) {
      return `https://${tunnelId}.cpolar.cn`
    }
  }

  /**
   * 安装 cloudflared
   */
  async installCloudflared(): Promise<boolean> {
    try {
      console.log('[TunnelService] 安装 cloudflared...')

      // 下载并安装
      await execAsync('curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared')
      await execAsync('chmod +x /usr/local/bin/cloudflared')

      console.log('[TunnelService] cloudflared 安装成功')
      return true
    } catch (error) {
      console.error('[TunnelService] cloudflared 安装失败:', error)
      return false
    }
  }
}

// ==================== 单例实例 ====================

let tunnelService: TunnelService | null = null

/**
 * 获取内网穿透服务实例
 */
export function getTunnelService(tunnelConfigDir?: string): TunnelService {
  if (!tunnelService) {
    tunnelService = new TunnelService(tunnelConfigDir)
  }
  return tunnelService
}
