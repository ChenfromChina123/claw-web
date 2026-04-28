package com.example.claw_code_application.data.local.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.AutoMigration

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
    version = 1,
    exportSchema = true,
    autoMigrations = [
        AutoMigration(from = 1, to = 2, spec = AppDatabase.AutoMigrationSpec::class)
    ]
)
abstract class AppDatabase : RoomDatabase() {

    /**
     * 自动迁移策略说明
     * 当Entity结构变化时（如添加/删除字段），Room会自动推断迁移
     * 如果自动推断失败，会使用fallbackToDestructiveMigration()
     */
    @androidx.room.DeleteDatabase(database = AppDatabase::class)
    annotation class AutoMigrationSpec

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
