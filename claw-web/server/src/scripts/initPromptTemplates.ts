/**
 * 初始化提示词模板数据
 * 运行: bun run src/scripts/initPromptTemplates.ts
 */

import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../db/mysql'

// 示例分类数据 - 使用固定ID
const categories = [
  { id: 'cat-code', name: '代码助手', icon: 'code', sortOrder: 1 },
  { id: 'cat-writing', name: '文档写作', icon: 'pencil', sortOrder: 2 },
  { id: 'cat-analysis', name: '分析诊断', icon: 'analytics', sortOrder: 3 },
  { id: 'cat-learning', name: '学习辅助', icon: 'bulb', sortOrder: 4 }
]

// 示例模板数据
const templates = [
  {
    id: 'builtin-1',
    title: '代码解释',
    content: `请解释以下代码的工作原理：

\`\`\`
{{code}}
\`\`\``,
    description: '解释代码的功能和实现原理',
    categoryId: 'cat-code',
    tags: ['代码', '解释', '分析'],
    useCount: 128
  },
  {
    id: 'builtin-2',
    title: '代码优化',
    content: `请优化以下代码，提高其性能和可读性：

\`\`\`
{{code}}
\`\`\`

请提供优化后的代码和优化说明。`,
    description: '优化代码性能和可读性',
    categoryId: 'cat-code',
    tags: ['代码', '优化', '重构'],
    useCount: 96
  },
  {
    id: 'builtin-3',
    title: 'Bug 修复',
    content: `以下代码存在 Bug，请找出问题并修复：

\`\`\`
{{code}}
\`\`\`

请说明 Bug 原因和修复方案。`,
    description: '找出并修复代码中的 Bug',
    categoryId: 'cat-code',
    tags: ['代码', 'Bug', '调试'],
    useCount: 85
  },
  {
    id: 'builtin-4',
    title: '生成单元测试',
    content: `请为以下代码生成单元测试：

\`\`\`
{{code}}
\`\`\`

要求：
1. 使用 {{framework}} 测试框架
2. 覆盖主要功能路径
3. 包含边界条件测试`,
    description: '为代码生成完整的单元测试',
    categoryId: 'cat-code',
    tags: ['测试', '单元测试', '代码质量'],
    useCount: 72
  },
  {
    id: 'builtin-5',
    title: '代码审查',
    content: `请对以下代码进行审查，检查：
1. 代码风格和规范
2. 潜在的安全问题
3. 性能瓶颈
4. 可维护性

\`\`\`
{{code}}
\`\`\``,
    description: '全面的代码审查和反馈',
    categoryId: 'cat-code',
    tags: ['代码审查', '质量', '规范'],
    useCount: 64
  },
  {
    id: 'builtin-6',
    title: '编写文档',
    content: `请为以下代码编写详细的技术文档：

\`\`\`
{{code}}
\`\`\`

文档应包含：
- 功能说明
- 参数说明
- 返回值说明
- 使用示例`,
    description: '生成代码的技术文档',
    categoryId: 'cat-writing',
    tags: ['文档', '注释', '说明'],
    useCount: 58
  },
  {
    id: 'builtin-7',
    title: '重构建议',
    content: `请分析以下代码，提供重构建议：

\`\`\`
{{code}}
\`\`\`

请从以下角度分析：
- 设计模式应用
- 代码结构优化
- 依赖关系梳理`,
    description: '提供代码重构的专业建议',
    categoryId: 'cat-code',
    tags: ['重构', '设计模式', '架构'],
    useCount: 45
  },
  {
    id: 'builtin-8',
    title: '正则表达式',
    content: `请帮我写一个正则表达式，用于匹配：

{{description}}

要求：
- 提供正则表达式
- 解释各部分含义
- 给出使用示例`,
    description: '生成并解释正则表达式',
    categoryId: 'cat-code',
    tags: ['正则', '字符串', '匹配'],
    useCount: 112
  }
]

async function init() {
  console.log('开始初始化提示词模板数据...')
  const pool = getPool()

  try {
    // 1. 创建分类
    console.log('创建分类...')
    for (const cat of categories) {
      try {
        // 检查分类是否已存在
        const [existing] = await pool.query(
          'SELECT id FROM prompt_template_categories WHERE id = ?',
          [cat.id]
        ) as [any[], unknown]

        if (existing.length === 0) {
          await pool.query(
            'INSERT INTO prompt_template_categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
            [cat.id, cat.name, cat.icon, cat.sortOrder]
          )
          console.log(`✓ 创建分类: ${cat.name}`)
        } else {
          console.log(`  分类已存在: ${cat.name}`)
        }
      } catch (error) {
        console.error(`✗ 创建分类失败: ${cat.name}`, error)
      }
    }

    // 2. 创建模板
    console.log('创建模板...')
    for (const tpl of templates) {
      try {
        // 检查模板是否已存在
        const [existing] = await pool.query(
          'SELECT id FROM prompt_templates WHERE id = ?',
          [tpl.id]
        ) as [any[], unknown]

        if (existing.length === 0) {
          await pool.query(
            `INSERT INTO prompt_templates 
             (id, user_id, category_id, title, content, description, is_builtin, is_favorite, use_count, tags, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              tpl.id,
              null,
              tpl.categoryId,
              tpl.title,
              tpl.content,
              tpl.description,
              true,
              false,
              tpl.useCount,
              JSON.stringify(tpl.tags)
            ]
          )
          console.log(`✓ 创建模板: ${tpl.title}`)
        } else {
          console.log(`  模板已存在: ${tpl.title}`)
        }
      } catch (error) {
        console.error(`✗ 创建模板失败: ${tpl.title}`, error)
      }
    }

    console.log('\n初始化完成！')
    process.exit(0)
  } catch (error) {
    console.error('初始化失败:', error)
    process.exit(1)
  }
}

// 运行初始化
init()
