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
  // ========== 代码助手类 ==========
  {
    id: 'builtin-1',
    title: '代码解释',
    content: `请解释以下代码的工作原理：

\`\`\`
{{code}}
\`\`\`

请从以下几个方面解释：
1. 代码的主要功能
2. 关键逻辑和算法
3. 输入输出说明`,
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

请提供：
1. 优化后的代码
2. 具体的优化点说明
3. 性能提升预估`,
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

请说明：
1. Bug 的具体表现
2. Bug 产生的原因
3. 修复方案和修复后的代码`,
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
3. 包含边界条件测试
4. 测试用例命名规范`,
    description: '为代码生成完整的单元测试',
    categoryId: 'cat-code',
    tags: ['测试', '单元测试', '代码质量'],
    useCount: 72
  },
  {
    id: 'builtin-5',
    title: '代码审查',
    content: `请对以下代码进行审查：

\`\`\`
{{code}}
\`\`\`

请检查以下方面：
1. 代码风格和规范
2. 潜在的安全问题
3. 性能瓶颈
4. 可维护性
5. 改进建议`,
    description: '全面的代码审查和反馈',
    categoryId: 'cat-code',
    tags: ['代码审查', '质量', '规范'],
    useCount: 64
  },
  {
    id: 'builtin-6',
    title: '重构建议',
    content: `请分析以下代码，提供重构建议：

\`\`\`
{{code}}
\`\`\`

请从以下角度分析：
- 设计模式应用
- 代码结构优化
- 依赖关系梳理
- 可测试性改进`,
    description: '提供代码重构的专业建议',
    categoryId: 'cat-code',
    tags: ['重构', '设计模式', '架构'],
    useCount: 45
  },
  {
    id: 'builtin-7',
    title: '正则表达式',
    content: `请帮我写一个正则表达式，用于匹配：

{{description}}

要求：
- 提供正则表达式
- 解释各部分含义
- 给出使用示例
- 说明注意事项`,
    description: '生成并解释正则表达式',
    categoryId: 'cat-code',
    tags: ['正则', '字符串', '匹配'],
    useCount: 112
  },
  {
    id: 'builtin-8',
    title: 'API 设计',
    content: `请为以下功能设计 API 接口：

功能描述：{{description}}

要求：
1. RESTful API 设计
2. 请求/响应格式定义
3. 错误码设计
4. 接口文档示例`,
    description: '设计规范的 API 接口',
    categoryId: 'cat-code',
    tags: ['API', '接口设计', 'RESTful'],
    useCount: 56
  },
  {
    id: 'builtin-9',
    title: 'SQL 优化',
    content: `请优化以下 SQL 查询：

\`\`\`sql
{{sql}}
\`\`\`

请提供：
1. 优化后的 SQL
2. 优化思路说明
3. 索引建议`,
    description: '优化 SQL 查询性能',
    categoryId: 'cat-code',
    tags: ['SQL', '数据库', '优化'],
    useCount: 78
  },
  {
    id: 'builtin-10',
    title: '代码转换',
    content: `请将以下代码从 {{sourceLang}} 转换为 {{targetLang}}：

\`\`\`
{{code}}
\`\`\`

要求：
1. 保持功能一致
2. 使用目标语言的惯用写法
3. 说明关键差异`,
    description: '将代码转换为其他编程语言',
    categoryId: 'cat-code',
    tags: ['代码转换', '语言迁移', '多语言'],
    useCount: 42
  },

  // ========== 文档写作类 ==========
  {
    id: 'builtin-11',
    title: '编写技术文档',
    content: `请为以下代码编写详细的技术文档：

\`\`\`
{{code}}
\`\`\`

文档应包含：
- 功能说明
- 参数说明
- 返回值说明
- 使用示例
- 注意事项`,
    description: '生成代码的技术文档',
    categoryId: 'cat-writing',
    tags: ['文档', '注释', '说明'],
    useCount: 58
  },
  {
    id: 'builtin-12',
    title: '编写 README',
    content: `请为以下项目生成 README.md：

项目描述：{{description}}
技术栈：{{techStack}}

README 应包含：
1. 项目简介
2. 功能特性
3. 安装说明
4. 使用示例
5. 贡献指南`,
    description: '生成项目 README 文档',
    categoryId: 'cat-writing',
    tags: ['README', '文档', '项目介绍'],
    useCount: 67
  },
  {
    id: 'builtin-13',
    title: '编写提交信息',
    content: `请为以下代码变更编写规范的 Git 提交信息：

变更内容：
{{changes}}

要求：
1. 遵循 Conventional Commits 规范
2. 简洁明了的标题
3. 详细的变更说明`,
    description: '生成规范的 Git 提交信息',
    categoryId: 'cat-writing',
    tags: ['Git', '提交信息', '规范'],
    useCount: 89
  },
  {
    id: 'builtin-14',
    title: '编写注释',
    content: `请为以下代码添加详细的注释：

\`\`\`
{{code}}
\`\`\`

要求：
1. 函数/类级别的文档注释
2. 关键逻辑的行内注释
3. 复杂算法的说明`,
    description: '为代码添加详细注释',
    categoryId: 'cat-writing',
    tags: ['注释', '文档', '代码规范'],
    useCount: 73
  },

  // ========== 分析诊断类 ==========
  {
    id: 'builtin-15',
    title: '错误分析',
    content: `请分析以下错误信息并提供解决方案：

错误信息：
\`\`\`
{{error}}
\`\`\`

相关代码：
\`\`\`
{{code}}
\`\`\`

请提供：
1. 错误原因分析
2. 解决方案
3. 预防措施`,
    description: '分析错误信息并提供解决方案',
    categoryId: 'cat-analysis',
    tags: ['错误', '调试', '问题解决'],
    useCount: 156
  },
  {
    id: 'builtin-16',
    title: '性能分析',
    content: `请分析以下代码的性能问题：

\`\`\`
{{code}}
\`\`\`

请分析：
1. 时间复杂度
2. 空间复杂度
3. 性能瓶颈
4. 优化建议`,
    description: '分析代码性能并提供优化建议',
    categoryId: 'cat-analysis',
    tags: ['性能', '分析', '优化'],
    useCount: 51
  },
  {
    id: 'builtin-17',
    title: '安全审计',
    content: `请对以下代码进行安全审计：

\`\`\`
{{code}}
\`\`\`

请检查：
1. SQL 注入风险
2. XSS 漏洞
3. 敏感信息泄露
4. 其他安全问题`,
    description: '检查代码安全风险',
    categoryId: 'cat-analysis',
    tags: ['安全', '审计', '漏洞'],
    useCount: 38
  },
  {
    id: 'builtin-18',
    title: '日志分析',
    content: `请分析以下日志信息：

\`\`\`
{{logs}}
\`\`\`

请提供：
1. 问题定位
2. 根因分析
3. 解决建议`,
    description: '分析系统日志',
    categoryId: 'cat-analysis',
    tags: ['日志', '分析', '运维'],
    useCount: 44
  },

  // ========== 学习辅助类 ==========
  {
    id: 'builtin-19',
    title: '概念解释',
    content: `请解释以下技术概念：

{{concept}}

请从以下方面说明：
1. 基本概念
2. 工作原理
3. 应用场景
4. 示例说明`,
    description: '解释技术概念和原理',
    categoryId: 'cat-learning',
    tags: ['概念', '学习', '基础知识'],
    useCount: 92
  },
  {
    id: 'builtin-20',
    title: '学习路线',
    content: `请为 {{topic}} 制定学习路线：

要求：
1. 分阶段学习路径
2. 每个阶段的学习目标
3. 推荐的学习资源
4. 实践项目建议`,
    description: '制定技术学习路线',
    categoryId: 'cat-learning',
    tags: ['学习路线', '技能提升', '规划'],
    useCount: 65
  },
  {
    id: 'builtin-21',
    title: '面试准备',
    content: `请为 {{position}} 岗位准备面试题：

要求：
1. 常见技术问题
2. 场景设计题
3. 算法题
4. 参考答案要点`,
    description: '准备技术面试',
    categoryId: 'cat-learning',
    tags: ['面试', '求职', '准备'],
    useCount: 87
  },
  {
    id: 'builtin-22',
    title: '最佳实践',
    content: `请提供 {{topic}} 的最佳实践：

请包含：
1. 行业标准和规范
2. 常见陷阱和避免方法
3. 实际案例分享
4. 工具推荐`,
    description: '分享技术最佳实践',
    categoryId: 'cat-learning',
    tags: ['最佳实践', '规范', '经验'],
    useCount: 53
  }
]

async function init() {
  console.log('开始初始化提示词模板数据...')
  const pool = getPool()
  let connection: any = null

  try {
    // 获取连接并开启事务
    connection = await pool.getConnection()
    await connection.beginTransaction()

    // 1. 创建分类
    console.log('创建分类...')
    for (const cat of categories) {
      try {
        // 检查分类是否已存在
        const [existing] = await connection.query(
          'SELECT id FROM prompt_template_categories WHERE id = ?',
          [cat.id]
        ) as [any[], unknown]

        if (existing.length === 0) {
          await connection.query(
            'INSERT INTO prompt_template_categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
            [cat.id, cat.name, cat.icon, cat.sortOrder]
          )
          console.log(`✓ 创建分类: ${cat.name} (id=${cat.id})`)
        } else {
          console.log(`  分类已存在: ${cat.name} (id=${cat.id})`)
        }
      } catch (error) {
        console.error(`✗ 创建分类失败: ${cat.name}`, error)
        throw error
      }
    }

    // 验证所有分类是否已创建
    const [allCategories] = await connection.query(
      'SELECT id, name FROM prompt_template_categories'
    ) as [any[], unknown]
    console.log('\n当前分类表中的数据:')
    allCategories.forEach((cat: any) => {
      console.log(`  - id=${cat.id}, name=${cat.name}`)
    })

    // 2. 创建模板
    console.log('\n创建模板...')
    for (const tpl of templates) {
      try {
        // 检查模板是否已存在
        const [existing] = await connection.query(
          'SELECT id FROM prompt_templates WHERE id = ?',
          [tpl.id]
        ) as [any[], unknown]

        if (existing.length === 0) {
          console.log(`  正在插入模板: ${tpl.title}, categoryId=${tpl.categoryId}`)
          await connection.query(
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
        console.error(`✗ 创建模板失败: ${tpl.title}, categoryId=${tpl.categoryId}`, error)
        throw error
      }
    }

    // 提交事务
    await connection.commit()
    console.log('\n初始化完成！')
  } catch (error) {
    console.error('初始化失败:', error)
    if (connection) {
      await connection.rollback()
      console.log('事务已回滚')
    }
    process.exit(1)
  } finally {
    if (connection) {
      connection.release()
    }
  }

  process.exit(0)
}

// 运行初始化
init()
