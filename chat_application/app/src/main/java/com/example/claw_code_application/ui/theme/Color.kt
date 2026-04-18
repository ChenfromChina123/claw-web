package com.example.claw_code_application.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * 应用颜色定义
 * 基于Vue前端的暗色主题配色方案（Indigo紫色系）
 */
object Color {
    // 主色调 - Indigo紫色系
    val Primary = Color(0xFF6366F1)           // #6366f1
    val PrimaryLight = Color(0xFF818CF8)      // 浅紫色
    val PrimaryDark = Color(0xFF4F46E5)       // 深紫色

    // 背景色 - 暗色主题
    val BackgroundDark = Color(0xFF0F0F19)     // 主背景 #0F0F19
    val SurfaceDark = Color(0xFF1A1A2E)        // 卡片背景 #1A1A2E
    val SurfaceLight = Color(0xFF252540)       // 次级表面 #252540

    // 文字颜色
    val TextPrimary = Color(0xFFF8FAFC)        // 主文字 #F8FAFC
    val TextSecondary = Color(0xFF94A3B8)      // 次要文字 #94A3B8

    // 状态颜色
    val Success = Color(0xFF10B981)            // 成功绿色
    val Error = Color(0xFFEF4444)              // 错误红色
    val Warning = Color(0xFFF59E0B)            // 警告橙色
    val Info = Color(0xFF3B82F6)               // 信息蓝色

    // 用户消息气泡
    val UserBubbleBackground = Color(0xFF6366F1)   // 用户消息背景（紫色）
    val AssistantBubbleBackground = Color(0xFF252540) // AI消息背景（深灰）

    // 边框颜色
    val Border = Color(0xFF374151)             // 边框灰色

    // 分割线
    val Divider = Color(0xFF2D2D44)            // 分割线颜色
}
