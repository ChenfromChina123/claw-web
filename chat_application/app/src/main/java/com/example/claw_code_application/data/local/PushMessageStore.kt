package com.example.claw_code_application.data.local

import android.content.Context
import android.content.SharedPreferences
import com.example.claw_code_application.data.api.models.AgentPushMessage
import com.example.claw_code_application.data.api.models.PushCategory
import com.example.claw_code_application.data.api.models.PushPriority
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Agent 推送消息本地存储管理器
 * 
 * 管理推送消息的本地存储、已读状态、未读计数等
 */
class PushMessageStore private constructor(context: Context) {

    companion object {
        private const val TAG = "PushMessageStore"
        private const val PREFS_NAME = "push_messages_prefs"
        private const val KEY_MESSAGES = "push_messages"
        private const val KEY_READ_IDS = "read_message_ids"
        private const val MAX_STORED_MESSAGES = 100

        @Volatile
        private var instance: PushMessageStore? = null

        fun getInstance(context: Context): PushMessageStore {
            return instance ?: synchronized(this) {
                instance ?: PushMessageStore(context.applicationContext).also {
                    instance = it
                }
            }
        }
    }

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    // 消息列表状态流
    private val _messages = MutableStateFlow<List<PushMessageItem>>(emptyList())
    val messages: StateFlow<List<PushMessageItem>> = _messages.asStateFlow()

    // 未读计数状态流
    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    init {
        loadMessages()
    }

    /**
     * 添加新消息
     * @param message Agent推送消息
     */
    fun addMessage(message: AgentPushMessage) {
        val currentList = _messages.value.toMutableList()
        
        // 检查是否已存在相同ID的消息
        if (currentList.any { it.message.id == message.id }) {
            return
        }

        val item = PushMessageItem(
            message = message,
            isRead = false,
            receivedAt = System.currentTimeMillis()
        )

        currentList.add(0, item) // 添加到开头
        
        // 限制存储数量
        if (currentList.size > MAX_STORED_MESSAGES) {
            currentList.removeAt(currentList.size - 1)
        }

        _messages.value = currentList
        saveMessages()
        updateUnreadCount()
    }

    /**
     * 标记消息为已读
     * @param messageId 消息ID
     */
    fun markAsRead(messageId: String) {
        val currentList = _messages.value.toMutableList()
        val index = currentList.indexOfFirst { it.message.id == messageId }
        
        if (index != -1) {
            currentList[index] = currentList[index].copy(isRead = true)
            _messages.value = currentList
            saveMessages()
            updateUnreadCount()
        }
    }

    /**
     * 标记所有消息为已读
     */
    fun markAllAsRead() {
        val currentList = _messages.value.map { it.copy(isRead = true) }
        _messages.value = currentList
        saveMessages()
        updateUnreadCount()
    }

    /**
     * 删除消息
     * @param messageId 消息ID
     */
    fun deleteMessage(messageId: String) {
        val currentList = _messages.value.filter { it.message.id != messageId }
        _messages.value = currentList
        saveMessages()
        updateUnreadCount()
    }

    /**
     * 清空所有消息
     */
    fun clearAllMessages() {
        _messages.value = emptyList()
        saveMessages()
        updateUnreadCount()
    }

    /**
     * 获取未读消息数量
     */
    fun getUnreadCount(): Int {
        return _messages.value.count { !it.isRead }
    }

    /**
     * 检查是否有未读消息
     */
    fun hasUnreadMessages(): Boolean {
        return _messages.value.any { !it.isRead }
    }

    /**
     * 按类别获取消息
     */
    fun getMessagesByCategory(category: PushCategory): List<PushMessageItem> {
        return _messages.value.filter { it.message.category == category }
    }

    /**
     * 更新未读计数
     */
    private fun updateUnreadCount() {
        _unreadCount.value = getUnreadCount()
    }

    /**
     * 保存消息到本地
     */
    private fun saveMessages() {
        try {
            val messagesJson = json.encodeToString(_messages.value)
            prefs.edit().putString(KEY_MESSAGES, messagesJson).apply()
        } catch (e: Exception) {
            android.util.Log.e(TAG, "保存消息失败", e)
        }
    }

    /**
     * 从本地加载消息
     */
    private fun loadMessages() {
        try {
            val messagesJson = prefs.getString(KEY_MESSAGES, null)
            if (messagesJson != null) {
                val loadedMessages = json.decodeFromString<List<PushMessageItem>>(messagesJson)
                _messages.value = loadedMessages
                updateUnreadCount()
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "加载消息失败", e)
        }
    }
}

/**
 * 推送消息项（包含本地状态）
 */
@kotlinx.serialization.Serializable
data class PushMessageItem(
    val message: AgentPushMessage,
    val isRead: Boolean = false,
    val receivedAt: Long = System.currentTimeMillis()
)
