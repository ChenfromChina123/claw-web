/**
 * 检查内存中的消息内容
 */
import { getSessionManager } from '/app/src/services/sessionManager'

async function main() {
  const sessionManager = getSessionManager()
  const sessionId = '5c81c1b7-2f07-457d-9991-b1d152b2eef3'

  const session = sessionManager.getInMemorySession(sessionId)
  if (!session) {
    console.error('会话不存在于内存中')
    process.exit(1)
  }

  console.log('=== 内存中的消息 ===\n')
  console.log(`共 ${session.messages.length} 条消息\n`)
  for (let i = 0; i < session.messages.length; i++) {
    const msg = session.messages[i]
    console.log(`[${i}] [${msg.role}] ${msg.createdAt}`)
    console.log(`内容:`, JSON.stringify(msg.content))
    console.log('---')
  }
}

main()
