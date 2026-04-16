/**
 * SSL 证书管理服务
 * 
 * 功能：
 * - 自动生成 Let's Encrypt SSL 证书
 * - 证书续期管理
 * - 证书状态监控
 * - 支持通配符证书
 * 
 * 使用场景：
 * - 为自定义域名自动配置 HTTPS
 * - 证书到期自动续期
 * - 证书状态监控和告警
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * SSL 证书信息
 */
export interface SSLCertificate {
  domain: string
  issuer: string
  validFrom: Date
  validTo: Date
  daysRemaining: number
  autoRenew: boolean
  lastRenewed?: Date
  status: 'valid' | 'expired' | 'expiring_soon' | 'error'
}

/**
 * 证书申请选项
 */
export interface CertificateRequest {
  domain: string
  email: string
  staging?: boolean
  wildcard?: boolean
  dnsProvider?: 'cloudflare' | 'aliyun' | 'dnspod'
  dnsCredentials?: Record<string, string>
}

/**
 * 证书续期选项
 */
export interface RenewalOptions {
  force?: boolean
  dryRun?: boolean
  domains?: string[]
}

// ==================== SSL 证书服务 ====================

export class SSLService {
  private letsencryptDir: string
  private certbotConfigDir: string

  constructor(
    letsencryptDir: string = '/etc/letsencrypt',
    certbotConfigDir: string = '/etc/letsencrypt'
  ) {
    this.letsencryptDir = letsencryptDir
    this.certbotConfigDir = certbotConfigDir
  }

  /**
   * 申请 SSL 证书
   */
  async requestCertificate(request: CertificateRequest): Promise<{
    success: boolean
    message: string
    certPath?: string
    keyPath?: string
  }> {
    try {
      const { domain, email, staging, wildcard, dnsProvider, dnsCredentials } = request

      console.log(`[SSLService] 开始申请证书: ${domain}`)

      // 构建 certbot 命令
      let command = 'certbot certonly --non-interactive --agree-tos'

      // 添加邮箱
      command += ` --email ${email}`

      // 测试环境
      if (staging) {
        command += ' --test-cert'
      }

      // 通配符证书需要 DNS 验证
      if (wildcard) {
        if (!dnsProvider) {
          throw new Error('通配符证书需要指定 DNS 提供商')
        }

        command += ` --dns-${dnsProvider}`
        command += ` -d *.${domain} -d ${domain}`

        // 设置 DNS 凭证
        if (dnsCredentials) {
          for (const [key, value] of Object.entries(dnsCredentials)) {
            process.env[key] = value
          }
        }
      } else {
        // HTTP 验证
        command += ' --standalone'
        command += ` -d ${domain}`
      }

      // 执行命令
      const { stdout, stderr } = await execAsync(command)

      // 检查是否成功
      if (stdout.includes('Successfully received certificate')) {
        const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`
        const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`

        console.log(`[SSLService] 证书申请成功: ${domain}`)

        return {
          success: true,
          message: '证书申请成功',
          certPath,
          keyPath
        }
      }

      return {
        success: false,
        message: stderr || stdout || '证书申请失败'
      }
    } catch (error) {
      console.error('[SSLService] 证书申请失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '证书申请失败'
      }
    }
  }

  /**
   * 续期证书
   */
  async renewCertificate(options: RenewalOptions = {}): Promise<{
    success: boolean
    renewed: string[]
    failed: string[]
    message: string
  }> {
    try {
      const { force, dryRun, domains } = options

      console.log('[SSLService] 开始续期证书')

      let command = 'certbot renew --non-interactive'

      if (force) {
        command += ' --force-renewal'
      }

      if (dryRun) {
        command += ' --dry-run'
      }

      if (domains && domains.length > 0) {
        command += ` --cert-name ${domains[0]}`
      }

      const { stdout, stderr } = await execAsync(command)

      const renewed: string[] = []
      const failed: string[] = []

      // 解析输出
      const lines = stdout.split('\n')
      for (const line of lines) {
        if (line.includes('Successfully renewed certificate')) {
          const match = line.match(/for\s+([^\s]+)/)
          if (match) {
            renewed.push(match[1])
          }
        }
      }

      console.log(`[SSLService] 证书续期完成: ${renewed.length} 个成功`)

      return {
        success: true,
        renewed,
        failed,
        message: `成功续期 ${renewed.length} 个证书`
      }
    } catch (error) {
      console.error('[SSLService] 证书续期失败:', error)
      return {
        success: false,
        renewed: [],
        failed: [],
        message: error instanceof Error ? error.message : '证书续期失败'
      }
    }
  }

  /**
   * 获取证书信息
   */
  async getCertificateInfo(domain: string): Promise<SSLCertificate | null> {
    try {
      const certPath = `/etc/letsencrypt/live/${domain}/cert.pem`

      // 检查证书文件是否存在
      try {
        await fs.access(certPath)
      } catch {
        return null
      }

      // 使用 openssl 解析证书
      const { stdout } = await execAsync(
        `openssl x509 -in ${certPath} -noout -dates -issuer -subject`
      )

      // 解析输出
      const issuerMatch = stdout.match(/issuer=(.+)/)
      const notBeforeMatch = stdout.match(/notBefore=(.+)/)
      const notAfterMatch = stdout.match(/notAfter=(.+)/)

      if (!notBeforeMatch || !notAfterMatch) {
        return null
      }

      const validFrom = new Date(notBeforeMatch[1])
      const validTo = new Date(notAfterMatch[1])
      const now = new Date()
      const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      let status: SSLCertificate['status'] = 'valid'
      if (daysRemaining <= 0) {
        status = 'expired'
      } else if (daysRemaining <= 30) {
        status = 'expiring_soon'
      }

      return {
        domain,
        issuer: issuerMatch ? issuerMatch[1] : "Let's Encrypt",
        validFrom,
        validTo,
        daysRemaining,
        autoRenew: true,
        status
      }
    } catch (error) {
      console.error('[SSLService] 获取证书信息失败:', error)
      return null
    }
  }

  /**
   * 列出所有证书
   */
  async listCertificates(): Promise<SSLCertificate[]> {
    try {
      const { stdout } = await execAsync('certbot certificates 2>/dev/null || echo ""')

      const certificates: SSLCertificate[] = []
      const lines = stdout.split('\n')

      let currentDomain = ''

      for (const line of lines) {
        const domainMatch = line.match(/Certificate Name:\s+(.+)/)
        if (domainMatch) {
          currentDomain = domainMatch[1].trim()
        }

        const expiryMatch = line.match(/Expiry Date:\s+(.+)/)
        if (expiryMatch && currentDomain) {
          const certInfo = await this.getCertificateInfo(currentDomain)
          if (certInfo) {
            certificates.push(certInfo)
          }
          currentDomain = ''
        }
      }

      return certificates
    } catch (error) {
      console.error('[SSLService] 列出证书失败:', error)
      return []
    }
  }

  /**
   * 删除证书
   */
  async deleteCertificate(domain: string): Promise<boolean> {
    try {
      await execAsync(`certbot delete --cert-name ${domain} --non-interactive`)
      console.log(`[SSLService] 证书已删除: ${domain}`)
      return true
    } catch (error) {
      console.error('[SSLService] 删除证书失败:', error)
      return false
    }
  }

  /**
   * 检查证书是否即将过期
   */
  async checkExpiringCertificates(daysThreshold: number = 30): Promise<SSLCertificate[]> {
    const certificates = await this.listCertificates()
    return certificates.filter(cert => cert.daysRemaining <= daysThreshold)
  }

  /**
   * 自动续期即将过期的证书
   */
  async autoRenewExpiringCertificates(daysThreshold: number = 30): Promise<{
    renewed: string[]
    failed: string[]
  }> {
    const expiring = await this.checkExpiringCertificates(daysThreshold)

    const renewed: string[] = []
    const failed: string[] = []

    for (const cert of expiring) {
      const result = await this.renewCertificate({ domains: [cert.domain] })

      if (result.success) {
        renewed.push(cert.domain)
      } else {
        failed.push(cert.domain)
      }
    }

    return { renewed, failed }
  }

  /**
   * 验证域名所有权
   */
  async verifyDomainOwnership(domain: string): Promise<boolean> {
    try {
      // 检查域名是否解析到当前服务器
      const { stdout } = await execAsync(`nslookup ${domain} || dig +short ${domain}`)

      // 获取服务器公网 IP
      const { stdout: publicIP } = await execAsync('curl -s ifconfig.me || curl -s icanhazip.com')

      // 检查域名是否解析到当前服务器
      return stdout.includes(publicIP.trim())
    } catch (error) {
      console.error('[SSLService] 域名验证失败:', error)
      return false
    }
  }
}

// ==================== 单例实例 ====================

let sslService: SSLService | null = null

/**
 * 获取 SSL 服务实例
 */
export function getSSLService(
  letsencryptDir?: string,
  certbotConfigDir?: string
): SSLService {
  if (!sslService) {
    sslService = new SSLService(letsencryptDir, certbotConfigDir)
  }
  return sslService
}
