export const AGENT_TOOL_NAME = 'Agent'
// 用于权限规则、钩子和恢复会话的旧版兼容名称
export const LEGACY_AGENT_TOOL_NAME = 'Task'
export const VERIFICATION_AGENT_TYPE = 'verification'

// 执行一次并返回报告的内置代理 - 父代理永远不会通过 SendMessage 继续它们
// 跳过 agentId/SendMessage/usage trailer 以节省 token（~135 chars × 34M Explore runs/week）
export const ONE_SHOT_BUILTIN_AGENT_TYPES: ReadonlySet<string> = new Set([
  'Explore',
  'Plan',
])
