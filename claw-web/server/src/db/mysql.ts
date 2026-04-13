import mysql from 'mysql2/promise'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'

let pool: mysql.Pool | null = null

interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function loadDbConfig(): DbConfig {
  const config: Record<string, string> = {}

  // 优先从环境变量读取（Docker/生产环境推荐方式）
  const envVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
  for (const key of envVars) {
    if (process.env[key]) {
      config[key] = process.env[key]
    }
  }

  // 如果环境变量不完整，尝试从 .env 文件补充
  if (!config['DB_HOST'] || !config['DB_USER']) {
    let configPath = join(__dirname, '../../.env')
    try {
      readFileSync(configPath, 'utf-8')
    } catch {
      configPath = join(process.cwd(), '.env')
    }

    try {
      const envContent = readFileSync(configPath, 'utf-8')
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
          const [key, ...valueParts] = trimmed.split('=')
          if (key && valueParts.length > 0 && !config[key.trim()]) {
            config[key.trim()] = valueParts.join('=').trim()
          }
        }
      }
    } catch {
      console.log('[loadDbConfig] No .env file found, using environment variables only')
    }
  }

  return {
    host: config['DB_HOST'] || 'localhost',
    port: parseInt(config['DB_PORT'] || '3306', 10),
    user: config['DB_USER'] || 'root',
    password: config['DB_PASSWORD'] || '',
    database: config['DB_NAME'] || 'claude_code_haha',
  }
}

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = loadDbConfig()
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    })
    console.log('MySQL pool created with config:', { host: config.host, port: config.port, user: config.user, database: config.database })
  }
  return pool
}

export async function initDatabase(): Promise<void> {
  const config = loadDbConfig()

  const tempPool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 2,
  })

  try {
    await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``)
    console.log(`Database ${config.database} ensured`)

    await tempPool.query(`USE \`${config.database}\``)
    console.log(`Using database ${config.database}`)

    // 使用 __dirname 获取当前文件所在目录，然后向上查找
    const currentDir = __dirname // server/src/db/
    const projectRoot = resolve(currentDir, '..', '..') // server/
    const schemaPath = join(projectRoot, 'src', 'db', 'schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')

    const statements = schema.split(';').filter(s => s.trim())
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await tempPool.query(statement)
        } catch (err: any) {
          if (err.code !== 'ER_TABLE_EXISTS_ERROR' && err.code !== 'ER_DUP_KEYNAME') {
            console.warn('Schema statement warning:', err.message)
          }
        }
      }
    }

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN email VARCHAR(120) UNIQUE AFTER username
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN password_hash VARCHAR(255) AFTER email
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER password_hash
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN is_admin BOOLEAN DEFAULT FALSE AFTER is_active
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN last_login TIMESTAMP NULL AFTER updated_at
    `).catch(() => {})

    await tempPool.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(120) NOT NULL,
        code VARCHAR(6) NOT NULL,
        usage_type VARCHAR(20) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_code (code)
      )
    `).catch(() => {})

    // 添加 github_id 字段（如果不存在）
    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN github_id VARCHAR(50) UNIQUE AFTER password_hash
    `).catch(() => {})

    // 添加 github_id 索引
    await tempPool.query(`
      CREATE INDEX idx_github_id ON users(github_id)
    `).catch(() => {})

    await tempPool.query(`
      DROP INDEX username ON users
    `).catch(() => {})

    // 添加 is_pinned 字段到 sessions 表（如果不存在）
    await tempPool.query(`
      ALTER TABLE sessions 
      ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE AFTER model
    `).catch(() => {})

    // 添加 shared_sessions 表（如果不存在）
    await tempPool.query(`
      CREATE TABLE IF NOT EXISTS shared_sessions (
        id VARCHAR(36) PRIMARY KEY,
        share_code VARCHAR(32) NOT NULL UNIQUE,
        session_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        title VARCHAR(255) DEFAULT '分享对话',
        expires_at TIMESTAMP NULL,
        view_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_shared_sessions_share_code (share_code),
        INDEX idx_shared_sessions_session_id (session_id),
        INDEX idx_shared_sessions_user_id (user_id)
      )
    `).catch(() => {})

    // 创建提示词模板分类表（如果不存在）
    await tempPool.query(`
      CREATE TABLE IF NOT EXISTS prompt_template_categories (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(50) DEFAULT 'folder',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_prompt_categories_sort (sort_order)
      )
    `).catch(() => {})

    // 创建提示词模板表（如果不存在）
    await tempPool.query(`
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        category_id VARCHAR(36),
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        description TEXT,
        is_builtin BOOLEAN DEFAULT FALSE,
        is_favorite BOOLEAN DEFAULT FALSE,
        use_count INT DEFAULT 0,
        tags JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_prompt_templates_user (user_id),
        INDEX idx_prompt_templates_category (category_id),
        INDEX idx_prompt_templates_favorite (is_favorite)
      )
    `).catch(() => {})

    // 初始化内置提示词模板分类
    const [categories] = await tempPool.query('SELECT COUNT(*) as count FROM prompt_template_categories') as [{ count: number }[], unknown]
    if (categories[0].count === 0) {
      const builtinCategories = [
        { id: 'cat-code', name: '代码助手', icon: 'code', sort_order: 1 },
        { id: 'cat-writing', name: '写作助手', icon: 'pencil', sort_order: 2 },
        { id: 'cat-analysis', name: '分析优化', icon: 'analytics', sort_order: 3 },
        { id: 'cat-translation', name: '翻译助手', icon: 'language', sort_order: 4 },
        { id: 'cat-creative', name: '创意娱乐', icon: 'bulb', sort_order: 5 },
      ]
      for (const cat of builtinCategories) {
        await tempPool.query(
          'INSERT INTO prompt_template_categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
          [cat.id, cat.name, cat.icon, cat.sort_order]
        )
      }
    }

    // 初始化内置提示词模板
    const [templates] = await tempPool.query('SELECT COUNT(*) as count FROM prompt_templates WHERE is_builtin = TRUE') as [{ count: number }[], unknown]
    if (templates[0].count === 0) {
      const builtinTemplates = [
        {
          id: 'tpl-code-review',
          category_id: 'cat-code',
          title: '代码审查',
          content: '请帮我审查以下代码，重点关注：\n1. 代码质量和可读性\n2. 潜在bug和安全性问题\n3. 性能优化建议\n4. 最佳实践建议\n\n代码：\n```\n{{code}}\n```',
          description: '对代码进行全面审查并提供优化建议',
          is_builtin: true,
          tags: JSON.stringify(['代码审查', '质量', '优化'])
        },
        {
          id: 'tpl-refactor',
          category_id: 'cat-code',
          title: '代码重构',
          content: '请帮我重构以下代码，使其更加：\n1. 可读性强\n2. 易于维护\n3. 符合最佳实践\n\n原始代码：\n```\n{{code}}\n```\n\n重构要求：\n{{requirements}}',
          description: '对代码进行重构优化',
          is_builtin: true,
          tags: JSON.stringify(['重构', '优化', '最佳实践'])
        },
        {
          id: 'tpl-explain',
          category_id: 'cat-code',
          title: '代码解释',
          content: '请详细解释以下代码的功能和工作原理：\n\n```\n{{code}}\n```\n\n请用通俗易懂的语言解释。',
          description: '详细解释代码功能和原理',
          is_builtin: true,
          tags: JSON.stringify(['解释', '学习', '理解'])
        },
        {
          id: 'tpl-blog',
          category_id: 'cat-writing',
          title: '博客写作',
          content: '请帮我撰写一篇关于「{{topic}}」的博客文章，要求：\n1. 标题吸引人\n2. 内容结构清晰\n3. 包含实际案例或示例\n4. 适当使用小标题\n5. 结尾有总结\n\n文章风格：{{style}}',
          description: '快速生成高质量博客文章',
          is_builtin: true,
          tags: JSON.stringify(['写作', '博客', '内容创作'])
        },
        {
          id: 'tpl-summary',
          category_id: 'cat-writing',
          title: '文章总结',
          content: '请帮我总结以下文章的主要内容：\n\n{{content}}\n\n要求：\n1. 提取核心观点\n2. 列出关键要点\n3. 给出总结性评价',
          description: '快速总结文章要点',
          is_builtin: true,
          tags: JSON.stringify(['总结', '提炼', '要点'])
        },
        {
          id: 'tpl-english',
          category_id: 'cat-translation',
          title: '英文翻译',
          content: '请将以下中文文本翻译成流畅自然的英文：\n\n{{text}}\n\n要求：\n1. 保持原意\n2. 语言自然流畅\n3. 符合英语表达习惯',
          description: '高质量中译英',
          is_builtin: true,
          tags: JSON.stringify(['翻译', '英文', '中译英'])
        },
        {
          id: 'tpl-chinese',
          category_id: 'cat-translation',
          title: '中文翻译',
          content: '请将以下英文文本翻译成中文：\n\n{{text}}\n\n要求：\n1. 保持原意\n2. 语言通顺流畅\n3. 符合中文表达习惯',
          description: '高质量英译中',
          is_builtin: true,
          tags: JSON.stringify(['翻译', '中文', '英译中'])
        },
        {
          id: 'tpl SWOT',
          category_id: 'cat-analysis',
          title: 'SWOT分析',
          content: '请对「{{topic}}」进行SWOT分析：\n\n1. Strengths（优势）：\n2. Weaknesses（劣势）：\n3. Opportunities（机会）：\n4. Threats（威胁）：',
          description: '快速进行SWOT分析',
          is_builtin: true,
          tags: JSON.stringify(['分析', 'SWOT', '战略'])
        },
        {
          id: 'tpl-creative-story',
          category_id: 'cat-creative',
          title: '故事创作',
          content: '请帮我创作一个关于「{{theme}}」的{{genre}}故事，要求：\n1. 情节引人入胜\n2. 人物形象鲜明\n3. 有明确的起承转合\n4. 结尾有惊喜或深意',
          description: '创意故事生成器',
          is_builtin: true,
          tags: JSON.stringify(['创作', '故事', '创意'])
        },
      ]
      for (const tpl of builtinTemplates) {
        await tempPool.query(
          'INSERT INTO prompt_templates (id, category_id, title, content, description, is_builtin, tags) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [tpl.id, tpl.category_id, tpl.title, tpl.content, tpl.description, tpl.is_builtin, tpl.tags]
        )
      }
    }

    // 添加 sequence 字段到 messages 表（用于确保消息顺序）
    await tempPool.query(`
      ALTER TABLE messages 
      ADD COLUMN sequence INT DEFAULT 0
    `).catch(() => {})

    // 创建 sequence 字段索引
    await tempPool.query(`
      CREATE INDEX idx_messages_sequence ON messages(session_id, sequence)
    `).catch(() => {})

    console.log('Database schema initialized')
  } finally {
    await tempPool.end()
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log('MySQL pool closed')
  }
}
