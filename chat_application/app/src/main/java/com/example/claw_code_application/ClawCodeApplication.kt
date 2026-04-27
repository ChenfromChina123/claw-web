package com.example.claw_code_application

import android.app.Application
import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.AuthRepository
import com.example.claw_code_application.data.repository.ChatRepository
import com.example.claw_code_application.util.NetworkConfig
import com.example.claw_code_application.util.Logger
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Application类
 * 初始化全局单例对象（Retrofit、Repository等）
 */
class ClawCodeApplication : Application() {

    companion object {
        private const val TAG = "ClawCodeApplication"
        
        @Volatile
        private var INSTANCE: ClawCodeApplication? = null
        
        fun getInstance(): ClawCodeApplication {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ClawCodeApplication().also { INSTANCE = it }
            }
        }
        
        /** Retrofit API服务实例 */
        lateinit var apiService: ApiService
            private set
            
        /** Token管理器 */
        lateinit var tokenManager: TokenManager
            private set
            
        /** 认证仓库 */
        lateinit var authRepository: AuthRepository
            private set
            
        /** 聊天仓库 */
        lateinit var chatRepository: ChatRepository
            private set
    }

    override fun onCreate() {
        super.onCreate()
        INSTANCE = this
        
        // 初始化网络配置（必须在最前面）
        NetworkConfig.init(this)
        Logger.i(TAG, "网络配置初始化完成: ${NetworkConfig.getBaseUrl()}")
        
        Logger.i(TAG, "应用启动...")
        
        // 初始化TokenManager
        tokenManager = TokenManager.getInstance(this)
        Logger.d(TAG, "TokenManager初始化完成")
        
        // 初始化Retrofit和API服务
        apiService = createApiService()
        Logger.d(TAG, "ApiService初始化完成")
        
        // 初始化Repository
        authRepository = AuthRepository(apiService, tokenManager)
        chatRepository = ChatRepository(apiService, tokenManager)
        Logger.d(TAG, "Repository初始化完成")
        
        Logger.i(TAG, "应用初始化完成")
    }

    /**
     * 创建 Retrofit API 服务实例
     * 使用 NetworkConfig 动态获取 Base URL，支持模拟器和真机
     */
    private fun createApiService(): ApiService {
        val baseUrl = NetworkConfig.getBaseUrl()
        Logger.d(TAG, "创建 ApiService, BaseURL: $baseUrl")
        
        // 创建 HTTP 日志拦截器
        val loggingInterceptor = HttpLoggingInterceptor { message ->
            Logger.d("OkHttp", message)
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        
        // 配置 OkHttp 客户端
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(Constants.CONNECT_TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(Constants.READ_TIMEOUT, TimeUnit.SECONDS)
            .writeTimeout(Constants.WRITE_TIMEOUT, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)
            .addInterceptor { chain ->
                val request = chain.request()
                Logger.d(TAG, "发送请求: ${request.method} ${request.url}")
                
                val newRequest = request.newBuilder()
                    .addHeader("Content-Type", "application/json")
                    .build()
                
                val response = chain.proceed(newRequest)
                Logger.d(TAG, "收到响应: HTTP ${response.code} for ${request.url}")
                response
            }
            .build()

        // 创建 Retrofit 实例
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        return retrofit.create(ApiService::class.java)
    }
}
