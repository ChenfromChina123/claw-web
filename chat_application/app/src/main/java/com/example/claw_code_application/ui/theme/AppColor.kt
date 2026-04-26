package com.example.claw_code_application.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * 应用颜色定义
 * 基于原型的浅色主题配色方案（Manus风格）
 */
object AppColor {
    // 主色调 - 原型配色
    val Primary = Color(0xFF000000)           // 黑色强调色
    val PrimaryLight = Color(0xFF6366F1)       // 紫色（用于用户消息）
    val PrimaryDark = Color(0xFF4F46E5)        // 深紫色

    // 背景色 - 浅色主题
    val BackgroundDark = Color(0xFFF7F7F7)     // 主背景 #f7f7f7
    val SurfaceDark = Color(0xFFFFFFFF)         // 卡片背景 #ffffff
    val SurfaceLight = Color(0xFFF0F0F0)        // 次级表面 #f0f0f0

    // 文字颜色
    val TextPrimary = Color(0xFF1A1A1A)         // 主文字 #1a1a1a
    val TextSecondary = Color(0xFF757575)        // 次要文字 #757575

    // 状态颜色
    val Success = Color(0xFF10B981)             // 成功绿色
    val Error = Color(0xFFEF4444)               // 错误红色
    val Warning = Color(0xFFF59E0B)             // 警告橙色
    val Info = Color(0xFF3B82F6)               // 信息蓝色

    // 用户消息气泡
    val UserBubbleBackground = Color(0xFF000000)    // 用户消息背景（黑色）
    val AssistantBubbleBackground = Color(0xFFFFFFFF) // AI消息背景（白色）

    // 边框颜色
    val Border = Color(0xFFEAEAEA)              // 边框灰色

    // 分割线
    val Divider = Color(0xFFEAEAEA)             // 分割线颜色

    // 任务列表颜色
    val TaskCompleted = Color(0xFFAAAAAA)       // 已完成任务文字
    val TaskIconBorder = Color(0xFFCCCCCC)      // 任务图标边框
}
