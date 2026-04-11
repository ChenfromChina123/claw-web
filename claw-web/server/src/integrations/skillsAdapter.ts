/**
 * Skills系统适配层
 *
 * 将原项目(claw-code)的skills系统适配到Server环境
 * 核心功能：
 * - 解析SKILL.md frontmatter
 * - 加载.skills目录中的技能
 * - 支持条件技能(paths过滤)
 * - 参数替换和shell命令执行
 */

import { readdir, readFile, stat } from 'fs/promises'
import { resolve, join, extname, basename, dirname, isAbsolute } from 'path'
import { existsSync } from 'fs'

// ==================== 类型定义 ====================

export type SettingSource = 'policySettings' | 'userSettings' | 'projectSettings' | 'plugin' | 'builtin'

export type LoadedFrom =
  | 'commands_DEPRECATED'
  | 'skills'
  | 'plugin'
  | 'managed'
  | 'bundled'
  | 'mcp'

export interface FrontmatterData {
  'allowed-tools'?: string | string[] | null
  description?: string | null
  'argument-hint'?: string | null
  when_to_use?: string | null
  version?: string | null
  'user-invocable'?: string | null
  model?: string | null
  context?: 'inline' | 'fork' | null
  agent?: string | null
  effort?: string | null
  paths?: string | string[] | null
  shell?: string | null
  hooks?: unknown | null
  [key: string]: unknown
}

export interface ParsedMarkdown {
  frontmatter: FrontmatterData
  content: string
}

export interface Command {
  type: 'prompt'
  name: string
  description: string
  hasUserSpecifiedDescription?: boolean
  allowedTools?: string[]
  argumentHint?: string
  argNames?: string[]
  whenToUse?: string
  version?: string
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  context?: 'inline' | 'fork'
  agent?: string
  effort?: string
  paths?: string[]
  source: SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'
  contentLength: number
  progressMessage: string
  isHidden?: boolean
  hooks?: unknown
  skillRoot?: string
  loadedFrom?: LoadedFrom
  getPromptForCommand(args: string): Promise<{ type: 'text'; text: string }[]>
}

export interface SkillExecutionContext {
  projectRoot: string
  userId?: string
  sessionId?: string
  variables?: Record<string, string>
}

export interface SkillExecutionResult {
  success: boolean
  output?: string
  error?: string
  metadata?: {
    skillId: string
    executionTime: number
    variables?: Record<string, string>
  }
}

// ==================== Frontmatter解析 ====================

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)---\s*\n?/

/**
 * 解析markdown内容的frontmatter
 */
export function parseFrontmatter(
  markdown: string,
  sourcePath?: string,
): ParsedMarkdown {
  const match = markdown.match(FRONTMATTER_REGEX)

  if (!match) {
    return {
      frontmatter: {},
      content: markdown,
    }
  }

  const frontmatterText = match[1] || ''
  const content = markdown.slice(match[0].length)

  let frontmatter: FrontmatterData = {}
  try {
    frontmatter = parseYamlSimple(frontmatterText) as FrontmatterData
  } catch (retryError) {
    console.warn(
      `Failed to parse YAML frontmatter${sourcePath ? ` in ${sourcePath}` : ''}: ${retryError}`,
    )
  }

  return {
    frontmatter,
    content,
  }
}

/**
 * 简化的YAML解析器，处理常见的frontmatter格式
 */
function parseYamlSimple(yamlText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yamlText.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // 解析 key: value
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmed.slice(0, colonIndex).trim()
    const value = trimmed.slice(colonIndex + 1).trim()

    if (!key) continue

    // 处理空值
    if (value === '' || value === 'null') {
      result[key] = null
      continue
    }

    // 处理引号字符串
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      result[key] = value.slice(1, -1)
      continue
    }

    // 处理数组格式 [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1)
      result[key] = arrayContent.split(',').map(s => {
        s = s.trim()
        if ((s.startsWith('"') && s.endsWith('"')) ||
            (s.startsWith("'") && s.endsWith("'"))) {
          return s.slice(1, -1)
        }
        return s
      })
      continue
    }

    // 处理布尔值
    if (value === 'true') {
      result[key] = true
      continue
    }
    if (value === 'false') {
      result[key] = false
      continue
    }

    // 处理数字
    const num = Number(value)
    if (!isNaN(num) && value !== '') {
      result[key] = num
      continue
    }

    // 默认作为字符串
    result[key] = value
  }

  return result
}

/**
 * 解析paths frontmatter，支持逗号分隔和YAML数组格式
 */
function parseSkillPaths(input: string | string[] | null | undefined): string[] | undefined {
  if (!input) return undefined

  if (Array.isArray(input)) {
    return input.flatMap(parseSkillPaths).filter(Boolean) as string[]
  }

  if (typeof input !== 'string') return undefined

  // 逗号分隔处理
  const parts = input.split(',').map(s => s.trim()).filter(Boolean)

  if (parts.length === 0) return undefined

  return parts
}

/**
 * 解析allowed-tools frontmatter
 */
function parseAllowedTools(input: string | string[] | null | undefined): string[] | undefined {
  if (!input) return undefined

  if (Array.isArray(input)) {
    return input.map(s => String(s)).filter(Boolean)
  }

  if (typeof input === 'string') {
    // 逗号分隔或空格分隔
    const tools = input.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
    return tools.length > 0 ? tools : undefined
  }

  return undefined
}

// ==================== 技能命令创建 ====================

/**
 * 从frontmatter和数据创建技能命令
 */
export function createSkillCommand({
  skillName,
  displayName,
  description,
  hasUserSpecifiedDescription,
  markdownContent,
  allowedTools,
  argumentHint,
  argumentNames,
  whenToUse,
  version,
  model,
  disableModelInvocation,
  userInvocable,
  source,
  baseDir,
  loadedFrom,
  hooks,
  executionContext,
  agent,
  paths,
  effort,
  shell,
}: {
  skillName: string
  displayName?: string
  description: string
  hasUserSpecifiedDescription: boolean
  markdownContent: string
  allowedTools?: string[]
  argumentHint?: string
  argumentNames?: string[]
  whenToUse?: string
  version?: string
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  source: SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'
  baseDir?: string
  loadedFrom: LoadedFrom
  hooks?: unknown
  executionContext?: 'inline' | 'fork'
  agent?: string
  paths?: string[]
  effort?: string
  shell?: string
}): Command {
  return {
    type: 'prompt',
    name: skillName,
    description,
    hasUserSpecifiedDescription,
    allowedTools,
    argumentHint,
    argNames: argumentNames?.length > 0 ? argumentNames : undefined,
    whenToUse,
    version,
    model,
    disableModelInvocation,
    userInvocable,
    context: executionContext,
    agent,
    effort,
    paths,
    source,
    contentLength: markdownContent.length,
    isHidden: !userInvocable,
    progressMessage: 'running',
    hooks,
    skillRoot: baseDir,
    loadedFrom,
    getPromptForCommand: async (args: string) => {
      let finalContent = baseDir
        ? `Base directory for this skill: ${baseDir}\n\n${markdownContent}`
        : markdownContent

      // 替换 $ARGUMENTS
      if (args) {
        finalContent = finalContent.replace(/\$ARGUMENTS/g, args)
      }

      // 替换 ${CLAUDE_SKILL_DIR}
      if (baseDir) {
        const skillDir = process.platform === 'win32'
          ? baseDir.replace(/\\/g, '/')
          : baseDir
        finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)
      }

      return [{ type: 'text' as const, text: finalContent }]
    },
  }
}

// ==================== 技能加载器 ====================

interface SkillWithPath {
  skill: Command
  filePath: string
}

async function loadSkillsFromSkillsDir(
  basePath: string,
  source: SettingSource,
): Promise<SkillWithPath[]> {
  if (!existsSync(basePath)) {
    return []
  }

  let entries
  try {
    entries = await readdir(basePath, { withFileTypes: true })
  } catch {
    return []
  }

  const results: SkillWithPath[] = []

  for (const entry of entries) {
    try {
      // 只支持目录格式: skill-name/SKILL.md
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue
      }

      const skillDirPath = join(basePath, entry.name)
      const skillFilePath = join(skillDirPath, 'SKILL.md')

      if (!existsSync(skillFilePath)) {
        continue
      }

      const content = await readFile(skillFilePath, 'utf-8')
      const { frontmatter, content: markdownContent } = parseFrontmatter(content, skillFilePath)

      const skillName = entry.name
      const description = extractDescription(frontmatter.description, markdownContent, skillName)
      const allowedTools = parseAllowedTools(frontmatter['allowed-tools'])
      const whenToUse = frontmatter.when_to_use as string | undefined
      const model = frontmatter.model as string | undefined
      const effort = frontmatter.effort as string | undefined
      const paths = parseSkillPaths(frontmatter.paths)
      const shell = frontmatter.shell as string | undefined

      // 解析user-invocable
      let userInvocable = true
      const userInvocableValue = frontmatter['user-invocable']
      if (userInvocableValue !== undefined && userInvocableValue !== null) {
        const strValue = String(userInvocableValue)
        userInvocable = strValue !== 'false' && strValue !== '0'
      }

      // 解析context
      let context: 'inline' | 'fork' | undefined
      if (frontmatter.context === 'fork') {
        context = 'fork'
      }

      results.push({
        skill: createSkillCommand({
          skillName,
          displayName: frontmatter.name as string | undefined,
          description,
          hasUserSpecifiedDescription: !!frontmatter.description,
          markdownContent,
          allowedTools,
          argumentHint: frontmatter['argument-hint'] as string | undefined,
          whenToUse,
          version: frontmatter.version as string | undefined,
          model,
          disableModelInvocation: frontmatter['hide-from-slash-command-tool'] === 'true',
          userInvocable,
          source,
          baseDir: skillDirPath,
          loadedFrom: 'skills',
          hooks: frontmatter.hooks,
          executionContext: context,
          agent: frontmatter.agent as string | undefined,
          paths,
          effort,
          shell,
        }),
        filePath: skillFilePath,
      })
    } catch (error) {
      console.warn(`Failed to load skill from ${entry.name}:`, error)
    }
  }

  return results
}

/**
 * 从描述提取description
 */
function extractDescription(
  frontmatterDesc: string | null | undefined,
  markdownContent: string,
  fallbackName: string,
): string {
  if (frontmatterDesc) {
    return frontmatterDesc
  }

  // 从markdown内容提取第一行作为描述
  const lines = markdownContent.split('\n').filter(l => l.trim())
  if (lines.length > 0) {
    const firstLine = lines[0].replace(/^#+\s*/, '').trim()
    if (firstLine) {
      return firstLine
    }
  }

  return `Skill: ${fallbackName}`
}

// ==================== 路径工具 ====================

function buildNamespace(targetDir: string, baseDir: string): string {
  const normalizedBaseDir = baseDir.endsWith('/') || baseDir.endsWith('\\')
    ? baseDir.slice(0, -1)
    : baseDir

  if (targetDir === normalizedBaseDir) {
    return ''
  }

  const relativePath = targetDir.slice(normalizedBaseDir.length + 1)
  return relativePath ? relativePath.split(/[/\\]/).join(':') : ''
}

function getCommandName(filePath: string, baseDir: string): string {
  const skillDir = dirname(filePath)
  const parentOfSkillDir = dirname(skillDir)
  const commandBaseName = basename(skillDir)

  const namespace = buildNamespace(parentOfSkillDir, baseDir)
  return namespace ? `${namespace}:${commandBaseName}` : commandBaseName
}

/**
 * 从legacy /commands/目录加载技能
 */
async function loadSkillsFromCommandsDir(
  cwd: string,
): Promise<SkillWithPath[]> {
  const commandsPath = resolve(cwd, '.claude', 'commands')

  if (!existsSync(commandsPath)) {
    return []
  }

  const results: SkillWithPath[] = []

  async function scanDir(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // 检查是否有 SKILL.md
          const skillMdPath = join(fullPath, 'SKILL.md')
          if (existsSync(skillMdPath)) {
            try {
              const content = await readFile(skillMdPath, 'utf-8')
              const { frontmatter, content: markdownContent } = parseFrontmatter(content, skillMdPath)

              const cmdName = getCommandName(skillMdPath, resolve(cwd, '.claude', 'commands'))
              const description = extractDescription(
                frontmatter.description as string | null | undefined,
                markdownContent,
                cmdName,
              )

              results.push({
                skill: createSkillCommand({
                  skillName: cmdName,
                  description,
                  hasUserSpecifiedDescription: !!frontmatter.description,
                  markdownContent,
                  allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
                  whenToUse: frontmatter.when_to_use as string | undefined,
                  version: frontmatter.version as string | undefined,
                  model: frontmatter.model as string | undefined,
                  source: 'projectSettings',
                  baseDir: fullPath,
                  loadedFrom: 'commands_DEPRECATED',
                }),
                filePath: skillMdPath,
              })
            } catch (error) {
              console.warn(`Failed to load command skill from ${skillMdPath}:`, error)
            }
          } else {
            // 递归扫描子目录
            await scanDir(fullPath)
          }
        } else if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') {
          // 单文件格式
          try {
            const content = await readFile(fullPath, 'utf-8')
            const { frontmatter, content: markdownContent } = parseFrontmatter(content, fullPath)

            const cmdName = basename(dirname(fullPath))
            const description = extractDescription(
              frontmatter.description as string | null | undefined,
              markdownContent,
              cmdName,
            )

            results.push({
              skill: createSkillCommand({
                skillName: cmdName,
                description,
                hasUserSpecifiedDescription: !!frontmatter.description,
                markdownContent,
                source: 'projectSettings',
                loadedFrom: 'commands_DEPRECATED',
              }),
              filePath: fullPath,
            })
          } catch (error) {
            console.warn(`Failed to load command skill from ${fullPath}:`, error)
          }
        }
      }
    } catch {
      // 忽略扫描错误
    }
  }

  await scanDir(commandsPath)
  return results
}

// ==================== 缓存和状态 ====================

// 动态技能目录缓存
const dynamicSkillDirs = new Set<string>()
const dynamicSkills = new Map<string, Command>()

// 条件技能（paths过滤）
const conditionalSkills = new Map<string, Command>()
const activatedConditionalSkillNames = new Set<string>()

// ==================== 核心导出函数 ====================

/**
 * 获取项目中的技能命令列表
 * 搜索路径：
 * - .claude/skills (项目级别)
 * - 用户HOME目录下的.claude/skills
 */
export async function getSkillDirCommands(cwd: string): Promise<Command[]> {
  const userHomeDir = getUserHomeDir()
  const projectSkillsDir = resolve(cwd, '.claude', 'skills')
  const userSkillsDir = userHomeDir ? resolve(userHomeDir, '.claude', 'skills') : null

  // 并行加载所有路径的技能
  const [projectSkills, userSkills] = await Promise.all([
    loadSkillsFromSkillsDir(projectSkillsDir, 'projectSettings'),
    userSkillsDir ? loadSkillsFromSkillsDir(userSkillsDir, 'userSettings') : Promise.resolve([]),
  ])

  // 合并所有技能
  const allSkills = [...projectSkills, ...userSkills]

  // 分离条件技能和普通技能
  const unconditionalSkills: Command[] = []
  for (const { skill } of allSkills) {
    if (skill.paths && skill.paths.length > 0 && !activatedConditionalSkillNames.has(skill.name)) {
      conditionalSkills.set(skill.name, skill)
    } else {
      unconditionalSkills.push(skill)
    }
  }

  // 添加动态技能
  const dynamicSkillsList = Array.from(dynamicSkills.values())

  console.log(`[skillsAdapter] Loaded ${unconditionalSkills.length} skills, ${conditionalSkills.size} conditional, ${dynamicSkillsList.length} dynamic`)

  return [...unconditionalSkills, ...dynamicSkillsList]
}

/**
 * 发现技能目录（用于动态加载）
 */
export async function discoverSkillDirsForPaths(
  filePaths: string[],
  cwd: string,
): Promise<string[]> {
  const resolvedCwd = cwd.replace(/[/\\]+$/, '')
  const newDirs: string[] = []

  for (const filePath of filePaths) {
    let currentDir = dirname(filePath)

    while (currentDir.startsWith(resolvedCwd) && currentDir !== resolvedCwd) {
      const skillDir = join(currentDir, '.claude', 'skills')

      if (!dynamicSkillDirs.has(skillDir)) {
        dynamicSkillDirs.add(skillDir)
        try {
          const stats = await stat(skillDir)
          if (stats.isDirectory()) {
            newDirs.push(skillDir)
          }
        } catch {
          // 目录不存在
        }
      }

      // 移动到父目录
      const parent = dirname(currentDir)
      if (parent === currentDir) break
      currentDir = parent
    }
  }

  return newDirs.sort((a, b) => b.split(/[/\\]/).length - a.split(/[/\\]/).length)
}

/**
 * 添加技能目录
 */
export async function addSkillDirectories(dirs: string[]): Promise<void> {
  for (const dir of dirs) {
    const skills = await loadSkillsFromSkillsDir(dir, 'projectSettings')
    for (const { skill } of skills) {
      if (skill.type === 'prompt') {
        dynamicSkills.set(skill.name, skill)
      }
    }
  }

  if (dirs.length > 0) {
    console.log(`[skillsAdapter] Added ${dirs.length} skill directories, total dynamic skills: ${dynamicSkills.size}`)
  }
}

/**
 * 激活匹配路径的条件技能
 */
export function activateConditionalSkillsForPaths(
  filePaths: string[],
  cwd: string,
): string[] {
  const activated: string[] = []

  for (const [name, skill] of conditionalSkills) {
    if (skill.type !== 'prompt' || !skill.paths || skill.paths.length === 0) {
      continue
    }

    for (const filePath of filePaths) {
      let relativePath = filePath
      if (isAbsolute(filePath)) {
        relativePath = filePath.slice(cwd.length).replace(/^[/\\]/, '')
      }

      // 简单的glob匹配
      for (const pattern of skill.paths) {
        if (matchGlobPattern(relativePath, pattern)) {
          dynamicSkills.set(name, skill)
          conditionalSkills.delete(name)
          activatedConditionalSkillNames.add(name)
          activated.push(name)
          console.log(`[skillsAdapter] Activated conditional skill: ${name}`)
          break
        }
      }

      if (activated.includes(name)) break
    }
  }

  return activated
}

/**
 * 简单的glob模式匹配
 */
function matchGlobPattern(path: string, pattern: string): boolean {
  // 移除开头的/
  path = path.replace(/^[/\\]/, '')

  // 转换glob模式为正则
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
    .replace(/\?/g, '.')

  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i')
    return regex.test(path)
  } catch {
    return false
  }
}

/**
 * 获取动态技能
 */
export function getDynamicSkills(): Command[] {
  return Array.from(dynamicSkills.values())
}

/**
 * 获取条件技能数量
 */
export function getConditionalSkillCount(): number {
  return conditionalSkills.size
}

/**
 * 清除所有技能缓存
 */
export function clearSkillCaches(): void {
  dynamicSkillDirs.clear()
  dynamicSkills.clear()
  conditionalSkills.clear()
  activatedConditionalSkillNames.clear()
}

/**
 * 查找技能命令
 */
export function findCommand(name: string, commands: Command[]): Command | undefined {
  // 支持带/前缀
  const normalizedName = name.startsWith('/') ? name.slice(1) : name

  return commands.find(cmd => {
    if (cmd.name === normalizedName) return true
    // 检查aliases
    if ('aliases' in cmd && Array.isArray(cmd.aliases)) {
      return cmd.aliases.includes(normalizedName)
    }
    return false
  })
}

// ==================== 辅助函数 ====================

function getUserHomeDir(): string | null {
  if (process.platform === 'win32') {
    return process.env.USERPROFILE || process.env.HOME || null
  }
  return process.env.HOME || null
}

/**
 * 获取技能路径（用于配置）
 */
export function getSkillsPath(
  source: SettingSource | 'plugin',
): string {
  const homeDir = getUserHomeDir()
  switch (source) {
    case 'userSettings':
      return homeDir ? join(homeDir, '.claude', 'skills') : ''
    case 'projectSettings':
      return '.claude/skills'
    default:
      return ''
  }
}

/**
 * 执行技能内容中的shell命令 (!`command` 语法)
 */
export async function executeShellInContent(
  content: string,
  context: SkillExecutionContext,
): Promise<string> {
  // 查找所有 !`command` 模式
  const shellCommandRegex = /!`([^`]+)`/g
  let match
  let result = content

  while ((match = shellCommandRegex.exec(content)) !== null) {
    const command = match[1]
    try {
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      const { stdout, stderr } = await execAsync(command, {
        cwd: context.projectRoot,
        timeout: 30000,
      })

      const output = stdout + (stderr ? `\n[stderr]${stderr}` : '')
      result = result.replace(match[0], output)
    } catch (error) {
      result = result.replace(match[0], `[Shell command failed: ${error}]`)
    }
  }

  return result
}
