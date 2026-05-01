/**
 * 反向代理配置管理服务
 * 
 * 功能：
 * - 动态生成 Nginx 配置
 * - 管理域名路由
 * - SSL 证书配置
 * - 负载均衡配置
 * - 访问控制规则
 * 
 * 使用场景：
 * - 为部署的项目配置外部访问
 * - 支持自定义域名和子域名
 * - 自动配置 HTTPS
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * 代理配置
 */
export interface ProxyConfig {
  projectId: string
  domain: string
  workerPort: number
  internalPort: number
  containerName?: string
  sslEnabled: boolean
  sslCertPath?: string
  sslKeyPath?: string
  accessControl?: {
    allowedIPs?: string[]
    deniedIPs?: string[]
    rateLimit?: number
  }
}

/**
 * Nginx 配置选项
 */
export interface NginxConfigOptions {
  enableSSL: boolean
  enableRateLimit: boolean
  enableAccessLog: boolean
  enableGzip: boolean
  enableWebSocket: boolean
  customHeaders?: Record<string, string>
}

/**
 * 代理统计信息
 */
export interface ProxyStats {
  totalDomains: number
  activeConnections: number
  requestsPerSecond: number
  bandwidthUsage: {
    in: number
    out: number
  }
}

// ==================== 反向代理服务 ====================

export class ReverseProxyService {
  private nginxConfigDir: string
  private letsencryptDir: string
  private configTemplate: string

  constructor(
    nginxConfigDir: string = '/etc/nginx/conf.d',
    letsencryptDir: string = '/etc/letsencrypt'
  ) {
    this.nginxConfigDir = nginxConfigDir
    this.letsencryptDir = letsencryptDir
    this.configTemplate = this.getDefaultTemplate()
  }

  /**
   * 为项目生成 Nginx 配置
   */
  async generateNginxConfig(config: ProxyConfig): Promise<string> {
    const {
      projectId,
      domain,
      workerPort,
      internalPort,
      containerName,
      sslEnabled,
      sslCertPath,
      sslKeyPath,
      accessControl
    } = config

    // 构建上游服务器地址
    // 优先使用 Docker 网络直接通信（containerName:internalPort），
    // 这样无需额外映射端口，更安全更高效
    const upstreamServer = containerName
      ? `http://${containerName}:${internalPort}`
      : `http://localhost:${workerPort}`

    // 生成配置
    let nginxConfig = ''

    // HTTP 重定向到 HTTPS（如果启用 SSL）
    if (sslEnabled) {
      nginxConfig += `
# HTTP 重定向到 HTTPS - ${domain}
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    # 重定向所有 HTTP 请求到 HTTPS
    return 301 https://$server_name$request_uri;
}

`
    }

    // 主服务器配置
    nginxConfig += `
# 项目代理配置 - ${projectId}
# 域名: ${domain}
# 生成时间: ${new Date().toISOString()}

upstream ${projectId}_backend {
    server ${upstreamServer};
    keepalive 32;
}

server {
    listen ${sslEnabled ? '443 ssl http2' : '80'};
    ${sslEnabled ? 'listen [::]:443 ssl http2;' : 'listen [::]:80;'}
    server_name ${domain};

    ${sslEnabled ? `
    # SSL 配置
    ssl_certificate ${sslCertPath || `/etc/letsencrypt/live/${domain}/fullchain.pem`};
    ssl_certificate_key ${sslKeyPath || `/etc/letsencrypt/live/${domain}/privkey.pem`};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ` : ''}

    # 访问日志
    access_log /var/log/nginx/${projectId}_access.log;
    error_log /var/log/nginx/${projectId}_error.log;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    ${sslEnabled ? 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' : ''}

    ${accessControl?.rateLimit ? `
    # 速率限制
    limit_req_zone $binary_remote_addr zone=${projectId}_limit:10m rate=${accessControl.rateLimit}r/s;
    ` : ''}

    ${accessControl?.allowedIPs && accessControl.allowedIPs.length > 0 ? `
    # IP 白名单
    allow ${accessControl.allowedIPs.join('; allow ')};
    deny all;
    ` : ''}

    ${accessControl?.deniedIPs && accessControl.deniedIPs.length > 0 ? `
    # IP 黑名单
    deny ${accessControl.deniedIPs.join('; deny ')};
    ` : ''}

    # 反向代理配置
    location / {
        proxy_pass ${upstreamServer};
        proxy_http_version 1.1;

        # 请求头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 缓冲配置
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;

        ${accessControl?.rateLimit ? `limit_req zone=${projectId}_limit burst=20 nodelay;` : ''}
    }

    # 健康检查端点
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
`

    return nginxConfig
  }

  /**
   * 写入 Nginx 配置文件
   */
  async writeNginxConfig(projectId: string, config: string): Promise<void> {
    const configPath = path.join(this.nginxConfigDir, `${projectId}.conf`)

    await fs.writeFile(configPath, config, 'utf-8')
    console.log(`[ReverseProxyService] Nginx 配置已写入: ${configPath}`)
  }

  /**
   * 删除 Nginx 配置文件
   */
  async removeNginxConfig(projectId: string): Promise<void> {
    const configPath = path.join(this.nginxConfigDir, `${projectId}.conf`)

    try {
      await fs.unlink(configPath)
      console.log(`[ReverseProxyService] Nginx 配置已删除: ${configPath}`)
    } catch (error) {
      console.warn(`[ReverseProxyService] 删除配置失败: ${configPath}`)
    }
  }

  /**
   * 重载 Nginx 配置
   *
   * 在 Docker 环境中，Nginx 运行在 Frontend 容器中，
   * 需要通过 docker exec 执行重载命令。
   * 在非 Docker 环境中，直接执行 nginx -s reload。
   */
  async reloadNginx(): Promise<boolean> {
    try {
      const frontendContainer = process.env.FRONTEND_CONTAINER_NAME || 'claw-web-frontend'

      // 先尝试通过 docker exec 在 Frontend 容器中重载
      try {
        await execAsync(`docker exec ${frontendContainer} nginx -t`)
        await execAsync(`docker exec ${frontendContainer} nginx -s reload`)
        console.log('[ReverseProxyService] Nginx 配置已重载（通过 Frontend 容器）')
        return true
      } catch {
        // docker exec 失败，尝试本地重载
      }

      // 本地重载（非 Docker 环境）
      await execAsync('nginx -t')
      await execAsync('nginx -s reload')
      console.log('[ReverseProxyService] Nginx 配置已重载（本地）')
      return true
    } catch (error) {
      console.error('[ReverseProxyService] Nginx 重载失败:', error)
      return false
    }
  }

  /**
   * 测试 Nginx 配置
   */
  async testNginxConfig(): Promise<{ valid: boolean; error?: string }> {
    try {
      const frontendContainer = process.env.FRONTEND_CONTAINER_NAME || 'claw-web-frontend'

      try {
        await execAsync(`docker exec ${frontendContainer} nginx -t`)
        return { valid: true }
      } catch {
        // docker exec 失败，尝试本地测试
      }

      await execAsync('nginx -t')
      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : '配置测试失败'
      }
    }
  }

  /**
   * 获取 Nginx 状态
   */
  async getNginxStatus(): Promise<{
    running: boolean
    version?: string
    uptime?: number
  }> {
    try {
      const frontendContainer = process.env.FRONTEND_CONTAINER_NAME || 'claw-web-frontend'

      // 先尝试通过 docker exec 在 Frontend 容器中获取状态
      try {
        const { stdout } = await execAsync(`docker exec ${frontendContainer} nginx -v 2>&1`)
        const versionMatch = stdout.match(/nginx version: nginx\/([\d.]+)/)
        const { stdout: processCheck } = await execAsync(`docker exec ${frontendContainer} pgrep nginx || echo ""`)
        return {
          running: processCheck.trim().length > 0,
          version: versionMatch ? versionMatch[1] : undefined
        }
      } catch {
        // docker exec 失败，尝试本地
      }

      const { stdout } = await execAsync('nginx -v 2>&1')
      const versionMatch = stdout.match(/nginx version: nginx\/([\d.]+)/)
      const { stdout: processCheck } = await execAsync('pgrep nginx || echo ""')
      return {
        running: processCheck.trim().length > 0,
        version: versionMatch ? versionMatch[1] : undefined
      }
    } catch (error) {
      return { running: false }
    }
  }

  /**
   * 列出所有代理配置
   */
  async listProxyConfigs(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.nginxConfigDir)
      return files.filter(f => f.endsWith('.conf')).map(f => f.replace('.conf', ''))
    } catch (error) {
      console.error('[ReverseProxyService] 列出配置失败:', error)
      return []
    }
  }

  /**
   * 获取代理统计信息
   */
  async getProxyStats(): Promise<ProxyStats> {
    try {
      // 解析 Nginx 状态信息
      const { stdout } = await execAsync(
        'nginx -s status 2>/dev/null || echo "Active connections: 0\\nReading: 0 Writing: 0 Waiting: 0"'
      )

      const activeMatch = stdout.match(/Active connections:\s+(\d+)/)
      const activeConnections = activeMatch ? parseInt(activeMatch[1]) : 0

      // 获取域名数量
      const configs = await this.listProxyConfigs()

      return {
        totalDomains: configs.length,
        activeConnections,
        requestsPerSecond: 0, // 需要额外的监控模块
        bandwidthUsage: { in: 0, out: 0 }
      }
    } catch (error) {
      console.error('[ReverseProxyService] 获取统计信息失败:', error)
      return {
        totalDomains: 0,
        activeConnections: 0,
        requestsPerSecond: 0,
        bandwidthUsage: { in: 0, out: 0 }
      }
    }
  }

  /**
   * 生成子域名
   */
  generateSubdomain(projectName: string, baseDomain: string): string {
    // 清理项目名称，只保留字母数字和连字符
    const cleanName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 30)

    return `${cleanName}.${baseDomain}`
  }

  /**
   * 验证域名格式
   */
  validateDomain(domain: string): boolean {
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i
    return domainRegex.test(domain)
  }

  /**
   * 获取默认配置模板
   */
  private getDefaultTemplate(): string {
    return `
# Nginx 配置模板
# 由 ReverseProxyService 自动生成

server {
    listen 80;
    server_name _;

    location / {
        return 404;
    }
}
`
  }
}

// ==================== 单例实例 ====================

let reverseProxyService: ReverseProxyService | null = null

/**
 * 获取反向代理服务实例
 */
export function getReverseProxyService(
  nginxConfigDir?: string,
  letsencryptDir?: string
): ReverseProxyService {
  if (!reverseProxyService) {
    reverseProxyService = new ReverseProxyService(nginxConfigDir, letsencryptDir)
  }
  return reverseProxyService
}
