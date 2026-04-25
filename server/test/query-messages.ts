/**
 * 查询数据库中的消息内容
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
      'SELECT id, session_id, role, LEFT(content, 300) as content_preview, created_at FROM messages ORDER BY created_at DESC LIMIT 10'
    )
    
    console.log('=== 最近 10 条消息 ===')
    for (const row of rows as any[]) {
      console.log(`\n[${row.role}] ${row.created_at}`)
      console.log(`内容: ${row.content_preview}`)
      console.log(`Session: ${row.session_id}`)
      console.log('---')
    }
  } catch (error) {
    console.error('查询失败:', error)
  } finally {
    await pool.end()
  }
}

main()
