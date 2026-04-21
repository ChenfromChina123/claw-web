/**
 * 技能工具集
 * 
 * 功能：
 * - SkillList: 列出可用技能
 * - SkillExecute: 执行技能
 * - SkillInfo: 获取技能信息
 * - TemplateRender: 模板渲染
 * - MacroExpand: 宏展开
 */

import { readdir, readFile, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import { existsSync } from 'fs'

/**
 * 技能配置
 */
const SKILL_CONFIG = {
  // 技能目录
  SKILL_DIR: './skills',
  // 支持的模板引擎
  TEMPLATE_ENGINES: ['handlebars', 'mustache', 'ejs', 'nunjucks'],
}

/**
 * 技能存储（内存中）
 */
const skillRegistry: Map<string, any> = new Map()

/**
 * 预注册内置技能
 */
const builtInSkills: any[] = [
  {
    name: 'code-review',
    description: 'Perform code review with best practices',
    category: 'development',
    version: '1.0.0',
    handler: async (input: any) => {
      const { code, language } = input
      if (!code) {
        return { success: false, error: 'Code is required' }
      }

      const issues: string[] = []
      const suggestions: string[] = []

      // 基础代码检查
      if (code.includes('var ') && !code.includes('let ') && !code.includes('const ')) {
        issues.push('使用 var 而不是 let/const')
        suggestions.push('建议使用 let 或 const 替代 var')
      }

      if (code.includes('== ') || code.includes('===')) {
        // 检查 == 而不是 ===
      }

      if (code.includes('console.log') && !code.includes('debug')) {
        suggestions.push('考虑移除生产环境中的 console.log')
      }

      if (code.length > 500) {
        suggestions.push('代码过长，考虑拆分为更小的函数')
      }

      // 括号匹配检查
      const openBraces = (code.match(/\{/g) || []).length
      const closeBraces = (code.match(/\}/g) || []).length
      if (openBraces !== closeBraces) {
        issues.push('花括号不匹配')
      }

      return {
        success: true,
        result: {
          issues,
          suggestions,
          score: Math.max(0, 100 - issues.length * 20 - suggestions.length * 5),
        },
        output: [
          `Code Review Results:`,
          issues.length > 0 ? `\n❌ Issues (${issues.length}):\n  - ${issues.join('\n  - ')}` : '\n✅ No issues found',
          suggestions.length > 0 ? `\n💡 Suggestions:\n  - ${suggestions.join('\n  - ')}` : '',
          `\nScore: ${Math.max(0, 100 - issues.length * 20 - suggestions.length * 5)}/100`,
        ].join(''),
      }
    },
  },
  {
    name: 'explain-code',
    description: 'Explain code in human-readable format',
    category: 'education',
    version: '1.0.0',
    handler: async (input: any) => {
      const { code, language } = input
      if (!code) {
        return { success: false, error: 'Code is required' }
      }

      const lines = code.split('\n')
      const explanations: string[] = []

      // 简单分析代码结构
      const imports = code.match(/import\s+.*?from\s+['"][^'"]+['"]/g) || []
      const functions = code.match(/function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(|=>\s*{/g) || []
      const classes = code.match(/class\s+\w+/g) || []

      explanations.push(`This ${language || 'code'} contains:`)
      if (imports.length > 0) {
        explanations.push(`- ${imports.length} import(s)`)
      }
      if (functions.length > 0) {
        explanations.push(`- ${functions.length} function(s) or arrow functions`)
      }
      if (classes.length > 0) {
        explanations.push(`- ${classes.length} class(es): ${classes.map((c: string) => c.replace('class ', '')).join(', ')}`)
      }

      // 分析复杂度
      const complexity = ['if', 'for', 'while', 'switch', 'catch'].reduce((acc, keyword) => {
        return acc + (code.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length
      }, 0)

      explanations.push(`\nComplexity score: ${complexity}`)
      if (complexity > 20) {
        explanations.push('⚠️ High complexity - consider refactoring')
      }

      return {
        success: true,
        result: { 
          language,
          lines: lines.length,
          complexity,
          imports: imports.length,
          functions: functions.length,
          classes: classes.length,
        },
        output: explanations.join('\n'),
      }
    },
  },
  {
    name: 'generate-docs',
    description: 'Generate documentation from code',
    category: 'documentation',
    version: '1.0.0',
    handler: async (input: any) => {
      const { code, format } = input
      if (!code) {
        return { success: false, error: 'Code is required' }
      }

      const outputFormat = format || 'markdown'
      let docs = ''

      // 提取函数和类
      const jsdocPattern = /\/\*\*[\s\S]*?\*\//g
      const jsdocs = code.match(jsdocPattern) || []
      
      const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\(|class\s+(\w+)/g
      let match
      const functions: string[] = []
      while ((match = functionPattern.exec(code)) !== null) {
        functions.push(match[1] || match[2] || match[3])
      }

      if (outputFormat === 'markdown') {
        docs = `# Documentation\n\n`
        if (functions.length > 0) {
          docs += `## Functions\n\n`
          for (const fn of functions) {
            docs += `### \`${fn}()\`\n\n`
            docs += `> TODO: Add description\n\n`
          }
        }
        if (jsdocs.length > 0) {
          docs += `\n## Existing Documentation\n\n`
          docs += jsdocs.map(j => '```\n' + j + '\n```').join('\n\n')
        }
      } else {
        docs = JSON.stringify({ functions, jsdocs }, null, 2)
      }

      return {
        success: true,
        result: { format: outputFormat, functions, documented: jsdocs.length },
        output: docs,
      }
    },
  },
  {
    name: 'test-generator',
    description: 'Generate unit tests for code',
    category: 'development',
    version: '1.0.0',
    handler: async (input: any) => {
      const { code, language, framework } = input
      if (!code) {
        return { success: false, error: 'Code is required' }
      }

      const funcPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\(/g
      let match
      const functions: string[] = []
      while ((match = funcPattern.exec(code)) !== null) {
        functions.push(match[1] || match[2])
      }

      let tests = ''

      if (language === 'javascript' || language === 'typescript') {
        tests = `// Generated tests for ${functions.length} function(s)\n`
        tests += `import { describe, it, expect } from 'vitest';\n\n`
        
        for (const fn of functions) {
          tests += `describe('${fn}', () => {\n`
          tests += `  it('should work correctly', () => {\n`
          tests += `    // TODO: Add test implementation\n`
          tests += `    expect(${fn}()).toBeDefined();\n`
          tests += `  });\n`
          tests += `});\n\n`
        }
      } else if (language === 'python') {
        tests = `# Generated tests for ${functions.length} function(s)\n`
        tests += `import pytest\n\n`
        
        for (const fn of functions) {
          tests += `def test_${fn}():\n`
          tests += `    # TODO: Add test implementation\n`
          tests += `    pass\n\n`
        }
      } else {
        tests = `// Generic test template for ${functions.length} function(s)\n\n`
        tests += functions.map(fn => `void test_${fn}();`).join('\n')
      }

      return {
        success: true,
        result: { functions, language, framework },
        output: tests,
      }
    },
  },
  {
    name: 'refactor',
    description: 'Refactor code with best practices',
    category: 'development',
    version: '1.0.0',
    handler: async (input: any) => {
      const { code, language, target } = input
      if (!code) {
        return { success: false, error: 'Code is required' }
      }

      let refactored = code
      const changes: string[] = []

      // 移除 console.log
      if (target === 'remove-logs' || !target) {
        const original = refactored
        refactored = refactored.replace(/console\.(log|debug|info|warn|error)\([^)]*\);?\n?/g, '')
        if (refactored !== original) {
          changes.push('Removed console statements')
        }
      }

      // 转换 var 为 const/let
      if (target === 'modernize' || !target) {
        const original = refactored
        refactored = refactored.replace(/\bvar\s+(\w+)/g, 'const $1')
        if (refactored !== original) {
          changes.push('Converted var to const')
        }
      }

      // 箭头函数转换 (简化版)
      if (target === 'arrow-functions' || !target) {
        const original = refactored
        refactored = refactored.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*{\s*return\s+([^;]+);\s*}/g, 'const $1 = ($2) => $3')
        if (refactored !== original) {
          changes.push('Converted to arrow functions')
        }
      }

      return {
        success: true,
        result: { 
          originalLength: code.length,
          refactoredLength: refactored.length,
          changes,
          reduction: `${Math.round((1 - refactored.length / code.length) * 100)}%`,
        },
        output: [
          `Refactoring complete:`,
          changes.length > 0 ? changes.map(c => `  ✓ ${c}`).join('\n') : '  No changes made',
          `\nSize: ${code.length} → ${refactored.length} (${Math.round((1 - refactored.length / code.length) * 100)}% reduction)`,
          `\n--- Refactored Code ---\n${refactored}`,
        ].join('\n'),
      }
    },
  },
  {
    name: 'summarize',
    description: 'Summarize text or code',
    category: 'utility',
    version: '1.0.0',
    handler: async (input: any) => {
      const { text, maxLength } = input
      if (!text) {
        return { success: false, error: 'Text is required' }
      }

      const max = maxLength || 100
      let summary = text.trim()

      // 移除多余空白
      summary = summary.replace(/\s+/g, ' ')

      // 如果太长，截断
      if (summary.length > max) {
        summary = summary.slice(0, max - 3) + '...'
      }

      // 统计
      const words = text.trim().split(/\s+/).length
      const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length

      return {
        success: true,
        result: {
          summary,
          wordCount: words,
          sentenceCount: sentences,
          originalLength: text.length,
        },
        output: summary,
      }
    },
  },
  {
    name: 'translate',
    description: 'Translate text between languages',
    category: 'utility',
    version: '1.0.0',
    handler: async (input: any) => {
      const { text, from, to } = input
      if (!text) {
        return { success: false, error: 'Text is required' }
      }

      // 简单的内置翻译映射（演示用）
      const translations: Record<string, Record<string, string>> = {
        'hello': { zh: '你好', ja: 'こんにちは', es: 'Hola', fr: 'Bonjour' },
        'goodbye': { zh: '再见', ja: 'さようなら', es: 'Adiós', fr: 'Au revoir' },
        'thank you': { zh: '谢谢', ja: 'ありがとう', es: 'Gracias', fr: 'Merci' },
        'yes': { zh: '是', ja: 'はい', es: 'Sí', fr: 'Oui' },
        'no': { zh: '不', ja: 'いいえ', es: 'No', fr: 'Non' },
      }

      const lowerText = text.toLowerCase().trim()
      
      if (translations[lowerText] && translations[lowerText][to]) {
        return {
          success: true,
          result: {
            original: text,
            translated: translations[lowerText][to],
            from: from || 'auto',
            to,
          },
          output: translations[lowerText][to],
        }
      }

      return {
        success: false,
        error: `Translation not available. Only simple phrases are supported: ${Object.keys(translations).join(', ')}`,
      }
    },
  },
  {
    name: 'regex-builder',
    description: 'Build and test regular expressions',
    category: 'development',
    version: '1.0.0',
    handler: async (input: any) => {
      const { pattern, flags, testString } = input
      if (!pattern) {
        return { success: false, error: 'Pattern is required' }
      }

      try {
        const regex = new RegExp(pattern, flags || '')
        const result: any = { pattern, flags: flags || '' }

        if (testString) {
          const matches = testString.match(regex)
          result.matches = matches
          result.matchCount = matches ? matches.length : 0
          result.testString = testString
        }

        let output = `Regex: /${pattern}/${flags || ''}\n\n`
        
        if (result.matchCount !== undefined) {
          output += `Matches: ${result.matchCount}\n`
          if (result.matches && result.matches.length > 0) {
            output += `Found:\n${result.matches.slice(0, 10).map((m: string, i: number) => `  ${i + 1}. "${m}"`).join('\n')}`
          }
        }

        return {
          success: true,
          result,
          output,
        }
      } catch (error) {
        return {
          success: false,
          error: `Invalid regex: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    },
  },
]

/**
 * 创建技能工具
 */
export function createSkillTools(): any[] {
  // 预注册内置技能
  for (const skill of builtInSkills) {
    skillRegistry.set(skill.name, skill)
  }

  return [
    // ========== 技能列表工具 ==========
    {
      name: 'SkillList',
      description: 'List all available skills',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category' },
          search: { type: 'string', description: 'Search in name/description' },
        },
      },
      category: 'skill',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const category = input.category as string
        const search = (input.search as string)?.toLowerCase()

        let skills = Array.from(skillRegistry.values())

        if (category) {
          skills = skills.filter(s => s.category === category)
        }

        if (search) {
          skills = skills.filter(s => 
            s.name.includes(search) || s.description?.toLowerCase().includes(search)
          )
        }

        const output = skills.map(s => 
          `- **${s.name}** (${s.category || 'uncategorized'}): ${s.description || ''}`
        ).join('\n')

        return {
          success: true,
          result: { count: skills.length, skills },
          output: `Available Skills (${skills.length}):\n\n${output}`,
        }
      },
    },

    // ========== 技能执行工具 ==========
    {
      name: 'SkillExecute',
      description: 'Execute a skill with given parameters',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' },
          input: { type: 'object', description: 'Skill input parameters' },
        },
        required: ['name'],
      },
      category: 'skill',
      handler: async (input) => {
        const name = input.name as string
        const params = input.input || {}

        const skill = skillRegistry.get(name)
        if (!skill) {
          return {
            success: false,
            error: `Skill "${name}" not found. Use SkillList to see available skills.`,
          }
        }

        try {
          const result = await skill.handler(params)
          return result
        } catch (error) {
          return {
            success: false,
            error: `Skill execution failed: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== 技能信息工具 ==========
    {
      name: 'SkillInfo',
      description: 'Get detailed information about a skill',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' },
        },
        required: ['name'],
      },
      category: 'skill',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const name = input.name as string

        const skill = skillRegistry.get(name)
        if (!skill) {
          return {
            success: false,
            error: `Skill "${name}" not found`,
          }
        }

        return {
          success: true,
          result: {
            name: skill.name,
            description: skill.description,
            category: skill.category,
            version: skill.version,
            parameters: skill.parameters,
          },
          output: [
            `Skill: ${skill.name}`,
            `Category: ${skill.category || 'uncategorized'}`,
            `Version: ${skill.version || '1.0.0'}`,
            `Description: ${skill.description || 'No description'}`,
            skill.parameters ? `\nParameters:\n${JSON.stringify(skill.parameters, null, 2)}` : '',
          ].filter(Boolean).join('\n'),
        }
      },
    },

    // ========== 模板渲染工具 ==========
    {
      name: 'TemplateRender',
      description: 'Render a template with variables',
      inputSchema: {
        type: 'object',
        properties: {
          template: { type: 'string', description: 'Template string with {{variable}} placeholders' },
          variables: { type: 'object', description: 'Variables to substitute' },
        },
        required: ['template'],
      },
      category: 'skill',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const template = input.template as string
        const variables = (input.variables as Record<string, any>) || {}

        let rendered = template

        // 简单的变量替换
        for (const [key, value] of Object.entries(variables)) {
          const placeholder = `{{${key}}}`
          const re = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g')
          rendered = rendered.replace(re, String(value))
        }

        // 条件块
        rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, cond, content) => {
          return variables[cond] ? content : ''
        })

        // 循环块
        rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, array, content) => {
          const arr = variables[array]
          if (!Array.isArray(arr)) return ''
          return arr.map((item: any, i: number) => {
            let itemContent = content
            if (typeof item === 'object') {
              for (const [k, v] of Object.entries(item)) {
                itemContent = itemContent.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
              }
            } else {
              itemContent = itemContent.replace(/\{\{this\}\}/g, String(item))
            }
            return itemContent.replace(/\{\{@index\}\}/g, String(i))
          }).join('')
        })

        // 移除未替换的变量
        const unusedVars = rendered.match(/\{\{[^}]+\}\}/g) || []

        return {
          success: true,
          result: {
            rendered,
            unusedVariables: unusedVars,
            varCount: Object.keys(variables).length,
          },
          output: rendered,
        }
      },
    },

    // ========== 宏展开工具 ==========
    {
      name: 'MacroExpand',
      description: 'Expand macros in text',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text with macros' },
          date: { type: 'string', description: 'Date override (ISO format)' },
          time: { type: 'string', description: 'Current time override (HH:mm:ss)' },
        },
        required: ['text'],
      },
      category: 'skill',
      isReadOnly: true,
      isConcurrencySafe: true,
      handler: async (input) => {
        const text = input.text as string
        const dateOverride = input.date as string
        const timeOverride = input.time as string

        const now = dateOverride ? new Date(dateOverride) : new Date()
        if (timeOverride) {
          const [h, m, s] = timeOverride.split(':').map(Number)
          now.setHours(h, m, s || 0)
        }

        let expanded = text

        // 日期宏
        expanded = expanded.replace(/\{\{DATE\}\}/g, now.toISOString().split('T')[0])
        expanded = expanded.replace(/\{\{DATE:([^}]+)\}\}/g, (_, fmt) => {
          try {
            return now.toLocaleDateString(fmt)
          } catch {
            return now.toISOString().split('T')[0]
          }
        })
        expanded = expanded.replace(/\{\{YEAR\}\}/g, String(now.getFullYear()))
        expanded = expanded.replace(/\{\{MONTH\}\}/g, String(now.getMonth() + 1).padStart(2, '0'))
        expanded = expanded.replace(/\{\{DAY\}\}/g, String(now.getDate()).padStart(2, '0'))
        expanded = expanded.replace(/\{\{TIME\}\}/g, now.toTimeString().slice(0, 8))
        expanded = expanded.replace(/\{\{TIMESTAMP\}\}/g, String(Math.floor(now.getTime() / 1000)))
        expanded = expanded.replace(/\{\{TIMESTAMP_MS\}\}/g, String(now.getTime()))

        // 随机宏
        expanded = expanded.replace(/\{\{RANDOM:(\d+)-(\d+)\}\}/g, (_, min, max) => {
          return String(Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1)) + parseInt(min))
        })
        expanded = expanded.replace(/\{\{UUID\}\}/g, () => {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0
            const v = c === 'x' ? r : (r & 0x3 | 0x8)
            return v.toString(16)
          })
        })

        // 环境宏
        expanded = expanded.replace(/\{\{ENV:([^}]+)\}\}/g, (_, key) => process.env[key] || '')

        // 平台宏
        expanded = expanded.replace(/\{\{PLATFORM\}\}/g, process.platform)
        expanded = expanded.replace(/\{\{ARCH\}\}/g, process.arch)

        return {
          success: true,
          result: { expanded, original: text },
          output: expanded,
        }
      },
    },

    // ========== 技能注册工具 ==========
    {
      name: 'SkillRegister',
      description: 'Register a new custom skill',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name' },
          description: { type: 'string', description: 'Skill description' },
          category: { type: 'string', description: 'Skill category' },
          parameters: { type: 'object', description: 'Parameter schema' },
          code: { type: 'string', description: 'Skill handler code (async function)' },
        },
        required: ['name', 'description', 'code'],
      },
      category: 'skill',
      handler: async (input) => {
        const { name, description, category, parameters, code } = input

        if (skillRegistry.has(name)) {
          return {
            success: false,
            error: `Skill "${name}" already exists`,
          }
        }

        try {
          // 动态创建函数
          const handler = new Function('input', `return (async () => { ${code} })()`)
          
          skillRegistry.set(name, {
            name,
            description,
            category: category || 'custom',
            version: '1.0.0',
            parameters,
            handler,
          })

          return {
            success: true,
            result: { name, registered: true },
            output: `Skill "${name}" registered successfully`,
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to register skill: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },
  ]
}

/**
 * 获取所有内置技能定义
 */
export function getBuiltInSkills(): any[] {
  return builtInSkills
}

export default createSkillTools
