package com.example.claw_code_application.data.local.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * 应用数据库
 * 包含会话、消息、工具调用等数据的本地缓存
 */
@Database(
    entities = [
        SessionEntity::class,
        MessageEntity::class,
        ToolCallEntity::class
    ],
    version = 4,  // 升级版本号：同步Server端大文本支持
    exportSchema = false  // 禁用schema导出，简化构建
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun sessionDao(): SessionDao
    abstract fun messageDao(): MessageDao
    abstract fun toolCallDao(): ToolCallDao

    companion object {
        private const val DATABASE_NAME = "claw_chat_database"

        @Volatile
        private var INSTANCE: AppDatabase? = null

        /**
         * 获取数据库实例（单例模式）
         */
        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }

        private fun buildDatabase(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                DATABASE_NAME
            )
                .fallbackToDestructiveMigration()
                .build()
        }

        /**
         * 关闭数据库实例（用于测试）
         */
        fun closeDatabase() {
            synchronized(this) {
                INSTANCE?.close()
                INSTANCE = null
            }
        }
    }
}
