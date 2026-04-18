package com.example.claw_code_application

import android.app.Application
import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.repository.AuthRepository
import com.example.claw_code_application.data.repository.ChatRepository
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Application类
 * 初始化全局单例对象（Retrofit、Repository等）
 */
class ClawCodeApplication : Application() {

    /** 单例实例 */
    companion object {
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
        
        // 初始化TokenManager
        tokenManager = TokenManager.getInstance(this)
        
        // 初始化Retrofit和API服务
        apiService = createApiService()
        
        // 初始化Repository
        authRepository = AuthRepository(apiService, tokenManager)
        chatRepository = ChatRepository(apiService, tokenManager)
    }

    /**
     * 创建Retrofit API服务实例
     */
    private fun createApiService(): ApiService {
        // 配置OkHttp客户端
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .addHeader("Content-Type", "application/json")
                    .build()
                chain.proceed(request)
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
