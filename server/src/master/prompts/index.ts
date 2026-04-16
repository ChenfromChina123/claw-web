/**
 * Prompts 模块统一导出
 *
 * 导出所有提示词相关的模块和工具函数：
 * - systemPromptCore: 核心系统提示（Doing Tasks, Actions, Tone & Style）
 * - efficiencyPrompts: 效率规则（Output Efficiency, Proactive, Fork）
 * - agentToolPrompt: Agent 工具使用指导
 * - teamPrompt: 团队协作通信规则
 * - contextBuilder: 环境信息构建和上下文管理
 */

// 核心系统提示词
export {
  getSimpleIntroSection,
  getSimpleSystemSection,
  getSimpleDoingTasksSection,
  getActionsSection,
  getSimpleToneAndStyleSection,
  getSessionSpecificGuidanceSection,
  getSystemRemindersSection,
  DEFAULT_AGENT_PROMPT,
  AGENT_ENV_NOTES,
  prependBullets,
} from './systemPromptCore'

// 效率提示词
export {
  OUTPUT_EFFICIENCY_SECTION,
  NUMERIC_LENGTH_ANCHORS,
  OUTPUT_EFFICIENCY_SECTION_ANT,
  PROACTIVE_SECTION,
  FORK_BOILERPLATE_TAG,
  FORK_BOILERPLATE,
  FORK_DIRECTIVE_PREFIX,
  EXPLORE_AGENT_EFFICIENCY,
  VERIFICATION_AGENT_RULES,
  BRIEF_PROACTIVE_SECTION,
  getOutputEfficiencySection,
  isNumericLengthAnchorsEnabled,
  buildChildMessage,
} from './efficiencyPrompts'

// Agent 工具提示词
export {
  formatAgentLine,
  getAgentToolPrompt,
  getAgentToolGuidance,
} from './agentToolPrompt'

// 团队协作提示词
export {
  TEAMMATE_SYSTEM_PROMPT_ADDENDUM,
  TEAM_LEAD_SYSTEM_PROMPT_ADDENDUM,
  MULTI_AGENT_ORCHESTRATION_GUIDE,
  TEAM_COMMUNICATION_BEST_PRACTICES,
  getTeamPromptByRole,
} from './teamPrompt'

// 上下文构建器
export {
  buildEnvInfo,
  buildSimpleEnvInfo,
  enhanceSystemPromptWithEnvDetails,
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,
  buildCompleteSystemPrompt,
} from './contextBuilder'
