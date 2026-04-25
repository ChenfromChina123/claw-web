/**
 * 检查会话消息详情
 */
import { getSessionManager } from '/app/src/services/sessionManager'

async function main() {
  const sessionManager = getSessionManager()
  const sessionId = '66d55d05-6399-47b0-aca1-e7a8550c02a2'

  const session = sessionManager.getInMemorySession(sessionId)
  if (!session) {
    console.error('会话不存在于内存中')
    process.exit(1)
  }

  console.log('=== 会话详情 ===')
  console.log(`Session ID: ${sessionId}`)
  console.log(`Title: ${session.session.title}`)
  console.log(`Messages count: ${session.messages.length}`)
  console.log(`Dirty: ${session.dirty}`)
  console.log('')

  console.log('=== 最新 3 条消息 ===')
  const recentMessages = session.messages.slice(-3)
  for (let i = 0; i < recentMessages.length; i++) {
    const msg = recentMessages[i]
    console.log(`\n[${i}] [${msg.role}]`)
    console.log(`    ID: ${msg.id}`)
    console.log(`    Content: "${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}"`)
    console.log(`    Content length: ${typeof msg.content === 'string' ? msg.content.length : 'N/A'}`)
    console.log(`    Created: ${msg.createdAt}`)
  }
}

main()
