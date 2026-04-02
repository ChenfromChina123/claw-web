/**
 * 会话和代理ID的品牌类型定义。
 * 这些类型用于在编译时防止意外混淆会话ID和代理ID。
 */

/**
 * 会话ID，唯一标识一个Claude Code会话。
 * 由 getSessionId() 返回。
 */
export type SessionId = string & { readonly __brand: 'SessionId' }

/**
 * 代理ID，唯一标识一个会话中的子代理。
 * 由 createAgentId() 返回。
 * 当存在时，表示上下文是一个子代理（不是主会话）。
 */
export type AgentId = string & { readonly __brand: 'AgentId' }

/**
 * 将原始字符串转换为SessionId。
 * 应尽量使用 getSessionId() - 此函数应谨慎使用。
 */
export function asSessionId(id: string): SessionId {
  return id as SessionId
}

/**
 * 将原始字符串转换为AgentId。
 * 应尽量使用 createAgentId() - 此函数应谨慎使用。
 */
export function asAgentId(id: string): AgentId {
  return id as AgentId
}

const AGENT_ID_PATTERN = /^a(?:.+-)?[0-9a-f]{16}$/

/**
 * 验证并将字符串品牌化为AgentId。
 * 匹配 createAgentId() 生成格式：`a` + 可选的 `<label>-` + 16个十六进制字符。
 * 如果字符串不匹配则返回null（例如队友名称、团队寻址）。
 */
export function toAgentId(s: string): AgentId | null {
  return AGENT_ID_PATTERN.test(s) ? (s as AgentId) : null
}
