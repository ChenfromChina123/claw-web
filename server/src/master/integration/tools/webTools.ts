/**
 * Web 工具集
 * 
 * 功能：
 * - WebFetch: 获取网页内容
 * - WebSearch: 网络搜索
 * - HttpRequest: 通用 HTTP 请求
 * 
 * 参考 Claude Code 实现：
 * - src/tools/WebFetchTool/WebFetchTool.ts
 * - src/tools/WebSearchTool/WebSearchTool.ts
 * 
 * WebSearch 提示词：
 * - 从 src/tools/WebSearchTool/prompt.ts 移植
 * - 定义了搜索结果必须包含 Sources 引用
 * - 支持域名过滤（allowed_domains/blocked_domains）
 * - 使用当前年份确保搜索结果时效性
 */

import { fetch } from 'undici'
import type { ToolDefinition } from '../types/toolTypes'
import { TOOL_RESULT_LIMITS, truncateString, formatBytes } from '../../utils/fileLimits'
import { getWebSearchPrompt } from '../../prompts/webSearchPrompt'

/**
 * WebFetch 配置
 */
const WEB_FETCH_CONFIG = {
  // 最大重定向次数
  maxRedirects: 5,
  // 超时时间（毫秒）
  timeout: 30000,
  // 最大响应大小（字节）
  maxResponseSize: 5 * 1024 * 1024, // 5MB
  // 用户代理
  userAgent: 'Claw-Web/1.0 (AI Agent)',
}

/**
 * 预批准的主机名（无需额外验证）
 */
const PREAPPROVED_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'npmjs.com',
  'pypi.org',
  'crates.io',
  'hub.docker.com',
  'stackoverflow.com',
  'developer.mozilla.org',
  'docs.npmjs.com',
  'docs.python.org',
  'docs.docker.com',
])

/**
 * 检查是否为预批准的主机
 */
function isPreapprovedHost(hostname: string): boolean {
  return PREAPPROVED_HOSTS.has(hostname) || hostname.endsWith('.github.io')
}

/**
 * 清理 HTML 内容，提取文本
 */
function extractTextFromHtml(html: string): string {
  // 移除 script 和 style 标签
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  
  // 移除注释
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  
  // 将标签替换为空格
  text = text.replace(/<[^>]+>/g, ' ')
  
  // 清理多余空白
  text = text.replace(/[\r\n]+/g, '\n')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.replace(/\n[ \t]+/g, '\n')
  text = text.replace(/^\s+|\s+$/gm, '')
  
  return text.trim()
}

/**
 * 从 URL 中提取域名
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

/**
 * 创建 Web 工具定义列表
 */
export function createWebTools(): ToolDefinition[] {
  return [
    // ========== WebFetch 工具 ==========
    {
      name: 'WebFetch',
      description: 'Fetch content from a URL and extract information using AI',
      inputSchema: {
        type: 'object',
        properties: {
          url: { 
            type: 'string', 
            description: 'The URL to fetch content from' 
          },
          prompt: { 
            type: 'string', 
            description: 'The prompt to extract specific information from the page' 
          },
          maxLength: { 
            type: 'number', 
            description: 'Maximum content length to fetch',
            default: 50000 
          },
        },
        required: ['url'],
      },
      category: 'web',
      handler: async (input, context, sendEvent) => {
        const url = input.url as string
        const prompt = (input.prompt as string) || 'Summarize the main content'
        const maxLength = (input.maxLength as number) || 50000

        sendEvent?.('tool_progress', { output: `Fetching: ${url}\n` })

        try {
          // 验证 URL
          let parsedUrl: URL
          try {
            parsedUrl = new URL(url)
          } catch {
            return {
              success: false,
              error: 'Invalid URL format',
            }
          }

          // 检查协议
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return {
              success: false,
              error: 'Only HTTP and HTTPS protocols are supported',
            }
          }

          const startTime = Date.now()

          // 发起请求
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'User-Agent': WEB_FETCH_CONFIG.userAgent,
              'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
              'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: AbortSignal.timeout(WEB_FETCH_CONFIG.timeout),
            redirect: 'follow',
          })

          const contentType = response.headers.get('content-type') || ''
          const statusCode = response.status

          // 检查内容类型
          if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            // 尝试作为文本处理
            if (!contentType.includes('json') && !contentType.includes('xml')) {
              return {
                success: false,
                error: `Unsupported content type: ${contentType}. Only HTML and plain text are supported.`,
              }
            }
          }

          // 获取内容
          const rawContent = await response.text()

          // 检查大小
          if (rawContent.length > WEB_FETCH_CONFIG.maxResponseSize) {
            return {
              success: false,
              error: `Response too large (${formatBytes(rawContent.length)}). Maximum allowed is ${formatBytes(WEB_FETCH_CONFIG.maxResponseSize)}.`,
            }
          }

          // 提取文本内容
          let textContent: string
          if (contentType.includes('text/html')) {
            textContent = extractTextFromHtml(rawContent)
          } else {
            textContent = rawContent
          }

          // 截断内容
          let content = textContent
          let wasTruncated = false
          if (textContent.length > maxLength) {
            const truncated = truncateString(textContent, maxLength)
            content = truncated.truncated
            wasTruncated = true
          }

          const durationMs = Date.now() - startTime
          const domain = extractDomain(url)

          sendEvent?.('tool_progress', { 
            output: `Fetched ${formatBytes(rawContent.length)} from ${domain} in ${durationMs}ms\n` 
          })

          return {
            success: true,
            result: {
              url,
              domain,
              statusCode,
              contentType,
              size: rawContent.length,
              wasTruncated,
              content,
              durationMs,
              summary: wasTruncated 
                ? `[Content truncated. Original size: ${formatBytes(rawContent.length)}, shown: ${formatBytes(content.length)}]`
                : undefined,
            },
            output: content,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
            return {
              success: false,
              error: `Request timeout after ${WEB_FETCH_CONFIG.timeout}ms`,
            }
          }

          if (errorMessage.includes('fetch failed') || errorMessage.includes('ENOTFOUND')) {
            return {
              success: false,
              error: `Failed to fetch URL: Domain not found or network error`,
            }
          }

          return {
            success: false,
            error: `Failed to fetch URL: ${errorMessage}`,
          }
        }
      },
    },

    // ========== WebSearch 工具 ==========
    // 提示词已从 src/tools/WebSearchTool/prompt.ts 移植到 prompts/webSearchPrompt.ts
    // 使用 getWebSearchPrompt() 获取完整的工具使用规范
    {
      name: 'WebSearch',
      description: 'Search the web for current information. Returns results with links that MUST be cited in Sources section. Use this for events, recent data, or info beyond knowledge cutoff.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { 
            type: 'string', 
            description: 'The search query' 
          },
          limit: { 
            type: 'number', 
            description: 'Maximum number of results to return',
            default: 10 
          },
        },
        required: ['query'],
      },
      category: 'web',
      handler: async (input, context, sendEvent) => {
        const query = input.query as string
        const limit = Math.min((input.limit as number) || 10, 20)

        sendEvent?.('tool_progress', { output: `Searching: ${query}\n` })

        try {
          // 使用 DuckDuckGo HTML 进行搜索（免费，无需 API key）
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=wt-wt`
          
          const response = await fetch(searchUrl, {
            method: 'GET',
            headers: {
              'User-Agent': WEB_FETCH_CONFIG.userAgent,
              'Accept': 'text/html',
            },
            signal: AbortSignal.timeout(WEB_FETCH_CONFIG.timeout),
          })

          const html = await response.text()
          const textContent = extractTextFromHtml(html)

          // 解析搜索结果
          // DuckDuckGo HTML 格式的结果通常包含在 <a class="result__a"> 标签中
          const results: Array<{
            title: string
            url: string
            snippet: string
          }> = []

          // 简单的正则解析（实际项目中应使用专门的解析库）
          const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi
          const urlPattern = /href="([^"]*)"/
          const titlePattern = />([^<]+)<\/a>/

          let match
          const seenUrls = new Set<string>()
          
          while ((match = resultPattern.exec(html)) !== null && results.length < limit) {
            const fullMatch = match[0]
            const urlMatch = urlPattern.exec(fullMatch)
            const titleMatch = titlePattern.exec(fullMatch)
            
            if (urlMatch && titleMatch) {
              let url = urlMatch[1]
              
              // 跳过已见过的 URL
              if (seenUrls.has(url)) continue
              seenUrls.add(url)

              // 清理 URL（移除重定向参数）
              if (url.includes('uddg=')) {
                try {
                  const decodedUrl = decodeURIComponent(url.split('uddg=')[1])
                  url = decodedUrl
                } catch {
                  // 保持原 URL
                }
              }

              const title = titleMatch[1].trim()
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')

              if (title && url && !url.startsWith('/')) {
                results.push({ title, url, snippet: '' })
              }
            }
          }

          // 如果解析失败，返回错误信息
          if (results.length === 0) {
            // 尝试获取错误信息
            const errorMatch = textContent.match(/No results for.*/i)
            if (errorMatch) {
              return {
                success: true,
                result: {
                  query,
                  results: [],
                  message: 'No search results found',
                },
              }
            }

            // 返回原始内容作为调试信息
            return {
              success: true,
              result: {
                query,
                results: [],
                message: 'Could not parse search results. Please try a different query.',
                debug: textContent.slice(0, 1000),
              },
            }
          }

          sendEvent?.('tool_progress', { 
            output: `Found ${results.length} results\n` 
          })

          return {
            success: true,
            result: {
              query,
              count: results.length,
              results,
            },
            output: results.map((r, i) => 
              `${i + 1}. ${r.title}\n   URL: ${r.url}`
            ).join('\n\n'),
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          return {
            success: false,
            error: `Search failed: ${errorMessage}`,
          }
        }
      },
    },

    // ========== HttpRequest 工具（更通用的 HTTP 客户端） ==========
    {
      name: 'HttpRequest',
      description: 'Make HTTP requests to any URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { 
            type: 'string', 
            description: 'The URL to request' 
          },
          method: { 
            type: 'string', 
            description: 'HTTP method',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            default: 'GET' 
          },
          headers: { 
            type: 'object', 
            description: 'HTTP headers',
            default: {} 
          },
          body: { 
            type: 'string', 
            description: 'Request body (for POST/PUT/PATCH)' 
          },
          timeout: { 
            type: 'number', 
            description: 'Request timeout in milliseconds',
            default: 30000 
          },
        },
        required: ['url'],
      },
      category: 'web',
      handler: async (input, context, sendEvent) => {
        const url = input.url as string
        const method = (input.method as string) || 'GET'
        const headers = (input.headers as Record<string, string>) || {}
        const body = input.body as string
        const timeout = (input.timeout as number) || 30000

        sendEvent?.('tool_progress', { output: `${method} ${url}\n` })

        try {
          // 验证 URL
          let parsedUrl: URL
          try {
            parsedUrl = new URL(url)
          } catch {
            return {
              success: false,
              error: 'Invalid URL format',
            }
          }

          // 检查协议
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return {
              success: false,
              error: 'Only HTTP and HTTPS protocols are supported',
            }
          }

          const startTime = Date.now()

          const requestHeaders: Record<string, string> = {
            'User-Agent': WEB_FETCH_CONFIG.userAgent,
            ...headers,
          }

          if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
            if (!requestHeaders['Content-Type']) {
              requestHeaders['Content-Type'] = 'application/json'
            }
          }

          const response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: body && ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
            signal: AbortSignal.timeout(timeout),
            redirect: 'follow',
          })

          const statusCode = response.status
          const statusText = response.statusText
          const responseHeaders: Record<string, string> = {}
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value
          })

          // 获取响应内容
          const responseBody = await response.text()
          const durationMs = Date.now() - startTime

          sendEvent?.('tool_progress', { 
            output: `${statusCode} ${statusText} (${durationMs}ms)\n` 
          })

          return {
            success: true,
            result: {
              url,
              method,
              statusCode,
              statusText,
              headers: responseHeaders,
              size: responseBody.length,
              durationMs,
            },
            output: responseBody,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          return {
            success: false,
            error: `HTTP request failed: ${errorMessage}`,
          }
        }
      },
    },
  ]
}

export default createWebTools
