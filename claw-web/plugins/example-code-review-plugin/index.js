/**
 * 代码审查助手插件
 *
 * 这是一个示例插件，展示如何开发技能型插件
 */

/**
 * 插件配置
 */
interface PluginConfig {
  strictMode: boolean
  includeSecurityChecks: boolean
  maxIssuesPerFile: number
}

let config: PluginConfig = {
  strictMode: false,
  includeSecurityChecks: true,
  maxIssuesPerFile: 10,
}

/**
 * 加载插件配置
 */
export async function onLoad(initialConfig: Record<string, unknown>) {
  if (initialConfig) {
    config = { ...config, ...initialConfig }
  }
  console.log('[CodeReviewPlugin] 代码审查助手插件已加载')
}

/**
 * 获取技能列表
 */
export function getSkills() {
  return [
    {
      type: 'prompt' as const,
      name: 'code-review',
      description: '自动化代码审查，检查代码质量、安全性和最佳实践',
      source: 'plugin' as const,
      loadedFrom: 'plugin' as const,
      contentLength: 500,
      progressMessage: 'running',
      getPromptForCommand: async (args: string) => {
        const modeText = config.strictMode ? '严格模式' : '常规模式'
        const securityText = config.includeSecurityChecks ? '包含' : '不包含'

        return [{
          type: 'text' as const,
          text: `# 代码审查助手

这是一个通过插件系统提供的自动化代码审查技能。

## 审查范围

- 代码风格和格式
- 命名规范
- 注释完整性
- 错误处理
- 安全性检查 (${securityText})
- 性能考虑
- 最佳实践

## 审查模式

当前模式: ${modeText}
最大问题数/文件: ${config.maxIssuesPerFile}

## 使用方法

使用此技能对代码进行审查：

\`\`\`
请审查以下代码:
\\`\\`\\`语言
代码内容
\\`\\`\\`
\`\`\`

## 输出格式

审查结果将包含:

1. **问题列表** - 发现的问题及位置
2. **建议** - 改进建议
3. **评分** - 代码质量评分 (0-100)
4. **总结** - 总体评价
`
        }]
      }
    }
  ]
}

/**
 * 获取工具列表
 */
export function getTools() {
  return [
    {
      name: 'code_review',
      description: '对代码进行自动化审查',
      inputSchema: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '要审查的代码'
          },
          language: {
            type: 'string',
            description: '编程语言'
          }
        },
        required: ['code']
      },
      async handler(params: { code: string; language?: string }) {
        const { code, language = 'unknown' } = params

        if (!code) {
          return {
            success: false,
            error: '请提供要审查的代码'
          }
        }

        // 模拟审查过程
        await new Promise(resolve => setTimeout(resolve, 200))

        const issues: Array<{
          severity: 'error' | 'warning' | 'info'
          line?: number
          message: string
          suggestion?: string
        }> = []

        // 简单的代码检查
        if (code.includes('console.log') && config.strictMode) {
          issues.push({
            severity: 'warning',
            message: '发现 console.log 调试语句',
            suggestion: '生产环境应移除或使用日志框架'
          })
        }

        if (code.includes('TODO') || code.includes('FIXME')) {
          issues.push({
            severity: 'info',
            message: '发现未完成标记',
            suggestion: '考虑在完成工作后移除 TODO/FIXME 标记'
          })
        }

        if (config.includeSecurityChecks) {
          if (code.includes('eval(')) {
            issues.push({
              severity: 'error',
              message: '发现 eval() 使用',
              suggestion: 'eval() 存在安全风险，考虑使用更安全的替代方案'
            })
          }

          if (code.includes('innerHTML') && !code.includes('sanitize')) {
            issues.push({
              severity: 'warning',
              message: '可能的 XSS 风险',
              suggestion: '使用 textContent 或对输入进行 sanitization'
            })
          }
        }

        // 限制问题数量
        const limitedIssues = issues.slice(0, config.maxIssuesPerFile)

        // 计算评分
        let score = 100
        for (const issue of limitedIssues) {
          if (issue.severity === 'error') score -= 20
          else if (issue.severity === 'warning') score -= 10
          else score -= 5
        }
        score = Math.max(0, score)

        let output = `# 代码审查报告\n\n`
        output += `**语言**: ${language}\n`
        output += `**问题数**: ${limitedIssues.length}\n`
        output += `**质量评分**: ${score}/100\n\n`

        if (limitedIssues.length > 0) {
          output += `## 发现的问题\n\n`

          for (const issue of limitedIssues) {
            const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'
            output += `${icon} ${issue.message}\n`
            if (issue.line) output += `   位置: 第${issue.line}行\n`
            if (issue.suggestion) output += `   建议: ${issue.suggestion}\n`
            output += `\n`
          }
        } else {
          output += `✅ 未发现问题\n\n`
        }

        output += `---\n*由代码审查助手插件生成*\n`

        return {
          success: true,
          output,
          metadata: {
            issues: limitedIssues,
            score,
            language
          }
        }
      }
    },
    {
      name: 'review_config',
      description: '配置代码审查插件的选项',
      inputSchema: {
        type: 'object',
        properties: {
          strictMode: {
            type: 'boolean',
            description: '是否启用严格模式'
          },
          includeSecurityChecks: {
            type: 'boolean',
            description: '是否包含安全检查'
          },
          maxIssuesPerFile: {
            type: 'number',
            description: '每个文件最大问题数'
          }
        }
      },
      async handler(params: Record<string, unknown>) {
        if (params.strictMode !== undefined) {
          config.strictMode = Boolean(params.strictMode)
        }
        if (params.includeSecurityChecks !== undefined) {
          config.includeSecurityChecks = Boolean(params.includeSecurityChecks)
        }
        if (params.maxIssuesPerFile !== undefined) {
          config.maxIssuesPerFile = Number(params.maxIssuesPerFile)
        }

        return {
          success: true,
          output: `代码审查配置已更新:\n- 严格模式: ${config.strictMode ? '启用' : '禁用'}\n- 安全检查: ${config.includeSecurityChecks ? '包含' : '不包含'}\n- 最大问题数: ${config.maxIssuesPerFile}`
        }
      }
    }
  ]
}

/**
 * 插件启用时调用
 */
export function onEnable() {
  console.log('[CodeReviewPlugin] 代码审查助手插件已启用')
  return true
}

/**
 * 插件禁用时调用
 */
export function onDisable() {
  console.log('[CodeReviewPlugin] 代码审查助手插件已禁用')
}
