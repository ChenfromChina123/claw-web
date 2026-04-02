import type {
  AssistantMessage,
  AttachmentMessage,
  SystemMessage,
  UserMessage,
} from 'src/types/message.js'

/**
 * 使用 sourceToolUseID 标记用户消息，使其保持瞬态直到工具解析完成。
 * 这可以防止"正在运行"消息在 UI 中重复显示。
 */
export function tagMessagesWithToolUseID(
  messages: (UserMessage | AttachmentMessage | SystemMessage)[],
  toolUseID: string | undefined,
): (UserMessage | AttachmentMessage | SystemMessage)[] {
  if (!toolUseID) {
    return messages
  }
  return messages.map(m => {
    if (m.type === 'user') {
      return { ...m, sourceToolUseID: toolUseID }
    }
    return m
  })
}

/**
 * 从父消息中提取给定工具名称的工具使用 ID。
 */
export function getToolUseIDFromParentMessage(
  parentMessage: AssistantMessage,
  toolName: string,
): string | undefined {
  const toolUseBlock = parentMessage.message.content.find(
    block => block.type === 'tool_use' && block.name === toolName,
  )
  return toolUseBlock && toolUseBlock.type === 'tool_use'
    ? toolUseBlock.id
    : undefined
}
