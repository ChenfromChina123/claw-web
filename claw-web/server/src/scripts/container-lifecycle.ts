/**
 * CLAW-WEB 容器生命周期管理器
 *
 * 功能：
 * 1. 孤儿容器回收 - 清理长时间空闲的用户容器
 * 2. 热池维护 - 保持热池在最小数量
 * 3. 空间清理 - 删除过期的工作空间目录
 *
 * 运行方式：
 *   bun run src/scripts/container-lifecycle.ts
 *
 * 配置环境变量：
 *   IDLE_TIMEOUT_MS          - 用户容器空闲超时（默认: 30分钟）
 *   WORKSPACE_RETENTION_DAYS - 工作空间保留天数（默认: 30天）
 *   CHECK_INTERVAL_MS        - 检查间隔（默认: 5分钟）
 */

import { execSync, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const CONFIG = {
  idleTimeoutMs: parseInt(process.env.IDLE_TIMEOUT_MS || String(30 * 60 * 1000), 10),  // 30 分钟
  workspaceRetentionDays: parseInt(process.env.WORKSPACE_RETENTION_DAYS || '30', 10),    // 30 天
  checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || String(5 * 60 * 1000), 10), // 5 分钟
  hostWorkspacePath: process.env.HOST_WORKSPACE_PATH || '/data/claws/workspaces',
}

interface ContainerInfo {
  name: string
  status: string
  created: Date
}

interface WorkspaceInfo {
  path: string
  userId: string
  lastModified: Date
  sizeMB: number
}

/**
 * 获取所有用户容器
 */
async function getUserContainers(): Promise<ContainerInfo[]> {
  try {
    const output = execSync(
      'docker ps --filter "name=claude-user-" --format "{{.Names}}|{{.Status}}|{{.CreatedAt}}"',
      { encoding: 'utf8' }
    )
    return output.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, status, created] = line.split('|')
        return {
          name,
          status,
          created: new Date(created),
        }
      })
  } catch {
    return []
  }
}

/**
 * 获取热池容器
 */
async function getWarmContainers(): Promise<ContainerInfo[]> {
  try {
    const output = execSync(
      'docker ps --filter "name=claude-worker-warm-" --format "{{.Names}}|{{.Status}}|{{.CreatedAt}}"',
      { encoding: 'utf8' }
    )
    return output.trim().split('\n')
      .filter(Boolean)
      .map(line => {
        const [name, status, created] = line.split('|')
        return {
          name,
          status,
          created: new Date(created),
        }
      })
  } catch {
    return []
  }
}

/**
 * 获取工作空间目录列表
 */
async function getWorkspaces(): Promise<WorkspaceInfo[]> {
  try {
    const workspaces: WorkspaceInfo[] = []

    // 遍历用户目录
    const userDirs = await execAsync(`ls -la ${CONFIG.hostWorkspacePath} 2>/dev/null | grep "^d" | awk '{print $9}'`, { encoding: 'utf8' })
    const users = userDirs.stdout.trim().split('\n').filter(Boolean)

    for (const userId of users) {
      const userPath = `${CONFIG.hostWorkspacePath}/${userId}`

      try {
        // 获取该用户的所有工作空间
        const sessionDirs = await execAsync(`ls -la ${userPath} 2>/dev/null | grep "^d" | awk '{print $9}'`, { encoding: 'utf8' })
        const sessions = sessionDirs.stdout.trim().split('\n').filter(Boolean)

        for (const sessionId of sessions) {
          const sessionPath = `${userPath}/${sessionId}`

          try {
            // 获取最后修改时间和大小
            const statOutput = await execAsync(`stat -c "%Y %s" ${sessionPath} 2>/dev/null || echo "0 0"`, { encoding: 'utf8' })
            const [timestamp, size] = statOutput.stdout.trim().split(' ').map(Number)

            workspaces.push({
              path: sessionPath,
              userId,
              lastModified: new Date(timestamp * 1000),
              sizeMB: Math.round(size / (1024 * 1024)),
            })
          } catch {
            // 忽略无效目录
          }
        }
      } catch {
        // 忽略无效用户目录
      }
    }

    return workspaces
  } catch {
    return []
  }
}

/**
 * 销毁容器
 */
async function destroyContainer(containerName: string): Promise<boolean> {
  try {
    console.log(`[Lifecycle] 销毁容器: ${containerName}`)
    execSync(`docker stop -t 5 ${containerName}`, { stdio: 'pipe' })
    execSync(`docker rm ${containerName}`, { stdio: 'pipe' })
    return true
  } catch (error) {
    console.error(`[Lifecycle] 销毁容器失败: ${containerName}`, error)
    return false
  }
}

/**
 * 清理过期工作空间
 */
async function cleanupExpiredWorkspaces(): Promise<number> {
  const now = new Date()
  const cutoffDate = new Date(now.getTime() - CONFIG.workspaceRetentionDays * 24 * 60 * 60 * 1000)

  const workspaces = await getWorkspaces()
  let cleanedCount = 0
  let cleanedSize = 0

  for (const workspace of workspaces) {
    if (workspace.lastModified < cutoffDate) {
      try {
        console.log(`[Lifecycle] 清理过期工作空间: ${workspace.path}`)
        console.log(`  最后修改: ${workspace.lastModified.toISOString()}`)
        console.log(`  大小: ${workspace.sizeMB} MB`)

        // 删除目录
        await execAsync(`rm -rf ${workspace.path}`)
        cleanedCount++
        cleanedSize += workspace.sizeMB
      } catch (error) {
        console.error(`[Lifecycle] 删除工作空间失败: ${workspace.path}`, error)
      }
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Lifecycle] 已清理 ${cleanedCount} 个过期工作空间，释放 ${cleanedSize} MB`)
  }

  return cleanedCount
}

/**
 * 回收孤儿容器（用户已断开连接）
 */
async function reclaimOrphanContainers(): Promise<number> {
  const now = new Date()
  const cutoffTime = new Date(now.getTime() - CONFIG.idleTimeoutMs)

  const userContainers = await getUserContainers()
  let reclaimedCount = 0

  for (const container of userContainers) {
    // 检查容器是否空闲超过阈值
    if (container.created < cutoffTime) {
      console.log(`[Lifecycle] 发现孤儿容器: ${container.name}`)
      console.log(`  创建时间: ${container.created.toISOString()}`)
      console.log(`  空闲时间: ${Math.round((now.getTime() - container.created.getTime()) / 60000)} 分钟`)

      const destroyed = await destroyContainer(container.name)
      if (destroyed) {
        reclaimedCount++
      }
    }
  }

  if (reclaimedCount > 0) {
    console.log(`[Lifecycle] 已回收 ${reclaimedCount} 个孤儿容器`)
  }

  return reclaimedCount
}

/**
 * 清理超时热池容器
 */
async function cleanupExpiredWarmContainers(): Promise<number> {
  const now = new Date()
  // 热池容器更激进地回收（15分钟）
  const warmCutoff = new Date(now.getTime() - 15 * 60 * 1000)

  const warmContainers = await getWarmContainers()
  let cleanedCount = 0

  for (const container of warmContainers) {
    if (container.created < warmCutoff) {
      console.log(`[Lifecycle] 清理过期热池容器: ${container.name}`)
      const destroyed = await destroyContainer(container.name)
      if (destroyed) {
        cleanedCount++
      }
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Lifecycle] 已清理 ${cleanedCount} 个过期热池容器`)
  }

  return cleanedCount
}

/**
 * 获取系统统计
 */
async function getSystemStats(): Promise<{
  userContainers: number
  warmContainers: number
  workspaces: number
  totalSizeMB: number
}> {
  const userContainers = await getUserContainers()
  const warmContainers = await getWarmContainers()
  const workspaces = await getWorkspaces()

  const totalSizeMB = workspaces.reduce((sum, w) => sum + w.sizeMB, 0)

  return {
    userContainers: userContainers.length,
    warmContainers: warmContainers.length,
    workspaces: workspaces.length,
    totalSizeMB,
  }
}

/**
 * 打印系统状态
 */
async function printSystemStatus(): Promise<void> {
  const stats = await getSystemStats()

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('系统状态')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`用户容器:  ${stats.userContainers}`)
  console.log(`热池容器:  ${stats.warmContainers}`)
  console.log(`工作空间:  ${stats.workspaces}`)
  console.log(`总大小:    ${stats.totalSizeMB} MB`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 检查磁盘空间
  try {
    const dfOutput = execSync(`df -h ${CONFIG.hostWorkspacePath} 2>/dev/null | tail -1`, { encoding: 'utf8' })
    const parts = dfOutput.trim().split(/\s+/)
    if (parts.length >= 4) {
      const usedPercent = parseInt(parts[4].replace('%', ''), 10)
      console.log(`磁盘使用:  ${parts[3]} / ${parts[1]} (${usedPercent}%)`)

      if (usedPercent >= 90) {
        console.log('⚠️  警告: 磁盘空间严重不足！')
      } else if (usedPercent >= 80) {
        console.log('⚠️  注意: 磁盘空间接近阈值')
      }
    }
  } catch {
    // 忽略
  }
}

/**
 * 单次运行（用于 cron 任务）
 */
async function runOnce(): Promise<void> {
  console.log('\n========================================')
  console.log('CLAW-WEB 容器生命周期管理')
  console.log('========================================')
  console.log(`配置:`)
  console.log(`  空闲超时: ${CONFIG.idleTimeoutMs / 60000} 分钟`)
  console.log(`  保留天数: ${CONFIG.workspaceRetentionDays} 天`)
  console.log(`  检查间隔: ${CONFIG.checkIntervalMs / 60000} 分钟`)
  console.log(`  工作空间: ${CONFIG.hostWorkspacePath}`)

  await printSystemStatus()

  // 1. 回收孤儿容器
  console.log('\n[Step 1] 回收孤儿容器...')
  await reclaimOrphanContainers()

  // 2. 清理过期工作空间
  console.log('\n[Step 2] 清理过期工作空间...')
  await cleanupExpiredWorkspaces()

  // 3. 清理过期热池容器
  console.log('\n[Step 3] 清理过期热池容器...')
  await cleanupExpiredWarmContainers()

  // 最终状态
  await printSystemStatus()

  console.log('\n[Done] 生命周期管理完成')
}

/**
 * 持续运行（用于守护进程）
 */
async function runDaemon(): Promise<void> {
  console.log('启动容器生命周期守护进程...')
  console.log(`检查间隔: ${CONFIG.checkIntervalMs / 60000} 分钟`)

  while (true) {
    try {
      await runOnce()
    } catch (error) {
      console.error('[Lifecycle] 执行出错:', error)
    }

    console.log(`\n等待 ${CONFIG.checkIntervalMs / 60000} 分钟后再次检查...`)
    await new Promise(resolve => setTimeout(resolve, CONFIG.checkIntervalMs))
  }
}

/**
 * 主入口
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const mode = args[0] || 'once'

  if (mode === 'daemon') {
    await runDaemon()
  } else {
    await runOnce()
  }
}

main().catch(error => {
  console.error('生命周期管理执行失败:', error)
  process.exit(1)
})
