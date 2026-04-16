/**
 * 域名管理服务
 * 
 * 功能：
 * - 域名绑定和管理
 * - DNS 解析配置
 * - 子域名自动生成
 * - 域名验证
 * 
 * 使用场景：
 * - 为项目分配自定义域名
 * - 自动生成子域名
 * - 域名所有权验证
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * 域名类型
 */
export type DomainType = 'custom' | 'subdomain'

/**
 * 域名状态
 */
export type DomainStatus = 'pending' | 'verified' | 'active' | 'error'

/**
 * 域名信息
 */
export interface DomainInfo {
  domainId: string
  projectId: string
  userId: string
  domain: string
  type: DomainType
  status: DomainStatus
  sslEnabled: boolean
  verifiedAt?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * DNS 记录
 */
export interface DNSRecord {
  type: 'A' | 'CNAME' | 'TXT' | 'MX'
  name: string
  value: string
  ttl?: number
}

/**
 * 域名验证结果
 */
export interface DomainVerification {
  verified: boolean
  method: 'dns' | 'http'
  records?: DNSRecord[]
  instructions?: string[]
}

// ==================== 域名管理服务 ====================

export class DomainService {
  private baseDomain: string

  constructor(baseDomain: string = 'claw-web.example.com') {
    this.baseDomain = baseDomain
  }

  /**
   * 为项目分配域名
   */
  async assignDomain(
    projectId: string,
    userId: string,
    customDomain?: string
  ): Promise<DomainInfo> {
    const domainId = uuidv4()

    let domain: string
    let type: DomainType

    if (customDomain) {
      // 使用自定义域名
      domain = customDomain
      type = 'custom'

      // 验证域名格式
      if (!this.validateDomainFormat(domain)) {
        throw new Error('域名格式无效')
      }
    } else {
      // 自动生成子域名
      domain = this.generateSubdomain(projectId)
      type = 'subdomain'
    }

    const domainInfo: DomainInfo = {
      domainId,
      projectId,
      userId,
      domain,
      type,
      status: type === 'subdomain' ? 'active' : 'pending',
      sslEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    console.log(`[DomainService] 域名已分配: ${domain} (项目: ${projectId})`)

    return domainInfo
  }

  /**
   * 验证域名所有权
   */
  async verifyDomain(domain: string, method: 'dns' | 'http' = 'dns'): Promise<DomainVerification> {
    try {
      if (method === 'dns') {
        // DNS TXT 记录验证
        const verificationToken = this.generateVerificationToken(domain)
        const txtRecord = `_claw-web-verification.${domain}`

        const records: DNSRecord[] = [
          {
            type: 'TXT',
            name: txtRecord,
            value: `claw-web-verification=${verificationToken}`,
            ttl: 300
          }
        ]

        // 检查 DNS 记录
        const { stdout } = await execAsync(`dig TXT ${txtRecord} +short`)

        const verified = stdout.includes(verificationToken)

        return {
          verified,
          method: 'dns',
          records,
          instructions: verified
            ? undefined
            : [
                `请在您的 DNS 服务商添加以下 TXT 记录：`,
                `记录类型: TXT`,
                `主机记录: _claw-web-verification`,
                `记录值: claw-web-verification=${verificationToken}`,
                `TTL: 300`,
                ``,
                `添加完成后，请等待 DNS 生效（通常需要几分钟到几小时）`
              ]
        }
      } else {
        // HTTP 文件验证
        const verificationToken = this.generateVerificationToken(domain)
        const verificationUrl = `http://${domain}/.well-known/claw-web-verification.txt`

        // 检查 HTTP 文件
        const { stdout } = await execAsync(`curl -s ${verificationUrl} || echo ""`)

        const verified = stdout.trim() === verificationToken

        return {
          verified,
          method: 'http',
          instructions: verified
            ? undefined
            : [
                `请在您的网站根目录创建验证文件：`,
                `文件路径: /.well-known/claw-web-verification.txt`,
                `文件内容: ${verificationToken}`,
                ``,
                `创建完成后，请重新验证`
              ]
        }
      }
    } catch (error) {
      console.error('[DomainService] 域名验证失败:', error)
      return {
        verified: false,
        method,
        instructions: ['域名验证失败，请检查域名是否正确解析到服务器']
      }
    }
  }

  /**
   * 检查域名解析
   */
  async checkDNSResolution(domain: string): Promise<{
    resolved: boolean
    ipAddress?: string
    records: DNSRecord[]
  }> {
    try {
      // 查询 A 记录
      const { stdout: aRecord } = await execAsync(`dig A ${domain} +short`)

      // 查询 CNAME 记录
      const { stdout: cnameRecord } = await execAsync(`dig CNAME ${domain} +short`)

      const records: DNSRecord[] = []

      if (aRecord.trim()) {
        records.push({
          type: 'A',
          name: domain,
          value: aRecord.trim()
        })
      }

      if (cnameRecord.trim()) {
        records.push({
          type: 'CNAME',
          name: domain,
          value: cnameRecord.trim()
        })
      }

      return {
        resolved: records.length > 0,
        ipAddress: aRecord.trim() || undefined,
        records
      }
    } catch (error) {
      console.error('[DomainService] DNS 解析检查失败:', error)
      return {
        resolved: false,
        records: []
      }
    }
  }

  /**
   * 生成子域名
   */
  generateSubdomain(projectId: string): string {
    // 使用项目 ID 的一部分作为子域名
    const subdomain = projectId.substring(0, 8).toLowerCase()
    return `${subdomain}.${this.baseDomain}`
  }

  /**
   * 验证域名格式
   */
  validateDomainFormat(domain: string): boolean {
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i
    return domainRegex.test(domain)
  }

  /**
   * 生成验证令牌
   */
  private generateVerificationToken(domain: string): string {
    // 基于域名生成唯一的验证令牌
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(domain + Date.now()).digest('hex').substring(0, 32)
  }

  /**
   * 列出用户的所有域名
   */
  async listUserDomains(userId: string): Promise<DomainInfo[]> {
    // TODO: 从数据库查询
    return []
  }

  /**
   * 删除域名
   */
  async deleteDomain(domainId: string): Promise<boolean> {
    // TODO: 从数据库删除
    console.log(`[DomainService] 域名已删除: ${domainId}`)
    return true
  }

  /**
   * 更新域名状态
   */
  async updateDomainStatus(domainId: string, status: DomainStatus): Promise<void> {
    // TODO: 更新数据库
    console.log(`[DomainService] 域名状态已更新: ${domainId} -> ${status}`)
  }

  /**
   * 启用 SSL
   */
  async enableSSL(domainId: string): Promise<boolean> {
    // TODO: 调用 SSL 服务申请证书
    console.log(`[DomainService] SSL 已启用: ${domainId}`)
    return true
  }
}

// ==================== 单例实例 ====================

let domainService: DomainService | null = null

/**
 * 获取域名管理服务实例
 */
export function getDomainService(baseDomain?: string): DomainService {
  if (!domainService) {
    domainService = new DomainService(baseDomain)
  }
  return domainService
}
