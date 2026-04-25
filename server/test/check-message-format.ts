/**
 * 检查消息存储格式和 stripIdeUserDisplayLayer 处理
 */
import { getPool } from '/app/src/db/mysql'

const IDE_USER_DISPLAY_START = '<!--haha-ide-display-->'
const IDE_USER_DISPLAY_END = '<!--/haha-ide-display-->'

function stripIdeUserDisplayLayer(stored: string): string {
  if (typeof stored !== 'string') return stored
  const normalized = stored.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const startIdx = normalized.indexOf(IDE_USER_DISPLAY_START)
  if (startIdx === -1) {
    console.log('  -> 没有找到 IDE_USER_DISPLAY_START，使用原始内容')
    return stored
  }

  const contentStart = startIdx + IDE_USER_DISPLAY_START.length
  const endIdx = normalized.indexOf(IDE_USER_DISPLAY_END, contentStart)
  if (endIdx === -1) {
    console.log('  -> 没有找到 IDE_USER_DISPLAY_END，使用原始内容')
    return stored
  }

  const afterEnd = endIdx + IDE_USER_DISPLAY_END.length
  const result = normalized.slice(afterEnd).trim()
  console.log(`  -> 提取结果: "${result}"`)
  return result
}

async function main() {
  const pool = getPool()
  if (!pool) {
    console.error('数据库连接池未初始化')
    process.exit(1)
  }

  try {
    const [rows] = await (pool as any).execute(
      `SELECT id, session_id, role, content, created_at
       FROM messages
       WHERE session_id = '5c81c1b7-2f07-457d-9991-b1d152b2eef3'
       AND role = 'user'
       ORDER BY created_at DESC LIMIT 3`
    )

    console.log('=== 检查消息处理结果 ===\n')
    for (const row of rows as any[]) {
      console.log(`[${row.role}] ${row.created_at}`)
      console.log(`原始内容:`, JSON.stringify(row.content))
      console.log('处理过程:')
      const result = stripIdeUserDisplayLayer(row.content)
      console.log(`最终结果: "${result}"`)
      console.log('---')
    }
  } catch (error) {
    console.error('查询失败:', error)
  } finally {
    (pool as any).pool?.end?.()
  }
}

main()
