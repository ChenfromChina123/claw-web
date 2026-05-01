package com.example.claw_code_application.data.api.models

import androidx.compose.runtime.Immutable
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 项目部署信息
 */
@Immutable
@Serializable
data class ProjectDeployment(
    val projectId: String,
    val userId: String = "",
    val name: String,
    val type: String,
    val status: String = "building",
    val domain: String? = null,
    @SerialName("publicUrl")
    val publicUrl: String? = null,
    @SerialName("internalPort")
    val internalPort: Int? = null,
    @SerialName("startCommand")
    val startCommand: String = "",
    @SerialName("buildCommand")
    val buildCommand: String? = null,
    @SerialName("processManager")
    val processManager: String = "pm2",
    @SerialName("autoRestart")
    val autoRestart: Boolean = true,
    @SerialName("externalAccessEnabled")
    val externalAccessEnabled: Boolean = false,
    @SerialName("createdAt")
    val createdAt: String = "",
    @SerialName("updatedAt")
    val updatedAt: String = ""
)

/**
 * 部署列表响应
 */
@Serializable
data class DeploymentListResponse(
    val total: Int = 0,
    @SerialName("deployments")
    val deployments: List<ProjectDeployment> = emptyList()
)

/**
 * 创建部署请求
 */
@Serializable
data class CreateDeploymentRequest(
    val name: String,
    val type: String,
    @SerialName("sourceType")
    val sourceType: String = "upload",
    @SerialName("startCommand")
    val startCommand: String,
    @SerialName("buildCommand")
    val buildCommand: String? = null,
    @SerialName("envVars")
    val envVars: Map<String, String>? = null,
    @SerialName("enableExternalAccess")
    val enableExternalAccess: Boolean = false
)

/**
 * 预览URL响应
 */
@Serializable
data class PreviewUrlResponse(
    @SerialName("projectId")
    val projectId: String,
    @SerialName("previewUrl")
    val previewUrl: String = "",
    val status: String = "unknown",
    val domain: String? = null,
    @SerialName("internalPort")
    val internalPort: Int? = null
)
