/**
 * 环境信息和上下文构建器
 *
 * 从 claude-code-haha/src/constants/prompts.ts 移植的核心机制：
 * - 环境信息构建（工作目录、平台、Shell 等）
 * - 动态章节管理（缓存友好的提示词分段）
 * - 子代理环境增强
 * - MCP 指令集成
 */

import * as os from 'os'

/**
 * 构建环境信息字符串
 * 提供关于运行环境的详细信息
 *
 * @param cwd 当前工作目录
 * @param modelId 模型 ID（可选）
 * @param additionalWorkingDirectories 额外的工作目录（可选）
 */
export function buildEnvInfo(
  cwd: string,
  modelId?: string,
  additionalWorkingDirectories?: string[],
): string {
  const isGit = checkIfGitRepo(cwd)
  const platform = process.platform
  const shellInfo = getShellInfoLine()
  const osVersion = getOSVersion()

  const additionalDirsInfo =
    additionalWorkingDirectories && additionalWorkingDirectories.length > 0
      ? `Additional working directories: ${additionalWorkingDirectories.join(', ')}\n`
      : ''

  const envItems = [
    `Primary working directory: ${cwd}`,
    `Is a git repository: ${isGit ? 'Yes' : 'No'}`,
    additionalWorkingDirectories && additionalWorkingDirectories.length > 0
      ? `Additional working directories:`
      : null,
    additionalWorkingDirectories && additionalWorkingDirectories.length > 0
      ? additionalWorkDirectories
      : null,
    `Platform: ${platform}`,
    shellInfo,
    `OS Version: ${osVersion}`,
    modelId ? `Model: ${modelId}` : null,
  ].filter(item => item !== null)

  return [
    '# Environment',
    'You have been invoked in the following environment: ',
    ...envItems.map(item => `- ${item}`),
  ].join('\n')
}

/**
 * 构建简化的环境信息（用于子代理）
 *
 * @param modelId 模型 ID
 * @param additionalWorkingDirectories 额外工作目录
 */
export async function buildSimpleEnvInfo(
  modelId?: string,
  additionalWorkingDirectories?: string[],
): Promise<string> {
  const cwd = process.cwd()

  return `Here is useful information about the environment you are running in:
<env>
Working directory: ${cwd}
Is directory a git repo: ${checkIfGitRepo(cwd) ? 'Yes' : 'No'}
${additionalWorkingDirectories && additionalWorkingDirectories.length > 0 ? `Additional working directories: ${additionalWorkingDirectories.join(', ')}\n` : ''}Platform: ${process.platform}
${getShellInfoLine()}
OS Version: getOSVersion()}
${modelId ? `You are powered by the model ${modelId}.` : ''}
</env>`
}

/**
 * 增强子代理系统提示与环境详情
 *
 * @param existingSystemPrompt 现有的系统提示数组
 * @param model 模型 ID
 * @param additionalWorkingDirectories 额外工作目录
 * @param enabledToolNames 已启用的工具名称集合（可选）
 */
export async function enhanceSystemPromptWithEnvDetails(
  existingSystemPrompt: string[],
  model?: string,
  additionalWorkingDirectories?: string[],
  enabledToolNames?: ReadonlySet<string>,
): Promise<string[]> {
  const envInfo = await buildSimpleEnvInfo(model, additionalWorkingDirectories)

  return [
    ...existingSystemPrompt,
    require('../prompts/systemPromptCore').AGENT_ENV_NOTES,
    envInfo,
  ]
}

/**
 * 获取 Shell 信息行
 * 根据平台返回适当的 Shell 信息
 */
function getShellInfoLine(): string {
  const shell = process.env.SHELL || 'unknown'
  const shellName = shell.includes('zsh')
    ? 'zsh'
    : shell.includes('bash')
      ? 'bash'
      : shell

  if (process.platform === 'win32') {
    return `Shell: ${shellName} (use Unix shell syntax, not Windows — e.g., /dev/null not NUL, forward slashes in paths)`
  }
  return `Shell: ${shellName}`
}

/**
 * 获取操作系统版本信息
 */
function getOSVersion(): string {
  if (process.platform === 'win32') {
    return `${os.version()} ${os.release()}`
  }
  return `${os.type()} ${os.release()}`
}

/**
 * 检查目录是否为 Git 仓库
 * @param dirPath 目录路径
 */
function checkIfGitRepo(dirPath: string): boolean {
  try {
    const { execSync } = require('child_process')
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: dirPath,
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

/**
 * 系统提示动态边界标记
 *
 * 用于区分静态内容（可全局缓存）和动态内容（会话特定）
 * 边界之前的内容可以使用 scope: 'global' 缓存
 * 边界之后的内容包含用户/会话特定信息，不应缓存
 */
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY =
  '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'

/**
 * 构建完整的系统提示数组
 *
 * 按照优先级组装系统提示：
 * 1. 简介部分（静态，可缓存）
 * 2. 系统规则（静态，可缓存）
 * 3. 任务执行指南（静态，可缓存）
 * 4. 操作谨慎性（静态，可缓存）
 * 5. 工具使用指导（静态，可缓存）
 * 6. 语调和风格（静态，可缓存）
 * 7. === 动态边界 ===
 * 8. 会话特定指导（动态）
 * 9. 环境信息（动态）
 * 10. MCP 指令（动态）
 *
 * @param options 构建选项
 */
export async function buildCompleteSystemPrompt(options: {
  cwd?: string
  modelId?: string
  additionalWorkingDirectories?: string[]
  enabledTools?: Set<string>
  mcpInstructions?: string | null
  outputStyleConfig?: { name: string; prompt: string } | null
  languagePreference?: string | null
  useGlobalCacheScope?: boolean
}): Promise<string[]> {
  const {
    cwd = process.cwd(),
    modelId,
    additionalWorkingDirectories,
    enabledTools = new Set<string>(),
    mcpInstructions,
    outputStyleConfig,
    languagePreference,
    useGlobalCacheScope = false,
  } = options

  const {
    getSimpleIntroSection,
    getSimpleSystemSection,
    getSimpleDoingTasksSection,
    getActionsSection,
    getSimpleToneAndStyleSection,
    getSessionSpecificGuidanceSection,
  } = require('../prompts/systemPromptCore')

  // 静态部分（可缓存）
  const staticSections = [
    getSimpleIntroSection(outputStyleConfig),
    getSimpleSystemSection(),
    getSimpleDoingTasksSection(),
    getActionsSection(),
    getSimpleToneAndStyleSection(),
  ]

  // 动态部分（不可缓存）
  const dynamicSections = []

  // 会话特定指导
  const sessionGuidance = getSessionSpecificGuidanceSection(enabledTools)
  if (sessionGuidance) {
    dynamicSections.push(sessionGuidance)
  }

  // 语言偏好
  if (languagePreference) {
    dynamicSections.push(`# Language
Always respond in ${languagePreference}. Use ${languagePreference} for all explanations, comments, and communications with the user. Technical terms and code identifiers should remain in their original form.`)
  }

  // 输出样式
  if (outputStyleConfig) {
    dynamicSections.push(`# Output Style: ${outputStyleConfig.name}
${outputStyleConfig.prompt}`)
  }

  // 环境信息
  const envInfo = buildEnvInfo(cwd, modelId, additionalWorkingDirectories)
  dynamicSections.push(envInfo)

  // MCP 指令
  if (mcpInstructions) {
    dynamicSections.push(mcpInstructions)
  }

  // 组装最终结果
  if (useGlobalCacheScope) {
    return [
      ...staticSections,
      SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
      ...dynamicSections,
    ].filter(s => s !== null && s !== '')
  }

  return [...staticSections, ...dynamicSections].filter(s => s !== null && s !== '')
}
