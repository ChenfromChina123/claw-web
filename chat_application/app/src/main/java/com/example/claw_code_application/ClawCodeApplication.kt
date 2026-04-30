package com.example.claw_code_application

import android.app.Application
import androidx.room.Room
import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.api.AuthInterceptor
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.local.UserManager
import com.example.claw_code_application.data.local.SessionLocalStore
import com.example.claw_code_application.data.local.ThemePreferencesStore
import com.example.claw_code_application.data.local.db.AppDatabase
import com.example.claw_code_application.data.repository.AuthRepository
import com.example.claw_code_application.data.repository.ChatRepository
import com.example.claw_code_application.data.repository.CachedChatRepository
import com.example.claw_code_application.data.websocket.WebSocketManager
import com.example.claw_code_application.service.NotificationManager
import com.example.claw_code_application.util.Constants
import com.example.claw_code_application.util.NetworkConfig
import com.example.claw_code_application.util.Logger
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * 应用入口类
 * 采用延迟初始化策略，减轻主线程启动压力
 * 关键组件按需加载，非关键组件异步初始化
 */
class ClawCodeApplication : Application() {

    companion object {
        private const val TAG = "ClawCodeApplication"

        @Volatile
        private var INSTANCE: ClawCodeApplication? = null

        fun getInstance(): ClawCodeApplication {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: throw IllegalStateException("Application not initialized")
            }
        }

        // 核心组件 - 延迟初始化，首次使用时才创建
        val apiService: ApiService by lazy {
            INSTANCE!!.createApiService()
        }

        val tokenManager: TokenManager by lazy {
            TokenManager.getInstance(INSTANCE!!)
        }

        val userManager: UserManager by lazy {
            UserManager.getInstance(INSTANCE!!)
        }

        val authRepository: AuthRepository by lazy {
            AuthRepository(apiService, tokenManager, userManager)
        }

        val chatRepository: ChatRepository by lazy {
            ChatRepository(apiService, tokenManager)
        }

        val sessionLocalStore: SessionLocalStore by lazy {
            SessionLocalStore.getInstance(INSTANCE!!)
        }

        val themePreferencesStore: ThemePreferencesStore by lazy {
            ThemePreferencesStore.getInstance(INSTANCE!!)
        }

        val webSocketManager = WebSocketManager()

        // 数据库和缓存Repository - 延迟初始化
        val appDatabase: AppDatabase by lazy {
            buildDatabase(INSTANCE!!)
        }

        val cachedChatRepository: CachedChatRepository by lazy {
            CachedChatRepository(
                apiService = apiService,
                tokenManager = tokenManager,
                sessionDao = appDatabase.sessionDao(),
                messageDao = appDatabase.messageDao(),
                toolCallDao = appDatabase.toolCallDao()
            )
        }

        val notificationManager: NotificationManager by lazy {
            NotificationManager(INSTANCE!!)
        }

        /**
         * 构建数据库实例
         * 使用后台线程初始化，避免阻塞主线程
         */
        private fun buildDatabase(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "claw_chat_database"
            )
                .fallbackToDestructiveMigration()
                .build()
        }
    }

    // 应用级协程作用域，用于后台初始化任务
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        INSTANCE = this

        Logger.i(TAG, "应用启动...")

        // 初始化网络配置（轻量级操作）
        NetworkConfig.init(this)
        Logger.i(TAG, "网络配置初始化完成: ${NetworkConfig.getBaseUrl()}")

        // 异步初始化非关键组件
        applicationScope.launch {
            // 预初始化通知渠道
            try {
                notificationManager.createNotificationChannels()
                Logger.i(TAG, "通知渠道初始化完成")
            } catch (e: Exception) {
                Logger.e(TAG, "通知渠道初始化失败", e)
            }
        }

        // 延迟初始化日志
        Logger.d(TAG, "应用初始化完成，组件将按需加载")
    }

    /**
     * 创建ApiService实例
     * 延迟初始化，避免启动时创建不必要的网络组件
     */
    private fun createApiService(): ApiService {
        val baseUrl = NetworkConfig.getBaseUrl()
        Logger.d(TAG, "创建 ApiService, BaseURL: $baseUrl")

        val loggingInterceptor = HttpLoggingInterceptor { message ->
            Logger.d("OkHttp", message)
        }.apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
        }

        val contentType = "application/json".toMediaType()

        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(Constants.CONNECT_TIMEOUT, TimeUnit.SECONDS)
            .readTimeout(Constants.READ_TIMEOUT, TimeUnit.SECONDS)
            .writeTimeout(Constants.WRITE_TIMEOUT, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)
            .addInterceptor(AuthInterceptor(this, tokenManager))
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

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()

        return retrofit.create(ApiService::class.java)
    }
}
