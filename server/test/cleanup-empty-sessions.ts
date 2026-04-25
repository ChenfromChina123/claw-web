/**
 * 清理用户的空会话，只保留最新的一个
 */
import { getPool } from '/app/src/db/mysql'

async function main() {
  const pool = getPool()
  if (!pool) {
    console.error('数据库连接池未初始化')
    process.exit(1)
  }

  try {
    const userId = 'e3b0b583-b8f3-4a9e-b6ab-2b3bf9ff21d0' // 替换为实际用户ID

    // 查找该用户的所有会话及其消息数量
    const [sessions] = await (pool as any).execute(`
      SELECT s.id, s.title, s.created_at,
             (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id AND m.role = 'user') as message_count
      FROM sessions s
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `, [userId]) as [any[], any]

    console.log(`用户 ${userId} 的会话总数: ${sessions.length}`)

    // 找出空会话（消息数量为0）
    const emptySessions = sessions.filter((s: any) => s.message_count === 0)
    console.log(`空会话数量: ${emptySessions.length}`)
    
    for (const s of emptySessions) {
      console.log(`  - ${s.id}: "${s.title}" (${s.created_at})`)
    }

    if (emptySessions.length > 1) {
      // 保留最新的，删除其他的
      const toKeep = emptySessions[0]
      const toDelete = emptySessions.slice(1)

      console.log(`\n将保留最新的空会话: ${toKeep.id}`)
      console.log(`将删除 ${toDelete.length} 个旧空会话:`)

      for (const s of toDelete) {
        console.log(`  - 删除: ${s.id}: "${s.title}"`)
        
        // 删除会话关联的消息
        await (pool as any).execute('DELETE FROM messages WHERE session_id = ?', [s.id])
        
        // 删除会话
        await (pool as any).execute('DELETE FROM sessions WHERE id = ?', [s.id])
        
        console.log(`    已删除`)
      }

      console.log(`\n清理完成！`)
    } else if (emptySessions.length === 1) {
      console.log(`\n只有1个空会话，无需清理`)
    } else {
      console.log(`\n没有空会话`)
    }

  } catch (error) {
    console.error('操作失败:', error)
  } finally {
    (pool as any).pool?.end?.()
  }
}

main()
