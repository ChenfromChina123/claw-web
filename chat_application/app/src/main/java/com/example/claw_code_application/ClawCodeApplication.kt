package com.example.claw_code_application

import android.app.Application
import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.AuthRepository
import com.example.claw_code_application.data.repository.ChatRepository
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
     * 创建Retrofit API服务实例
     */
    private fun createApiService(): ApiService {
        Logger.d(TAG, "创建ApiService, BaseURL: ${com.example.claw_code_application.util.Constants.BASE_URL}")
        
        // 创建HTTP日志拦截器
        val loggingInterceptor = HttpLoggingInterceptor { message ->
            Logger.d("OkHttp", message)
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        
        // 配置OkHttp客户端
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)  // 添加日志拦截器
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

        // 创建Retrofit实例
        val retrofit = Retrofit.Builder()
            .baseUrl(com.example.claw_code_application.util.Constants.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        return retrofit.create(ApiService::class.java)
    }
}
