/**
 * 查询数据库中的消息内容 - 检查 IDE 标记
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
       WHERE session_id = '5c81c1b7-2f07-457d-9991-b1d152b2eef3'
       AND role = 'user'
       ORDER BY created_at DESC LIMIT 5`
    )

    console.log('=== 用户消息详细内容 ===\n')
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
