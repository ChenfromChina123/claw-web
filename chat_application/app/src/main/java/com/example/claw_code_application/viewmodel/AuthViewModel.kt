package com.example.claw_code_application.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.AuthData
import com.example.claw_code_application.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * 认证ViewModel
 * 处理登录、注册等认证相关业务逻辑
 */
class AuthViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    /** UI状态密封类 */
    sealed class UiState {
        data object Idle : UiState()
        data object Loading : UiState()
        data class Success(val data: AuthData) : UiState()
        data class Error(val message: String) : UiState()
    }

    /** 私有可观察状态 */
    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    /**
     * 用户登录
     * @param email 邮箱地址
     * @param password 密码
     */
    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            
            val result = authRepository.login(email, password)
            result.fold(
                onSuccess = { data ->
                    _uiState.value = UiState.Success(data)
                },
                onFailure = { e ->
                    _uiState.value = UiState.Error(e.message ?: "登录失败，请检查邮箱和密码")
                }
            )
        }
    }

    /**
     * 用户注册
     * @param email 邮箱地址
     * @param username 用户名
     * @param password 密码
     * @param code 验证码
     */
    fun register(email: String, username: String, password: String, code: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            
            val result = authRepository.register(email, username, password, code)
            result.fold(
                onSuccess = { data ->
                    _uiState.value = UiState.Success(data)
                },
                onFailure = { e ->
                    _uiState.value = UiState.Error(e.message ?: "注册失败，请稍后重试")
                }
            )
        }
    }

    /**
     * 重置UI状态为空闲
     */
    fun resetState() {
        _uiState.value = UiState.Idle
    }

    companion object {
        /**
         * 提供ViewModel工厂方法
         */
        fun provideFactory(authRepository: AuthRepository): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                    return AuthViewModel(authRepository) as T
                }
            }
        }
    }
}
