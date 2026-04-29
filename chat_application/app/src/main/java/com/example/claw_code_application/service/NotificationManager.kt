package com.example.claw_code_application.service

import android.app.NotificationChannel
import android.app.NotificationManager as SystemNotificationManager
import android.app.PendingIntent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.claw_code_application.MainActivity
import com.example.claw_code_application.R
import com.example.claw_code_application.data.api.models.AgentPushMessage
import com.example.claw_code_application.data.api.models.CredentialInfo
import com.example.claw_code_application.data.api.models.PushCategory
import com.example.claw_code_application.data.api.models.PushPriority
import com.example.claw_code_application.data.api.models.isExpired
import com.example.claw_code_application.data.api.models.toCredentialInfo
import com.example.claw_code_application.data.api.models.toImportance

/**
 * 系统通知管理器
 *
 * 负责在 Android 系统通知栏显示 Agent 推送的消息
 * 支持显示隐私信息、账号密码等敏感数据
 */
class NotificationManager(private val context: Context) {

    companion object {
        private const val TAG = "NotificationManager"

        // 通知渠道 ID
        const val CHANNEL_ID_CREDENTIALS = "agent_credentials"
        const val CHANNEL_ID_NOTIFICATIONS = "agent_notifications"
        const val CHANNEL_ID_ALERTS = "agent_alerts"
        const val CHANNEL_ID_INFO = "agent_info"

        // 通知 ID 基础值
        private const val NOTIFICATION_ID_BASE = 1000
        private var notificationIdCounter = 0

        /**
         * 获取下一个通知 ID
         */
        private fun getNextNotificationId(): Int {
            return NOTIFICATION_ID_BASE + notificationIdCounter++
        }
    }

    private val systemNotificationManager: SystemNotificationManager by lazy {
        context.getSystemService(Context.NOTIFICATION_SERVICE) as SystemNotificationManager
    }

    private val clipboardManager: ClipboardManager by lazy {
        context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    }

    /**
     * 创建通知渠道（Android 8.0+ 必需）
     * 应在应用启动时调用
     */
    fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        // 凭证信息渠道 - 高重要性，敏感信息
        val credentialChannel = NotificationChannel(
            CHANNEL_ID_CREDENTIALS,
            "账号凭证",
            SystemNotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Agent 推送的账号密码等敏感信息"
            enableLights(true)
            enableVibration(true)
            setShowBadge(true)
        }

        // 普通通知渠道
        val notificationChannel = NotificationChannel(
            CHANNEL_ID_NOTIFICATIONS,
            "Agent 通知",
            SystemNotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Agent 发送的一般通知消息"
            enableLights(true)
            enableVibration(false)
        }

        // 警告渠道 - 高重要性
        val alertChannel = NotificationChannel(
            CHANNEL_ID_ALERTS,
            "警告信息",
            SystemNotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "需要关注的警告信息"
            enableLights(true)
            enableVibration(true)
        }

        // 信息渠道 - 低重要性
        val infoChannel = NotificationChannel(
            CHANNEL_ID_INFO,
            "一般信息",
            SystemNotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "一般性信息提示"
            enableLights(false)
            enableVibration(false)
        }

        // 注册所有渠道
        systemNotificationManager.createNotificationChannels(
            listOf(credentialChannel, notificationChannel, alertChannel, infoChannel)
        )

        Log.i(TAG, "Notification channels created")
    }

    /**
     * 显示 Agent 推送通知
     * 根据消息类别自动选择合适的通知样式
     *
     * @param pushMessage 推送消息
     */
    fun showAgentPushNotification(pushMessage: AgentPushMessage) {
        // 检查消息是否已过期
        if (pushMessage.isExpired()) {
            Log.w(TAG, "Push message expired, ignoring: ${pushMessage.id}")
            return
        }

        when (pushMessage.category) {
            PushCategory.CREDENTIAL -> {
                val credentialInfo = pushMessage.toCredentialInfo()
                if (credentialInfo != null) {
                    showCredentialNotification(credentialInfo)
                } else {
                    showGenericNotification(pushMessage)
                }
            }
            PushCategory.ALERT -> showAlertNotification(pushMessage)
            PushCategory.INFO -> showInfoNotification(pushMessage)
            PushCategory.NOTIFICATION -> showGenericNotification(pushMessage)
        }
    }

    /**
     * 显示凭证信息通知（敏感数据）
     * 使用大文本样式，支持复制操作
     *
     * @param credentialInfo 凭证信息
     */
    fun showCredentialNotification(credentialInfo: CredentialInfo) {
        val notificationId = getNextNotificationId()

        // 创建打开应用的 Intent
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("credential_id", credentialInfo.id)
            putExtra("show_credential", true)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 创建复制用户名操作
        val copyUsernameIntent = Intent(context, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_COPY_USERNAME
            putExtra("username", credentialInfo.username)
            putExtra("notification_id", notificationId)
        }
        val copyUsernamePendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId * 10,
            copyUsernameIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 创建复制密码操作
        val copyPasswordIntent = Intent(context, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_COPY_PASSWORD
            putExtra("password", credentialInfo.password)
            putExtra("notification_id", notificationId)
        }
        val copyPasswordPendingIntent = PendingIntent.getBroadcast(
            context,
            notificationId * 10 + 1,
            copyPasswordIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // 构建通知内容
        val contentText = buildString {
            append("用户名: ${credentialInfo.username}")
            credentialInfo.service?.let { append("\n服务: $it") }
            credentialInfo.note?.let { append("\n备注: $it") }
        }

        // 构建大文本样式
        val bigTextStyle = NotificationCompat.BigTextStyle()
            .setBigContentTitle(credentialInfo.title)
            .bigText(contentText)

        val notification = NotificationCompat.Builder(context, CHANNEL_ID_CREDENTIALS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(credentialInfo.title)
            .setContentText("点击复制用户名或密码")
            .setStyle(bigTextStyle)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET) // 在锁屏上隐藏内容
            .addAction(R.drawable.ic_copy, "复制用户名", copyUsernamePendingIntent)
            .addAction(R.drawable.ic_copy, "复制密码", copyPasswordPendingIntent)
            .build()

        systemNotificationManager.notify(notificationId, notification)

        Log.i(TAG, "Credential notification shown: ${credentialInfo.id}")
    }

    /**
     * 显示警告通知
     *
     * @param pushMessage 推送消息
     */
    private fun showAlertNotification(pushMessage: AgentPushMessage) {
        val notificationId = getNextNotificationId()

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("session_id", pushMessage.sessionId)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID_ALERTS)
            .setSmallIcon(R.drawable.ic_warning)
            .setContentTitle(pushMessage.title)
            .setContentText(pushMessage.content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(pushMessage.content))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setVibrate(longArrayOf(0, 500, 200, 500))
            .build()

        systemNotificationManager.notify(notificationId, notification)
    }

    /**
     * 显示一般信息通知
     *
     * @param pushMessage 推送消息
     */
    private fun showInfoNotification(pushMessage: AgentPushMessage) {
        val notificationId = getNextNotificationId()

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("session_id", pushMessage.sessionId)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID_INFO)
            .setSmallIcon(R.drawable.ic_info)
            .setContentTitle(pushMessage.title)
            .setContentText(pushMessage.content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(pushMessage.content))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        systemNotificationManager.notify(notificationId, notification)
    }

    /**
     * 显示通用通知
     *
     * @param pushMessage 推送消息
     */
    private fun showGenericNotification(pushMessage: AgentPushMessage) {
        val notificationId = getNextNotificationId()

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("session_id", pushMessage.sessionId)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val channelId = when (pushMessage.priority) {
            PushPriority.HIGH, PushPriority.URGENT -> CHANNEL_ID_NOTIFICATIONS
            else -> CHANNEL_ID_INFO
        }

        val priority = when (pushMessage.priority) {
            PushPriority.HIGH, PushPriority.URGENT -> NotificationCompat.PRIORITY_HIGH
            PushPriority.NORMAL -> NotificationCompat.PRIORITY_DEFAULT
            PushPriority.LOW -> NotificationCompat.PRIORITY_LOW
        }

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(pushMessage.title)
            .setContentText(pushMessage.content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(pushMessage.content))
            .setPriority(priority)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        systemNotificationManager.notify(notificationId, notification)
    }

    /**
     * 复制文本到剪贴板
     *
     * @param label 标签
     * @param text 文本内容
     */
    fun copyToClipboard(label: String, text: String) {
        val clip = ClipData.newPlainText(label, text)
        clipboardManager.setPrimaryClip(clip)
        Log.i(TAG, "Copied to clipboard: $label")
    }

    /**
     * 取消指定通知
     *
     * @param notificationId 通知ID
     */
    fun cancelNotification(notificationId: Int) {
        systemNotificationManager.cancel(notificationId)
    }

    /**
     * 取消所有通知
     */
    fun cancelAllNotifications() {
        systemNotificationManager.cancelAll()
    }
}

/**
 * 通知操作接收器
 * 处理通知上的按钮点击操作
 */
class NotificationActionReceiver : android.content.BroadcastReceiver() {
    companion object {
        const val ACTION_COPY_USERNAME = "com.example.claw_code_application.COPY_USERNAME"
        const val ACTION_COPY_PASSWORD = "com.example.claw_code_application.COPY_PASSWORD"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val notificationManager = NotificationManager(context)

        when (intent.action) {
            ACTION_COPY_USERNAME -> {
                val username = intent.getStringExtra("username") ?: return
                notificationManager.copyToClipboard("用户名", username)
                // 取消通知
                val notificationId = intent.getIntExtra("notification_id", -1)
                if (notificationId != -1) {
                    notificationManager.cancelNotification(notificationId)
                }
            }
            ACTION_COPY_PASSWORD -> {
                val password = intent.getStringExtra("password") ?: return
                notificationManager.copyToClipboard("密码", password)
                // 取消通知
                val notificationId = intent.getIntExtra("notification_id", -1)
                if (notificationId != -1) {
                    notificationManager.cancelNotification(notificationId)
                }
            }
        }
    }
}
