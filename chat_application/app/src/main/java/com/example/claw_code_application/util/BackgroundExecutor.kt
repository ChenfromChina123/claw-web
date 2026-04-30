package com.example.claw_code_application.util

import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.*
import java.util.concurrent.Executors
import kotlin.coroutines.CoroutineContext

/**
 * 后台任务执行器
 *
 * 微信架构思想：绝对不让主线程阻塞
 * - IO、计算、解析全扔子线程
 * - 主线程只做UI渲染
 *
 * 提供统一的线程池管理，避免随意创建线程造成的性能问题
 */
object BackgroundExecutor {

    private const val TAG = "BackgroundExecutor"

    /**
     * IO密集型任务线程池
     * 用于网络请求、文件读写、数据库操作
     * 线程数较多（CPU核心数 * 2）
     */
    private val ioExecutor = Executors.newFixedThreadPool(
        Runtime.getRuntime().availableProcessors() * 2
    ) { runnable ->
        Thread(runnable, "IO-Worker-${System.currentTimeMillis() % 10000}").apply {
            isDaemon = true
        }
    }

    /**
     * 计算密集型任务线程池
     * 用于JSON解析、数据转换、复杂计算
     * 线程数等于CPU核心数
     */
    private val computationExecutor = Executors.newFixedThreadPool(
        Runtime.getRuntime().availableProcessors()
    ) { runnable ->
        Thread(runnable, "Compute-Worker-${System.currentTimeMillis() % 10000}").apply {
            isDaemon = true
        }
    }

    /**
     * 单线程顺序执行器
     * 用于需要顺序执行的任务（如日志写入）
     */
    private val singleExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "Single-Worker").apply {
            isDaemon = true
        }
    }

    // 协程调度器
    val ioDispatcher: CoroutineContext = ioExecutor.asCoroutineDispatcher()
    val computationDispatcher: CoroutineContext = computationExecutor.asCoroutineDispatcher()
    val singleDispatcher: CoroutineContext = singleExecutor.asCoroutineDispatcher()

    /**
     * 在IO线程执行协程任务
     * 适用于：网络请求、数据库操作、文件读写
     *
     * @param block 执行的任务块
     * @return Job 可用于取消任务
     */
    fun executeOnIO(block: suspend CoroutineScope.() -> Unit): Job {
        return CoroutineScope(ioDispatcher).launch {
            try {
                block()
            } catch (e: Exception) {
                Logger.e(TAG, "IO任务执行异常", e)
            }
        }
    }

    /**
     * 在计算线程执行协程任务
     * 适用于：JSON解析、数据转换、复杂计算
     *
     * @param block 执行的任务块
     * @return Job 可用于取消任务
     */
    fun executeOnComputation(block: suspend CoroutineScope.() -> Unit): Job {
        return CoroutineScope(computationDispatcher).launch {
            try {
                block()
            } catch (e: Exception) {
                Logger.e(TAG, "计算任务执行异常", e)
            }
        }
    }

    /**
     * 在单线程顺序执行协程任务
     * 适用于：需要顺序执行的任务（如日志写入）
     *
     * @param block 执行的任务块
     * @return Job 可用于取消任务
     */
    fun executeSequentially(block: suspend CoroutineScope.() -> Unit): Job {
        return CoroutineScope(singleDispatcher).launch {
            try {
                block()
            } catch (e: Exception) {
                Logger.e(TAG, "顺序任务执行异常", e)
            }
        }
    }

    /**
     * 在IO线程执行带返回值的协程任务
     * 适用于：需要返回结果的网络请求、数据库查询
     *
     * @param block 执行的任务块
     * @return Deferred 可用于获取结果
     */
    fun <T> asyncOnIO(block: suspend CoroutineScope.() -> T): Deferred<T> {
        return CoroutineScope(ioDispatcher).async {
            block()
        }
    }

    /**
     * 在计算线程执行带返回值的协程任务
     * 适用于：需要返回结果的JSON解析、数据转换
     *
     * @param block 执行的任务块
     * @return Deferred 可用于获取结果
     */
    fun <T> asyncOnComputation(block: suspend CoroutineScope.() -> T): Deferred<T> {
        return CoroutineScope(computationDispatcher).async {
            block()
        }
    }

    /**
     * 延迟执行IO任务
     *
     * @param delayMillis 延迟毫秒数
     * @param block 执行的任务块
     * @return Job 可用于取消任务
     */
    fun executeOnIODelayed(delayMillis: Long, block: suspend CoroutineScope.() -> Unit): Job {
        return CoroutineScope(ioDispatcher).launch {
            delay(delayMillis)
            try {
                block()
            } catch (e: Exception) {
                Logger.e(TAG, "延迟IO任务执行异常", e)
            }
        }
    }

    /**
     * 批量执行IO任务并等待全部完成
     *
     * @param tasks 任务列表
     * @return Job 可用于取消任务
     */
    fun executeBatchOnIO(vararg tasks: suspend CoroutineScope.() -> Unit): Job {
        return CoroutineScope(ioDispatcher).launch {
            tasks.map { task ->
                async {
                    try {
                        task()
                    } catch (e: Exception) {
                        Logger.e(TAG, "批量IO任务执行异常", e)
                    }
                }
            }.awaitAll()
        }
    }

    /**
     * 关闭所有线程池
     * 在应用退出时调用
     */
    fun shutdown() {
        ioExecutor.shutdown()
        computationExecutor.shutdown()
        singleExecutor.shutdown()
    }
}

/**
 * 主线程保护工具类
 * 提供便捷的方法确保操作在正确的线程执行
 */
object MainThreadProtector {

    private const val TAG = "MainThreadProtector"

    /**
     * 检查当前是否在主线程
     */
    fun isMainThread(): Boolean {
        return Looper.getMainLooper().thread == Thread.currentThread()
    }

    /**
     * 确保代码块在主线程执行
     * 如果当前已在主线程，直接执行；否则切换到主线程
     *
     * @param block 执行的任务块
     */
    fun runOnMainThread(block: () -> Unit) {
        if (isMainThread()) {
            block()
        } else {
            Handler(Looper.getMainLooper()).post(block)
        }
    }

    /**
     * 确保代码块不在主线程执行
     * 如果当前在主线程，切换到IO线程；否则直接执行
     *
     * @param block 执行的任务块
     * @return Job 可用于取消任务
     */
    fun runOffMainThread(block: suspend CoroutineScope.() -> Unit): Job {
        return if (isMainThread()) {
            BackgroundExecutor.executeOnIO(block)
        } else {
            CoroutineScope(Dispatchers.Default).launch {
                block()
            }
        }
    }

    /**
     * 检查并警告主线程IO操作
     * 在开发调试时使用，检测主线程IO操作
     *
     * @param operationName 操作名称
     */
    fun warnIfMainThread(operationName: String) {
        if (isMainThread()) {
            Logger.w(TAG, "警告: $operationName 在主线程执行，建议移到后台线程")
        }
    }
}