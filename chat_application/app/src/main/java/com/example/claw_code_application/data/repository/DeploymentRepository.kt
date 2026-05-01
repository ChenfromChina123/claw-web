package com.example.claw_code_application.data.repository

import com.example.claw_code_application.data.api.ApiService
import com.example.claw_code_application.data.api.models.DeploymentListResponse
import com.example.claw_code_application.data.api.models.PreviewUrlResponse
import com.example.claw_code_application.data.api.models.ProjectDeployment
import com.example.claw_code_application.data.local.UserManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext

/**
 * 部署仓库
 *
 * 管理项目部署的 CRUD 操作，提供内存缓存。
 */
class DeploymentRepository(
    private val apiService: ApiService
) {
    private val _deployments = MutableStateFlow<List<ProjectDeployment>>(emptyList())
    val deployments: StateFlow<List<ProjectDeployment>> = _deployments

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private var lastFetchTime = 0L
    private val CACHE_TTL = 60_000L

    /**
     * 获取用户所有部署项目（带缓存）
     */
    suspend fun fetchDeployments(forceRefresh: Boolean = false): List<ProjectDeployment> {
        val now = System.currentTimeMillis()
        if (!forceRefresh && now - lastFetchTime < CACHE_TTL && _deployments.value.isNotEmpty()) {
            return _deployments.value
        }

        _isLoading.value = true
        try {
            val response = apiService.getDeployments()
            if (response.isSuccessful) {
                val data = response.body()?.data
                val list = data?.deployments ?: emptyList()
                _deployments.value = list
                lastFetchTime = now
                return list
            }
        } catch (_: Exception) { } finally {
            _isLoading.value = false
        }
        return _deployments.value
    }

    /**
     * 启动项目
     */
    suspend fun startProject(projectId: String): Boolean {
        return try {
            val response = apiService.startDeployment(projectId)
            response.isSuccessful
        } catch (_: Exception) { false }
    }

    /**
     * 停止项目
     */
    suspend fun stopProject(projectId: String): Boolean {
        return try {
            val response = apiService.stopDeployment(projectId)
            response.isSuccessful
        } catch (_: Exception) { false }
    }

    /**
     * 删除项目
     */
    suspend fun deleteProject(projectId: String): Boolean {
        return try {
            val response = apiService.deleteDeployment(projectId)
            if (response.isSuccessful) {
                _deployments.value = _deployments.value.filter { it.projectId != projectId }
                true
            } else false
        } catch (_: Exception) { false }
    }

    /**
     * 获取预览URL
     */
    suspend fun getPreviewUrl(projectId: String): String? {
        return try {
            val response = apiService.getPreviewUrl(projectId)
            response.body()?.data?.previewUrl
        } catch (_: Exception) { null }
    }

    /**
     * 开启外部访问
     */
    suspend fun enableExternalAccess(projectId: String): Boolean {
        return try {
            val response = apiService.enableExternalAccess(projectId)
            response.isSuccessful
        } catch (_: Exception) { false }
    }

    companion object {
        @Volatile
        private var instance: DeploymentRepository? = null

        fun getInstance(apiService: ApiService): DeploymentRepository {
            return instance ?: synchronized(this) {
                instance ?: DeploymentRepository(apiService).also { instance = it }
            }
        }
    }
}
