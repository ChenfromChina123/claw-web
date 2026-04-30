package com.example.claw_code_application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.RetrofitClient
import com.example.claw_code_application.data.api.models.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * 远程 Worker ViewModel
 * 处理远程 Worker 的获取、部署、删除等操作
 */
class RemoteWorkerViewModel : ViewModel() {

    /** UI 状态 */
    data class UiState(
        val workers: List<RemoteWorker> = emptyList(),
        val stats: RemoteWorkerStats = RemoteWorkerStats(0, 0, 0, 0, 0, 0),
        val isLoading: Boolean = false,
        val error: String? = null,
        val precheckResult: List<EnvironmentCheckItem>? = null,
        val precheckPassed: Boolean? = null,
        val isPrechecking: Boolean = false,
        val isDeploying: Boolean = false,
        val deploySuccess: Boolean = false
    )

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    private val apiService = RetrofitClient.apiService

    /**
     * 获取远程 Worker 列表
     */
    fun fetchRemoteWorkers() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                val response = apiService.getRemoteWorkers()
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body?.success == true && body.data != null) {
                        _uiState.value = _uiState.value.copy(
                            workers = body.data.workers,
                            stats = body.data.stats,
                            isLoading = false,
                            error = null
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = body?.error?.message ?: "获取失败"
                        )
                    }
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "获取失败: ${response.message()}"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "网络错误: ${e.message}"
                )
            }
        }
    }

    /**
     * 环境预检查
     */
    fun precheckRemoteWorker(
        host: String,
        port: Int,
        username: String,
        password: String,
        workerPort: Int
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isPrechecking = true,
                precheckResult = null,
                precheckPassed = null,
                error = null
            )

            try {
                val request = PrecheckRequest(
                    host = host,
                    port = port,
                    username = username,
                    password = password,
                    workerPort = workerPort
                )

                val response = apiService.precheckRemoteWorker(request)
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body?.success == true && body.data != null) {
                        _uiState.value = _uiState.value.copy(
                            isPrechecking = false,
                            precheckResult = body.data.checks,
                            precheckPassed = body.data.passed
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isPrechecking = false,
                            error = body?.error?.message ?: "检查失败"
                        )
                    }
                } else {
                    _uiState.value = _uiState.value.copy(
                        isPrechecking = false,
                        error = "检查失败: ${response.message()}"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isPrechecking = false,
                    error = "网络错误: ${e.message}"
                )
            }
        }
    }

    /**
     * 部署远程 Worker
     */
    fun deployRemoteWorker(
        host: String,
        port: Int,
        username: String,
        password: String,
        workerPort: Int
    ) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isDeploying = true,
                deploySuccess = false,
                error = null
            )

            try {
                val request = DeployRemoteWorkerRequest(
                    host = host,
                    port = port,
                    username = username,
                    password = password,
                    workerPort = workerPort
                )

                val response = apiService.deployRemoteWorker(request)
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body?.success == true) {
                        _uiState.value = _uiState.value.copy(
                            isDeploying = false,
                            deploySuccess = true
                        )
                        // 部署成功后刷新列表
                        fetchRemoteWorkers()
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isDeploying = false,
                            error = body?.error?.message ?: "部署失败"
                        )
                    }
                } else {
                    _uiState.value = _uiState.value.copy(
                        isDeploying = false,
                        error = "部署失败: ${response.message()}"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isDeploying = false,
                    error = "网络错误: ${e.message}"
                )
            }
        }
    }

    /**
     * 移除远程 Worker
     */
    fun removeRemoteWorker(workerId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            try {
                val response = apiService.removeRemoteWorker(workerId)
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body?.success == true) {
                        // 移除成功后刷新列表
                        fetchRemoteWorkers()
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            error = body?.error?.message ?: "移除失败"
                        )
                    }
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = "移除失败: ${response.message()}"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = "网络错误: ${e.message}"
                )
            }
        }
    }

    /**
     * 清除错误信息
     */
    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    /**
     * 重置部署状态
     */
    fun resetDeployState() {
        _uiState.value = _uiState.value.copy(
            deploySuccess = false,
            precheckResult = null,
            precheckPassed = null
        )
    }

    companion object {
        /**
         * ViewModel 工厂
         */
        fun provideFactory(): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return RemoteWorkerViewModel() as T
                }
            }
        }
    }
}
