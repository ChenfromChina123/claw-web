/**
 * 在Claude工作时防止macOS进入睡眠状态。
 *
 * 使用内置的 `caffeinate` 命令创建电源断言以防止空闲睡眠。
 * 这可以在API请求和工具执行期间保持Mac处于唤醒状态，
 * 这样长时间运行的操作就不会被中断。
 *
 * caffeinate进程以超时方式生成，并定期重新启动。
 * 这提供了自我修复行为：如果Node进程被SIGKILL杀死
 * （不运行清理处理程序），孤立的caffeinate将在超时到期后自动退出。
 *
 * 仅在macOS上运行 - 在其他平台上为空操作。
 */
import { type ChildProcess, spawn } from 'child_process'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { logForDebugging } from '../utils/debug.js'

// Caffeinate timeout in seconds. Process auto-exits after this duration.
// We restart it before expiry to maintain continuous sleep prevention.
const CAFFEINATE_TIMEOUT_SECONDS = 300 // 5 minutes

// Restart interval - restart caffeinate before it expires.
// Use 4 minutes to give plenty of buffer before the 5 minute timeout.
const RESTART_INTERVAL_MS = 4 * 60 * 1000

let caffeinateProcess: ChildProcess | null = null
let restartInterval: ReturnType<typeof setInterval> | null = null
let refCount = 0
let cleanupRegistered = false

/**
 * 增加引用计数并在需要时开始阻止睡眠。
 * 在开始应该保持Mac唤醒的工作时调用此函数。
 */
export function startPreventSleep(): void {
  refCount++

  if (refCount === 1) {
    spawnCaffeinate()
    startRestartInterval()
  }
}

/**
 * Decrement the reference count and allow sleep if no more work is pending.
 * Call this when work completes.
 */
export function stopPreventSleep(): void {
  if (refCount > 0) {
    refCount--
  }

  if (refCount === 0) {
    stopRestartInterval()
    killCaffeinate()
  }
}

/**
 * 强制停止阻止睡眠，不管引用计数如何。
 * 在退出时用于清理。
 */
export function forceStopPreventSleep(): void {
  refCount = 0
  stopRestartInterval()
  killCaffeinate()
}

function startRestartInterval(): void {
  // 仅在macOS上运行
  if (process.platform !== 'darwin') {
    return
  }

  // 已在运行
  if (restartInterval !== null) {
    return
  }

  restartInterval = setInterval(() => {
    // 仅在仍然需要阻止睡眠时重启
    if (refCount > 0) {
      logForDebugging('Restarting caffeinate to maintain sleep prevention')
      killCaffeinate()
      spawnCaffeinate()
    }
  }, RESTART_INTERVAL_MS)

  // 不要让interval保持Node进程存活
  restartInterval.unref()
}

function stopRestartInterval(): void {
  if (restartInterval !== null) {
    clearInterval(restartInterval)
    restartInterval = null
  }
}

function spawnCaffeinate(): void {
  // 仅在macOS上运行
  if (process.platform !== 'darwin') {
    return
  }

  // 已在运行
  if (caffeinateProcess !== null) {
    return
  }

  // 首次使用时注册清理以确保退出时杀死caffeinate
  if (!cleanupRegistered) {
    cleanupRegistered = true
    registerCleanup(async () => {
      forceStopPreventSleep()
    })
  }

  try {
    // -i: 创建断言以防止空闲睡眠
    //     这是最不激进的选项 - 显示器仍然可以睡眠
    // -t: 超时秒数 - caffeinate在此时间后自动退出
    //     这提供了自我修复，以防Node被SIGKILL杀死
    caffeinateProcess = spawn(
      'caffeinate',
      ['-i', '-t', String(CAFFEINATE_TIMEOUT_SECONDS)],
      {
        stdio: 'ignore',
      },
    )

    // 不要让caffeinate保持Node进程存活
    caffeinateProcess.unref()

    const thisProc = caffeinateProcess
    caffeinateProcess.on('error', err => {
      logForDebugging(`caffeinate spawn error: ${err.message}`)
      if (caffeinateProcess === thisProc) caffeinateProcess = null
    })

    caffeinateProcess.on('exit', () => {
      if (caffeinateProcess === thisProc) caffeinateProcess = null
    })

    logForDebugging('Started caffeinate to prevent sleep')
  } catch {
    // 静默失败 - caffeinate不可用或生成失败
    caffeinateProcess = null
  }
}

function killCaffeinate(): void {
  if (caffeinateProcess !== null) {
    const proc = caffeinateProcess
    caffeinateProcess = null
    try {
      // SIGKILL用于立即终止 - SIGTERM可能会延迟
      proc.kill('SIGKILL')
      logForDebugging('Stopped caffeinate, allowing sleep')
    } catch {
      // 进程可能已经退出
    }
  }
}
