/**
 * 网络诊断工具集
 * 
 * 功能：
 * - Ping: Ping 主机
 * - DnsLookup: DNS 查询
 * - PortScan: 端口扫描
 * - Traceroute: 路由追踪
 * - IpInfo: IP 信息查询
 * - NetworkInterfaces: 网络接口信息
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import dns from 'dns'
import os from 'os'

const execAsync = promisify(exec)
const dnsLookup = promisify(dns.lookup)
const dnsResolve = promisify(dns.resolve)

/**
 * 网络诊断配置
 */
const NETWORK_CONFIG = {
  // 默认超时（毫秒）
  DEFAULT_TIMEOUT: 5000,
  // Ping 包数量
  PING_COUNT: 4,
  // 常见端口
  COMMON_PORTS: [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 3306, 3389, 5432, 6379, 8080, 8443],
}

/**
 * 创建网络诊断工具
 */
export function createNetworkTools(): any[] {
  return [
    // ========== Ping 工具 ==========
    {
      name: 'Ping',
      description: 'Ping a host to check connectivity',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Host or IP address' },
          count: { type: 'number', description: 'Number of ping packets', default: 4 },
          timeout: { type: 'number', description: 'Timeout in seconds', default: 5 },
        },
        required: ['host'],
      },
      category: 'network',
      handler: async (input) => {
        const host = input.host as string
        const count = (input.count as number) || NETWORK_CONFIG.PING_COUNT
        const timeout = (input.timeout as number) || 5

        try {
          let command: string
          if (process.platform === 'win32') {
            command = `ping -n ${count} -w ${timeout * 1000} ${host}`
          } else {
            command = `ping -c ${count} -W ${timeout} ${host}`
          }

          const { stdout, stderr } = await execAsync(command, { timeout: (timeout + 5) * 1000 })

          // 解析结果
          const lines = stdout.split('\n')
          let stats: any = {}
          let result: any = { host }

          for (const line of lines) {
            // Windows 格式
            if (process.platform === 'win32') {
              const timeMatch = line.match(/time[=<](\d+)ms/i)
              const ttlMatch = line.match(/TTL=(\d+)/i)
              if (timeMatch) {
                if (!stats.min) {
                  stats.min = stats.max = stats.avg = parseInt(timeMatch[1])
                  stats.count = 1
                } else {
                  stats.max = Math.max(stats.max, parseInt(timeMatch[1]))
                  stats.min = Math.min(stats.min, parseInt(timeMatch[1]))
                  stats.avg = Math.round((stats.avg * stats.count + parseInt(timeMatch[1])) / (stats.count + 1))
                  stats.count++
                }
              }
              if (ttlMatch) {
                result.ttl = parseInt(ttlMatch[1])
              }
            } else {
              // Linux/macOS 格式
              const timeMatch = line.match(/time=(\d+\.?\d*)\s*ms/i)
              if (timeMatch) {
                const time = parseFloat(timeMatch[1])
                if (!stats.min) {
                  stats.min = stats.max = stats.avg = time
                  stats.count = 1
                } else {
                  stats.max = Math.max(stats.max, time)
                  stats.min = Math.min(stats.min, time)
                  stats.avg = Math.round(((stats.avg || 0) * stats.count + time) / (stats.count + 1) * 100) / 100
                  stats.count++
                }
              }
            }
          }

          result.packets = { transmitted: count, received: stats.count || 0 }
          result.time = stats

          const output = [
            `PING ${host}`,
            `Packets: ${result.packets.received}/${result.packets.transmitted} received`,
            stats.count ? `RTT: min=${stats.min}ms avg=${stats.avg}ms max=${stats.max}ms` : 'No response',
            result.ttl ? `TTL: ${result.ttl}` : '',
          ].filter(Boolean).join('\n')

          return {
            success: result.packets.received > 0,
            result,
            output,
          }
        } catch (error) {
          return {
            success: false,
            error: `Ping failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== DNS 查询工具 ==========
    {
      name: 'DnsLookup',
      description: 'DNS lookup for a domain',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Domain name' },
          type: { 
            type: 'string', 
            description: 'Record type',
            enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'all'],
            default: 'A'
          },
        },
        required: ['domain'],
      },
      category: 'network',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const domain = input.domain as string
        const type = (input.type as string) || 'A'

        try {
          if (type === 'all') {
            // 查询所有常见记录
            const results: any = {}
            const types = ['A', 'AAAA', 'MX', 'TXT', 'NS']

            for (const t of types) {
              try {
                if (t === 'A' || t === 'AAAA') {
                  const addr = await dnsLookup(domain)
                  results[t] = addr.address
                } else {
                  results[t] = await dnsResolve(domain, t)
                }
              } catch {
                results[t] = null
              }
            }

            const output = Object.entries(results)
              .filter(([_, v]) => v)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
              .join('\n')

            return {
              success: true,
              result: results,
              output: `${domain}:\n${output}`,
            }
          }

          let result: any

          if (type === 'A' || type === 'AAAA') {
            const addr = await dnsLookup(domain)
            result = { address: addr.address, family: addr.family }
          } else {
            result = await dnsResolve(domain, type)
          }

          const output = Array.isArray(result) ? result.join('\n') : String(result)

          return {
            success: true,
            result,
            output: `${type} records for ${domain}:\n${output}`,
          }
        } catch (error) {
          return {
            success: false,
            error: `DNS lookup failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== 端口扫描工具 ==========
    {
      name: 'PortScan',
      description: 'Scan common ports on a host',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Host or IP address' },
          ports: { type: 'string', description: 'Comma-separated ports or "common"' },
          timeout: { type: 'number', description: 'Timeout per port (ms)', default: 1000 },
        },
        required: ['host'],
      },
      category: 'network',
      handler: async (input) => {
        const host = input.host as string
        const portsStr = input.ports as string
        const timeout = (input.timeout as number) || 1000

        let ports: number[]
        if (portsStr === 'common' || !portsStr) {
          ports = NETWORK_CONFIG.COMMON_PORTS
        } else {
          ports = portsStr.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p))
        }

        const { Socket } = await import('net')

        const scanPort = (port: number): Promise<{ port: number; open: boolean }> => {
          return new Promise((resolve) => {
            const socket = new Socket()
            let resolved = false

            const cleanup = () => {
              if (!resolved) {
                resolved = true
                socket.destroy()
              }
            }

            socket.setTimeout(timeout)

            socket.on('connect', () => {
              cleanup()
              resolve({ port, open: true })
            })

            socket.on('timeout', () => {
              cleanup()
              resolve({ port, open: false })
            })

            socket.on('error', () => {
              cleanup()
              resolve({ port, open: false })
            })

            socket.connect(port, host)
          })
        }

        // 批量扫描（每次 10 个）
        const results: Array<{ port: number; open: boolean }> = []
        for (let i = 0; i < ports.length; i += 10) {
          const batch = ports.slice(i, i + 10)
          const batchResults = await Promise.all(batch.map(scanPort))
          results.push(...batchResults)
        }

        const openPorts = results.filter(r => r.open)
        const closedPorts = results.filter(r => !r.open)

        const output = [
          `Port scan results for ${host}:`,
          '',
          `Open ports (${openPorts.length}):`,
          openPorts.length > 0 ? openPorts.map(p => `  ${p.port}`).join('\n') : '  None',
          '',
          `Closed ports (${closedPorts.length}):`,
          closedPorts.length > 0 ? `  ${closedPorts.slice(0, 10).map(p => p.port).join(', ')}${closedPorts.length > 10 ? '...' : ''}` : '  None',
        ].join('\n')

        return {
          success: true,
          result: {
            host,
            totalPorts: ports.length,
            openPorts: openPorts.map(p => p.port),
            closedPorts: closedPorts.length,
          },
          output,
        }
      },
    },

    // ========== 路由追踪工具 ==========
    {
      name: 'Traceroute',
      description: 'Trace route to a host',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Host or IP address' },
          maxHops: { type: 'number', description: 'Maximum hops', default: 30 },
          timeout: { type: 'number', description: 'Timeout per hop (seconds)', default: 5 },
        },
        required: ['host'],
      },
      category: 'network',
      handler: async (input) => {
        const host = input.host as string
        const maxHops = (input.maxHops as number) || 30
        const timeout = (input.timeout as number) || 5

        try {
          let command: string
          if (process.platform === 'win32') {
            command = `tracert -h ${maxHops} -w ${timeout * 1000} ${host}`
          } else {
            command = `traceroute -m ${maxHops} -w ${timeout} ${host}`
          }

          const { stdout } = await execAsync(command, { timeout: (maxHops * timeout + 10) * 1000 })

          return {
            success: true,
            result: { output: stdout },
            output: stdout,
          }
        } catch (error) {
          return {
            success: false,
            error: `Traceroute failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== IP 信息工具 ==========
    {
      name: 'IpInfo',
      description: 'Get public IP address and location info',
      inputSchema: {
        type: 'object',
        properties: {
          ip: { type: 'string', description: 'IP address (leave empty for your public IP)' },
        },
      },
      category: 'network',
      isReadOnly: true,
      handler: async (input) => {
        const targetIp = input.ip as string

        try {
          let ip: string

          if (targetIp) {
            ip = targetIp
          } else {
            // 获取公网 IP
            const { stdout } = await execAsync('curl -s ifconfig.me', { timeout: 10000 })
            ip = stdout.trim()
          }

          // 使用 ip-api.com 获取位置信息
          try {
            const { default: fetch } = await import('node-fetch')
            const response = await fetch(`http://ip-api.com/json/${ip}`)
            const data = await response.json() as any

            if (data.status === 'success') {
              const result = {
                ip,
                country: data.country,
                countryCode: data.countryCode,
                region: data.regionName,
                city: data.city,
                zip: data.zip,
                lat: data.lat,
                lon: data.lon,
                timezone: data.timezone,
                isp: data.isp,
                org: data.org,
                as: data.as,
              }

              const output = [
                `IP: ${result.ip}`,
                `Location: ${result.city}, ${result.region}, ${result.country}`,
                `Coordinates: ${result.lat}, ${result.lon}`,
                `Timezone: ${result.timezone}`,
                `ISP: ${result.isp}`,
                `Organization: ${result.org}`,
              ].join('\n')

              return {
                success: true,
                result,
                output,
              }
            }
          } catch {
            // API 调用失败，返回基本信息
          }

          return {
            success: true,
            result: { ip },
            output: `IP Address: ${ip}`,
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to get IP info: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== 网络接口工具 ==========
    {
      name: 'NetworkInterfaces',
      description: 'Get network interface information',
      inputSchema: {
        type: 'object',
        properties: {
          family: { type: 'string', description: 'IP family', enum: ['IPv4', 'IPv6', 'all'], default: 'all' },
          internal: { type: 'boolean', description: 'Include internal interfaces', default: true },
        },
      },
      category: 'network',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const family = input.family as string || 'all'
        const includeInternal = (input.internal as boolean) !== false

        const interfaces = os.networkInterfaces()
        const result: any = {}

        for (const [name, addrs] of Object.entries(interfaces)) {
          if (!addrs) continue
          if (!includeInternal && name.toLowerCase().includes('loopback')) continue

          const filtered = addrs.filter((addr: any) => {
            if (family === 'IPv4' && addr.family !== 'IPv4') return false
            if (family === 'IPv6' && addr.family !== 'IPv6') return false
            return true
          })

          if (filtered.length > 0) {
            result[name] = filtered.map((addr: any) => ({
              address: addr.address,
              family: addr.family,
              mac: addr.mac,
              internal: addr.internal,
              netmask: addr.netmask,
            }))
          }
        }

        const output = Object.entries(result)
          .map(([name, addrs]: [string, any]) => {
            const addrList = addrs.map((a: any) => 
              `    ${a.family}: ${a.address}${a.internal ? ' (internal)' : ''}`
            ).join('\n')
            return `${name}:\n${addrList}`
          })
          .join('\n\n')

        return {
          success: true,
          result,
          output: `Network Interfaces:\n\n${output}`,
        }
      },
    },

    // ========== 连接测试工具 ==========
    {
      name: 'NetConnect',
      description: 'Test TCP connection to a host:port',
      inputSchema: {
        type: 'object',
        properties: {
          host: { type: 'string', description: 'Host' },
          port: { type: 'number', description: 'Port' },
          timeout: { type: 'number', description: 'Timeout in ms', default: 5000 },
        },
        required: ['host', 'port'],
      },
      category: 'network',
      handler: async (input) => {
        const host = input.host as string
        const port = input.port as number
        const timeout = (input.timeout as number) || 5000

        const start = Date.now()

        try {
          const { Socket } = await import('net')
          
          await new Promise<void>((resolve, reject) => {
            const socket = new Socket()
            
            socket.setTimeout(timeout)
            
            socket.on('connect', () => {
              socket.destroy()
              resolve()
            })
            
            socket.on('timeout', () => {
              socket.destroy()
              reject(new Error('Connection timeout'))
            })
            
            socket.on('error', (err) => {
              reject(err)
            })
            
            socket.connect(port, host)
          })

          const latency = Date.now() - start

          return {
            success: true,
            result: { host, port, reachable: true, latency },
            output: `Connected to ${host}:${port} (latency: ${latency}ms)`,
          }
        } catch (error) {
          return {
            success: false,
            result: { host, port, reachable: false },
            error: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== Whois 查询工具 ==========
    {
      name: 'WhoisLookup',
      description: 'WHOIS lookup for a domain',
      inputSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Domain name' },
        },
        required: ['domain'],
      },
      category: 'network',
      isReadOnly: true,
      handler: async (input) => {
        const domain = input.domain as string

        try {
          const { default: fetch } = await import('node-fetch')
          const response = await fetch(`https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=free&domainName=${encodeURIComponent(domain)}&outputFormat=json`)
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json() as any
          
          if (data.WhoisRecord) {
            const record = data.WhoisRecord
            const result = {
              domain: record.domainName,
              registrar: record.registrarName,
              created: record.createdDate,
              updated: record.updatedDate,
              expires: record.expiresDate,
              status: record.status,
              nameservers: record.nameServers?.hostNames,
            }

            const output = [
              `Domain: ${result.domain}`,
              `Registrar: ${result.registrar}`,
              `Created: ${result.created}`,
              `Updated: ${result.updated}`,
              `Expires: ${result.expires}`,
              `Status: ${Array.isArray(result.status) ? result.status.join(', ') : result.status}`,
              result.nameservers ? `Nameservers: ${Array.isArray(result.nameservers) ? result.nameservers.join(', ') : result.nameservers}` : '',
            ].filter(Boolean).join('\n')

            return {
              success: true,
              result,
              output,
            }
          }

          return {
            success: false,
            error: 'No WHOIS data found',
          }
        } catch (error) {
          return {
            success: false,
            error: `WHOIS lookup failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },
  ]
}

export default createNetworkTools
