package com.example.claw_code_application.util

import android.util.Log

/**
 * 应用日志工具类
 * 统一管理日志输出，方便调试
 */
object Logger {
    private const val DEFAULT_TAG = "ClawApp"
    
    // 日志级别控制（发布时可关闭）
    private const val DEBUG_ENABLED = true
    private const val INFO_ENABLED = true
    private const val WARN_ENABLED = true
    private const val ERROR_ENABLED = true
    
    @JvmStatic
    fun d(tag: String, message: String) {
        if (DEBUG_ENABLED) {
            Log.d("$DEFAULT_TAG-$tag", message)
        }
    }
    
    @JvmStatic
    fun d(tag: String, message: String, throwable: Throwable) {
        if (DEBUG_ENABLED) {
            Log.d("$DEFAULT_TAG-$tag", message, throwable)
        }
    }
    
    @JvmStatic
    fun i(tag: String, message: String) {
        if (INFO_ENABLED) {
            Log.i("$DEFAULT_TAG-$tag", message)
        }
    }
    
    @JvmStatic
    fun w(tag: String, message: String) {
        if (WARN_ENABLED) {
            Log.w("$DEFAULT_TAG-$tag", message)
        }
    }
    
    @JvmStatic
    fun w(tag: String, message: String, throwable: Throwable) {
        if (WARN_ENABLED) {
            Log.w("$DEFAULT_TAG-$tag", message, throwable)
        }
    }
    
    @JvmStatic
    fun e(tag: String, message: String) {
        if (ERROR_ENABLED) {
            Log.e("$DEFAULT_TAG-$tag", message)
        }
    }
    
    @JvmStatic
    fun e(tag: String, message: String, throwable: Throwable) {
        if (ERROR_ENABLED) {
            Log.e("$DEFAULT_TAG-$tag", message, throwable)
        }
    }
    
    /**
     * 打印对象信息
     */
    @JvmStatic
    fun obj(tag: String, label: String, obj: Any?) {
        if (DEBUG_ENABLED) {
            val json = when (obj) {
                null -> "null"
                is String -> obj
                else -> try {
                    com.google.gson.Gson().toJson(obj)
                } catch (e: Exception) {
                    obj.toString()
                }
            }
            Log.d("$DEFAULT_TAG-$tag", "$label: $json")
        }
    }
}
