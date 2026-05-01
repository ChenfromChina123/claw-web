package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 技能定义 - 对应后端 SkillDefinition
 */
@Immutable
@Serializable
data class SkillDefinition(
    val id: String,
    val name: String,
    val description: String,
    val category: SkillCategory,
    val tags: List<String> = emptyList(),
    val version: String = "1.0.0",
    val author: String? = null,
    val filePath: String = "",
    val content: String? = null,
    val isEnabled: Boolean = true,
    val loadedAt: Long? = null
)

/**
 * 技能类别 - 对应后端 SkillCategory
 */
@Immutable
@Serializable
data class SkillCategory(
    val id: String,
    val name: String,
    val icon: String? = null,
    val description: String? = null
)

/**
 * 技能列表响应 - 对应后端 SkillListResponse
 */
@Immutable
@Serializable
data class SkillListResponse(
    val skills: List<SkillDefinition> = emptyList(),
    val categories: List<SkillCategory> = emptyList(),
    val total: Int = 0,
    val stats: SkillStats? = null
)

/**
 * 技能统计信息
 */
@Immutable
@Serializable
data class SkillStats(
    val totalSkills: Int = 0,
    val enabledSkills: Int = 0,
    val disabledSkills: Int = 0,
    val byCategory: Map<String, Int> = emptyMap()
)
