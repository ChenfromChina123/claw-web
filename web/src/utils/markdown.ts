/**
 * Markdown 渲染工具
 * 集成 marked + highlight.js，支持代码高亮、表格等
 */

import { marked } from 'marked'
import hljs from 'highlight.js'

marked.setOptions({
  breaks: true,
  gfm: true,
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch {
        // 忽略高亮错误
      }
    }
    return hljs.highlightAuto(code).value
  },
})

interface RenderOptions {
  inline?: boolean
  sanitize?: boolean
}

export function renderMarkdown(content: string, options: RenderOptions = {}): string {
  const { inline = false, sanitize = true } = options

  let processedContent = content

  if (sanitize) {
    processedContent = sanitizeMarkdown(processedContent)
  }

  if (inline) {
    return marked.parseInline(processedContent) as string
  }

  return marked.parse(processedContent) as string
}

function sanitizeMarkdown(content: string): string {
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
}

export function extractCodeBlocks(markdown: string): Array<{
  code: string
  language: string
  index: number
}> {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  const blocks: Array<{ code: string; language: string; index: number }> = []
  let match

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    blocks.push({
      language: match[1] || 'plaintext',
      code: match[2].trim(),
      index: match.index,
    })
  }

  return blocks
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
  }

  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'

    document.body.appendChild(textarea)
    textarea.select()

    try {
      document.execCommand('copy')
      resolve()
    } catch (err) {
      reject(err)
    } finally {
      document.body.removeChild(textarea)
    }
  })
}
