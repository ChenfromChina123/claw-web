package com.example.claw_code_application

import android.app.Application
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
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

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

        lateinit var apiService: ApiService
            private set

        lateinit var tokenManager: TokenManager
            private set

        lateinit var userManager: UserManager
            private set

        lateinit var authRepository: AuthRepository
            private set

        lateinit var chatRepository: ChatRepository
            private set

        lateinit var sessionLocalStore: SessionLocalStore
            private set

        lateinit var themePreferencesStore: ThemePreferencesStore
            private set

        val webSocketManager = WebSocketManager()

        lateinit var appDatabase: AppDatabase
            private set

        lateinit var cachedChatRepository: CachedChatRepository
            private set

        lateinit var notificationManager: NotificationManager
            private set
    }

    override fun onCreate() {
        super.onCreate()
        INSTANCE = this

        // 初始化通知渠道（Android 8.0+ 必需）
        notificationManager = NotificationManager(this)
        notificationManager.createNotificationChannels()
        Logger.i(TAG, "通知渠道初始化完成")

        NetworkConfig.init(this)
        Logger.i(TAG, "网络配置初始化完成: ${NetworkConfig.getBaseUrl()}")

        Logger.i(TAG, "应用启动...")

        tokenManager = TokenManager.getInstance(this)
        Logger.d(TAG, "TokenManager初始化完成")

        userManager = UserManager.getInstance(this)
        Logger.d(TAG, "UserManager初始化完成")

        apiService = createApiService()
        Logger.d(TAG, "ApiService初始化完成")

        authRepository = AuthRepository(apiService, tokenManager, userManager)
        chatRepository = ChatRepository(apiService, tokenManager)

        sessionLocalStore = SessionLocalStore.getInstance(this)
        Logger.d(TAG, "SessionLocalStore初始化完成")

        themePreferencesStore = ThemePreferencesStore.getInstance(this)
        Logger.d(TAG, "ThemePreferencesStore初始化完成")

        appDatabase = AppDatabase.getInstance(this)
        Logger.d(TAG, "AppDatabase初始化完成")

        cachedChatRepository = CachedChatRepository(
            apiService = apiService,
            tokenManager = tokenManager,
            sessionDao = appDatabase.sessionDao(),
            messageDao = appDatabase.messageDao(),
            toolCallDao = appDatabase.toolCallDao()
        )
        Logger.d(TAG, "CachedChatRepository初始化完成")

        Logger.d(TAG, "Repository初始化完成")

        Logger.i(TAG, "应用初始化完成")
    }

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