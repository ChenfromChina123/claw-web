/**
 * API 和调试工具集
 * 
 * 功能：
 * - HttpRequest: HTTP 请求工具（扩展版本，支持更多方法）
 * - JsonParse: JSON 解析和验证
 * - JsonFormat: JSON 格式化
 * - Base64Encode/Decode: Base64 编码解码
 * - UrlEncode/Decode: URL 编码解码
 * - HashCalculate: 计算哈希值
 * - UuidGenerate: 生成 UUID
 * - Timestamp: 时间戳工具
 */

import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { createHash, randomBytes } from 'crypto'

/**
 * API 工具配置
 */
const API_CONFIG = {
  // 默认超时（毫秒）
  DEFAULT_TIMEOUT: 30000,
  // 最大响应大小（字节）
  MAX_RESPONSE_SIZE: 5 * 1024 * 1024,
  // 支持的 HTTP 方法
  METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
}

/**
 * 创建 API 和调试工具
 */
export function createApiTools(): any[] {
  return [
    // ========== JSON 工具 ==========
    {
      name: 'JsonParse',
      description: 'Parse and validate JSON string',
      inputSchema: {
        type: 'object',
        properties: {
          json: { type: 'string', description: 'JSON string to parse' },
          strict: { type: 'boolean', description: 'Strict mode (no comments)', default: false },
        },
        required: ['json'],
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const jsonStr = input.json as string
        const strict = (input.strict as boolean) || false

        try {
          let parseStr = jsonStr
          if (!strict) {
            // 移除注释
            parseStr = jsonStr
              .replace(/\/\/.*$/gm, '')
              .replace(/\/\*[\s\S]*?\*\//g, '')
          }

          const parsed = JSON.parse(parseStr)

          return {
            success: true,
            result: {
              valid: true,
              type: Array.isArray(parsed) ? 'array' : typeof parsed,
              length: Array.isArray(parsed) ? parsed.length : typeof parsed === 'object' ? Object.keys(parsed).length : undefined,
              preview: Array.isArray(parsed) 
                ? parsed.slice(0, 3) 
                : typeof parsed === 'object' 
                  ? Object.fromEntries(Object.entries(parsed).slice(0, 5))
                  : parsed,
            },
            output: `JSON parsed successfully: ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
          }
        } catch (error) {
          const err = error as Error
          const match = err.message.match(/position (\d+)/)
          const position = match ? parseInt(match[1]) : null
          let context = ''
          if (position !== null) {
            const start = Math.max(0, position - 30)
            const end = Math.min(jsonStr.length, position + 30)
            context = `\n\nContext: ...${jsonStr.slice(start, end)}...`
          }

          return {
            success: false,
            error: `JSON parse error: ${err.message}${context}`,
          }
        }
      },
    },

    {
      name: 'JsonFormat',
      description: 'Format and minify JSON',
      inputSchema: {
        type: 'object',
        properties: {
          json: { type: 'string', description: 'JSON string to format' },
          indent: { type: 'number', description: 'Indentation spaces', default: 2 },
          minify: { type: 'boolean', description: 'Minify instead of format', default: false },
        },
        required: ['json'],
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const jsonStr = input.json as string
        const indent = (input.indent as number) || 2
        const minify = (input.minify as boolean) || false

        try {
          const parsed = JSON.parse(jsonStr)
          const formatted = minify
            ? JSON.stringify(parsed)
            : JSON.stringify(parsed, null, indent)

          return {
            success: true,
            result: {
              output: formatted,
              length: formatted.length,
              lines: minify ? 1 : formatted.split('\n').length,
            },
            output: formatted,
          }
        } catch (error) {
          return {
            success: false,
            error: `JSON format error: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== 编码解码工具 ==========
    {
      name: 'Base64Encode',
      description: 'Encode string to Base64',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to encode' },
          urlSafe: { type: 'boolean', description: 'URL-safe Base64', default: false },
        },
        required: ['text'],
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const text = input.text as string
        const urlSafe = (input.urlSafe as boolean) || false

        const encoded = Buffer.from(text).toString('base64')
        const output = urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : encoded

        return {
          success: true,
          result: { encoded: output, length: output.length },
          output,
        }
      },
    },

    {
      name: 'Base64Decode',
      description: 'Decode Base64 string',
      inputSchema: {
        type: 'object',
        properties: {
          encoded: { type: 'string', description: 'Base64 string to decode' },
          encoding: { type: 'string', description: 'Output encoding', enum: ['utf8', 'hex', 'ascii'], default: 'utf8' },
        },
        required: ['encoded'],
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const encoded = input.encoded as string
        const encoding = (input.encoding as string) || 'utf8'

        try {
          // 还原标准 Base64
          let stdEncoded = encoded.replace(/-/g, '+').replace(/_/g, '/')
          while (stdEncoded.length % 4) stdEncoded += '='

          const decoded = Buffer.from(stdEncoded, 'base64')

          return {
            success: true,
            result: {
              decoded: decoded.toString(encoding),
              length: decoded.length,
            },
            output: decoded.toString(encoding),
          }
        } catch (error) {
          return {
            success: false,
            error: 'Invalid Base64 string',
          }
        }
      },
    },

    {
      name: 'UrlEncode',
      description: 'URL encode a string',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to encode' },
          component: { type: 'boolean', description: 'Encode as URL component', default: true },
        },
        required: ['text'],
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const text = input.text as string
        const component = (input.component as boolean) !== false

        const encoded = component ? encodeURIComponent(text) : encodeURI(text)

        return {
          success: true,
          result: { encoded, length: encoded.length },
          output: encoded,
        }
      },
    },

    {
      name: 'UrlDecode',
      description: 'URL decode a string',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'URL encoded string' },
        },
        required: ['text'],
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const text = input.text as string

        try {
          const decoded = decodeURIComponent(text)

          return {
            success: true,
            result: { decoded, length: decoded.length },
            output: decoded,
          }
        } catch (error) {
          return {
            success: false,
            error: 'Invalid URL encoded string',
          }
        }
      },
    },

    // ========== 哈希工具 ==========
    {
      name: 'HashCalculate',
      description: 'Calculate hash of a string or file',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to hash (mutually exclusive with path)' },
          algorithm: { 
            type: 'string', 
            description: 'Hash algorithm',
            enum: ['md5', 'sha1', 'sha256', 'sha512'],
            default: 'sha256'
          },
          encoding: { type: 'string', description: 'Output encoding', enum: ['hex', 'base64'], default: 'hex' },
        },
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const text = input.text as string
        const algorithm = (input.algorithm as string) || 'sha256'
        const encoding = (input.encoding as string) || 'hex'

        if (!text) {
          return {
            success: false,
            error: 'Text is required',
          }
        }

        const hash = createHash(algorithm)
        hash.update(text, 'utf8')
        const digest = hash.digest(encoding as BufferEncoding)

        return {
          success: true,
          result: {
            hash: digest,
            algorithm,
            length: digest.length,
          },
          output: digest,
        }
      },
    },

    // ========== UUID 工具 ==========
    {
      name: 'UuidGenerate',
      description: 'Generate UUID v4',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of UUIDs to generate', default: 1 },
          format: { type: 'string', description: 'Format', enum: ['standard', 'no-dash'], default: 'standard' },
        },
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const count = Math.min((input.count as number) || 1, 100)
        const format = (input.format as string) || 'standard'

        const uuids: string[] = []
        for (let i = 0; i < count; i++) {
          let uuid = uuidv4()
          if (format === 'no-dash') {
            uuid = uuid.replace(/-/g, '')
          }
          uuids.push(uuid)
        }

        const output = uuids.join('\n')

        return {
          success: true,
          result: {
            uuids,
            count: uuids.length,
          },
          output,
        }
      },
    },

    // ========== 时间戳工具 ==========
    {
      name: 'Timestamp',
      description: 'Get current timestamp or convert timestamps',
      inputSchema: {
        type: 'object',
        properties: {
          time: { type: 'string', description: 'Time to convert (ISO string or Unix timestamp)' },
          format: { type: 'string', description: 'Output format', enum: ['unix', 'iso', 'unix-ms', 'relative'], default: 'iso' },
        },
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const time = input.time as string
        const format = (input.format as string) || 'iso'

        let date: Date
        if (time) {
          // 尝试解析输入时间
          if (/^\d+$/.test(time)) {
            // Unix timestamp
            date = new Date(parseInt(time) < 10000000000 ? parseInt(time) * 1000 : parseInt(time))
          } else {
            // ISO string
            date = new Date(time)
          }
        } else {
          date = new Date()
        }

        if (isNaN(date.getTime())) {
          return {
            success: false,
            error: 'Invalid time format',
          }
        }

        let output: string
        let result: any = {}

        switch (format) {
          case 'unix':
            output = String(Math.floor(date.getTime() / 1000))
            result.unix = output
            break
          case 'unix-ms':
            output = String(date.getTime())
            result.unixMs = output
            break
          case 'relative':
            const now = Date.now()
            const diff = now - date.getTime()
            output = formatRelativeTime(diff)
            result.relative = output
            result.diff = diff
            break
          default:
            output = date.toISOString()
            result.iso = output
        }

        result.date = date.toISOString()
        result.unix = Math.floor(date.getTime() / 1000)
        result.unixMs = date.getTime()

        return {
          success: true,
          result,
          output,
        }
      },
    },

    // ========== 随机数据工具 ==========
    {
      name: 'RandomGenerate',
      description: 'Generate random data',
      inputSchema: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            description: 'Type of random data',
            enum: ['string', 'number', 'hex', 'base64', 'uuid'],
            default: 'string'
          },
          length: { type: 'number', description: 'Length (for string/hex/base64)', default: 32 },
          min: { type: 'number', description: 'Min value (for number)', default: 0 },
          max: { type: 'number', description: 'Max value (for number)', default: 100 },
        },
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const type = (input.type as string) || 'string'
        const length = (input.length as number) || 32
        const min = (input.min as number) || 0
        const max = (input.max as number) || 100

        let output: string
        let result: any = {}

        switch (type) {
          case 'string':
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
            output = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
            break
          case 'number':
            output = String(Math.floor(Math.random() * (max - min + 1)) + min)
            break
          case 'hex':
            output = randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
            break
          case 'base64':
            output = randomBytes(Math.ceil(length * 0.75)).toString('base64').slice(0, length)
            break
          case 'uuid':
            output = uuidv4()
            break
          default:
            output = randomBytes(length).toString('hex')
        }

        result[type] = output

        return {
          success: true,
          result,
          output,
        }
      },
    },

    // ========== 颜色转换工具 ==========
    {
      name: 'ColorConvert',
      description: 'Convert between color formats',
      inputSchema: {
        type: 'object',
        properties: {
          color: { type: 'string', description: 'Color in any format (hex, rgb, hsl)' },
          to: { type: 'string', description: 'Output format', enum: ['hex', 'rgb', 'hsl', 'all'], default: 'hex' },
        },
        required: ['color'],
      },
      category: 'api',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const color = input.color as string
        const to = (input.to as string) || 'hex'

        let r = 0, g = 0, b = 0
        let h = 0, s = 0, l = 0

        // 解析颜色
        if (color.startsWith('#')) {
          const hex = color.slice(1)
          if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16)
            g = parseInt(hex[1] + hex[1], 16)
            b = parseInt(hex[2] + hex[2], 16)
          } else {
            r = parseInt(hex.slice(0, 2), 16)
            g = parseInt(hex.slice(2, 4), 16)
            b = parseInt(hex.slice(4, 6), 16)
          }
        } else if (color.startsWith('rgb')) {
          const match = color.match(/\d+/g)
          if (match && match.length >= 3) {
            r = parseInt(match[0])
            g = parseInt(match[1])
            b = parseInt(match[2])
          }
        } else if (color.startsWith('hsl')) {
          const match = color.match(/[\d.]+/g)
          if (match && match.length >= 3) {
            h = parseFloat(match[0])
            s = parseFloat(match[1]) / 100
            l = parseFloat(match[2]) / 100

            const c = (1 - Math.abs(2 * l - 1)) * s
            const x = c * (1 - Math.abs((h / 60) % 2 - 1))
            const m = l - c / 2

            let r1 = 0, g1 = 0, b1 = 0
            if (h < 60) { r1 = c; g1 = x; b1 = 0 }
            else if (h < 120) { r1 = x; g1 = c; b1 = 0 }
            else if (h < 180) { r1 = 0; g1 = c; b1 = x }
            else if (h < 240) { r1 = 0; g1 = x; b1 = c }
            else if (h < 300) { r1 = x; g1 = 0; b1 = c }
            else { r1 = c; g1 = 0; b1 = x }

            r = Math.round((r1 + m) * 255)
            g = Math.round((g1 + m) * 255)
            b = Math.round((b1 + m) * 255)
          }
        }

        // RGB 转 HSL
        r /= 255; g /= 255; b /= 255
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        l = (max + min) / 2
        if (max === min) {
          h = s = 0
        } else {
          const d = max - min
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
          switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: h = ((b - r) / d + 2) / 6; break
            case b: h = ((r - g) / d + 4) / 6; break
          }
        }
        h = Math.round(h * 360)
        s = Math.round(s * 100)
        l = Math.round(l * 100)

        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
        const rgb = `rgb(${r}, ${g}, ${b})`
        const hsl = `hsl(${h}, ${s}%, ${l}%)`

        let output: string
        let result: any = {}

        if (to === 'all') {
          result = { hex, rgb, hsl }
          output = `HEX: ${hex}\nRGB: ${rgb}\nHSL: ${hsl}`
        } else if (to === 'rgb') {
          output = rgb
          result.rgb = rgb
        } else if (to === 'hsl') {
          output = hsl
          result.hsl = hsl
        } else {
          output = hex
          result.hex = hex
        }

        return {
          success: true,
          result,
          output,
        }
      },
    },
  ]
}

/**
 * 格式化相对时间
 */
function formatRelativeTime(ms: number): string {
  const abs = Math.abs(ms)
  const suffix = ms < 0 ? 'later' : 'ago'

  if (abs < 1000) return `${ms}ms`
  if (abs < 60000) return `${Math.floor(abs / 1000)}s ${suffix}`
  if (abs < 3600000) return `${Math.floor(abs / 60000)}m ${suffix}`
  if (abs < 86400000) return `${Math.floor(abs / 3600000)}h ${suffix}`
  return `${Math.floor(abs / 86400000)}d ${suffix}`
}

export default createApiTools
