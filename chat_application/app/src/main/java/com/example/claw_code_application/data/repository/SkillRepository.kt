package com.example.claw_code_application.data.repository

import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.api.models.SkillDefinition
import com.example.claw_code_application.data.api.models.SkillListResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 技能数据仓库
 * 封装 Skills API 调用，提供内存缓存
 */
class SkillRepository(
    private val apiService: ApiService
) {
    companion object {
        private const val TAG = "SkillRepository"
        private const val CACHE_EXPIRY_MS = 5 * 60 * 1000L
    }

    private var cachedSkills: List<SkillDefinition>? = null
    private var cachedCategories: List<com.example.claw_code_application.data.api.models.SkillCategory>? = null
    private var cacheTimestamp: Long = 0L

    /**
     * 获取技能列表（带缓存）
     * @param category 类别过滤
     * @param query 搜索关键词
     * @param forceRefresh 是否强制刷新
     */
    suspend fun getSkills(
        category: String? = null,
        query: String? = null,
        forceRefresh: Boolean = false
    ): Result<SkillListResponse> = withContext(Dispatchers.IO) {
        try {
            if (!forceRefresh && isCacheValid() && cachedSkills != null) {
                val filtered = filterSkills(cachedSkills!!, category, query)
                return@withContext Result.Success(SkillListResponse(
                    skills = filtered,
                    categories = cachedCategories ?: emptyList(),
                    total = filtered.size
                ))
            }

            val response = apiService.listSkills(category, query)
            if (response.isSuccessful) {
                val body = response.body()
                val data = body?.data
                if (data != null) {
                    cachedSkills = data.skills
                    cachedCategories = data.categories
                    cacheTimestamp = System.currentTimeMillis()
                    return@withContext Result.Success(data)
                }
            }
            return@withContext Result.Error("获取技能列表失败: ${response.code()}")
        } catch (e: Exception) {
            return@withContext Result.Error(e.message ?: "网络错误")
        }
    }

    /**
     * 获取技能详情
     */
    suspend fun getSkillDetail(skillId: String): Result<SkillDefinition> = withContext(Dispatchers.IO) {
        try {
            val response = apiService.getSkill(skillId)
            if (response.isSuccessful) {
                val data = response.body()?.data
                if (data != null) {
                    return@withContext Result.Success(data)
                }
            }
            return@withContext Result.Error("获取技能详情失败: ${response.code()}")
        } catch (e: Exception) {
            return@withContext Result.Error(e.message ?: "网络错误")
        }
    }

    /**
     * 启用/禁用技能
     */
    suspend fun toggleSkill(skillId: String, enabled: Boolean): Result<SkillDefinition> = withContext(Dispatchers.IO) {
        try {
            val response = apiService.toggleSkill(skillId, mapOf("enabled" to enabled))
            if (response.isSuccessful) {
                val data = response.body()?.data
                if (data != null) {
                    invalidateCache()
                    return@withContext Result.Success(data)
                }
            }
            return@withContext Result.Error("切换技能状态失败: ${response.code()}")
        } catch (e: Exception) {
            return@withContext Result.Error(e.message ?: "网络错误")
        }
    }

    /**
     * 使缓存失效
     */
    fun invalidateCache() {
        cachedSkills = null
        cachedCategories = null
        cacheTimestamp = 0L
    }

    private fun isCacheValid(): Boolean {
        return System.currentTimeMillis() - cacheTimestamp < CACHE_EXPIRY_MS
    }

    private fun filterSkills(
        skills: List<SkillDefinition>,
        category: String?,
        query: String?
    ): List<SkillDefinition> {
        var result = skills
        if (category != null) {
            result = result.filter { it.category.id == category }
        }
        if (query != null) {
            val lowerQuery = query.lowercase()
            result = result.filter {
                it.name.lowercase().contains(lowerQuery) ||
                it.description.lowercase().contains(lowerQuery) ||
                it.tags.any { tag -> tag.lowercase().contains(lowerQuery) }
            }
        }
        return result
    }

    sealed class Result<out T> {
        data class Success<T>(val data: T) : Result<T>()
        data class Error(val message: String) : Result<Nothing>()
    }
}
