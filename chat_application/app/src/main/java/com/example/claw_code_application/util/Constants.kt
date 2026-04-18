package com.example.claw_code_application.util

/**
 * 应用常量定义
 */
object Constants {
    /** 后端服务基础URL（开发环境使用10.0.2.2访问主机） */
    const val BASE_URL = "http://10.0.2.2:3000"

    /** API超时时间（秒） */
    const val CONNECT_TIMEOUT = 30L
    const val READ_TIMEOUT = 60L
    const val WRITE_TIMEOUT = 60L

    /** DataStore名称 */
    const val PREFS_NAME = "auth_prefs"

    /** Token存储键名 */
    const val KEY_AUTH_TOKEN = "auth_token"

    /** 默认AI模型 */
    const val DEFAULT_MODEL = "qwen-plus"

    /** 默认Agent ID */
    const val DEFAULT_AGENT_ID = "default"

    /** 消息列表每页加载数量 */
    const val PAGE_SIZE = 50
}
