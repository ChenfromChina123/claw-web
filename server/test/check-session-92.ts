/**
 * 检查特定会话的消息记录
 */
import { getPool } from '/app/src/db/mysql'

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
       WHERE session_id = '92e8ef77-3363-409f-a38b-8be30803847c'
       ORDER BY created_at ASC`
    )

    console.log('=== 会话 92e8ef77 消息记录 ===\n')
    console.log(`共 ${rows.length} 条消息\n`)
    for (const row of rows as any[]) {
      console.log(`[${row.role}] ${row.created_at}`)
      console.log(`内容:`, JSON.stringify(row.content))
      console.log('---')
    }
  } catch (error) {
    console.error('查询失败:', error)
  } finally {
    (pool as any).pool?.end?.()
  }
}

main()
