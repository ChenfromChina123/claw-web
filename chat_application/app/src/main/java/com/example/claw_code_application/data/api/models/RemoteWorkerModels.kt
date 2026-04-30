package com.example.claw_code_application.data.api.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 远程 Worker 数据模型
 */

@Serializable
data class RemoteWorker(
    val workerId: String,
    val host: String,
    val port: Int,
    val status: String, // deploying, running, error, offline, removing
    val healthStatus: String, // healthy, unhealthy, unknown
    val labels: Map<String, String>? = null,
    val dockerVersion: String? = null,
    val systemInfo: SystemInfo? = null,
    val sshUsername: String? = null,
    val sshPort: Int? = null,
    @SerialName("lastHeartbeatAt")
    val lastHeartbeatAt: String? = null,
    @SerialName("createdAt")
    val createdAt: String,
    @SerialName("updatedAt")
    val updatedAt: String
)

@Serializable
data class SystemInfo(
    val os: String? = null,
    val arch: String? = null,
    val cpuCores: Int? = null,
    val memoryGB: Int? = null,
    val diskGB: Int? = null
)

@Serializable
data class RemoteWorkerStats(
    val total: Int,
    val running: Int,
    val healthy: Int,
    val unhealthy: Int,
    val offline: Int,
    val error: Int
)

@Serializable
data class RemoteWorkerListResponse(
    val workers: List<RemoteWorker>,
    val stats: RemoteWorkerStats
)

@Serializable
data class EnvironmentCheckItem(
    val name: String,
    val passed: Boolean,
    val message: String,
    val details: Map<String, String>? = null
)

@Serializable
data class EnvironmentCheckResponse(
    val passed: Boolean,
    val checks: List<EnvironmentCheckItem>
)

@Serializable
data class DeployProgressItem(
    val step: String,
    val status: String, // pending, in_progress, completed, failed
    val message: String,
    val timestamp: String
)

@Serializable
data class DeployRemoteWorkerRequest(
    val host: String,
    val port: Int? = null,
    val username: String,
    val password: String,
    val workerPort: Int? = null,
    val labels: Map<String, String>? = null
)

@Serializable
data class DeployRemoteWorkerResponse(
    val workerId: String,
    val status: String,
    val host: String,
    val port: Int,
    val progress: List<DeployProgressItem>
)

@Serializable
data class PrecheckRequest(
    val host: String,
    val port: Int? = null,
    val username: String,
    val password: String,
    val workerPort: Int? = null
)

@Serializable
data class RemoteWorkerStatusResponse(
    val workerId: String,
    val status: String,
    val healthStatus: String,
    val host: String,
    val port: Int,
    val lastHeartbeatAt: String? = null,
    val progress: List<DeployProgressItem>? = null
)
