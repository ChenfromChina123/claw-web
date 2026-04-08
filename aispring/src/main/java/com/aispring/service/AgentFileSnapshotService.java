package com.aispring.service;

import com.aispring.entity.AgentFileSnapshot;

import java.util.List;
import java.util.Optional;

/**
 * Agent 文件快照服务接口
 */
public interface AgentFileSnapshotService {

    /**
     * 创建快照
     * @param sessionId 会话ID
     * @param taskId 任务ID
     * @param filePath 文件路径
     * @param snapshotType 快照类型
     * @return 创建的快照
     */
    AgentFileSnapshot createSnapshot(Long sessionId, Long taskId, String filePath, String snapshotType);

    /**
     * 创建 Git 快照
     * @param sessionId 会话ID
     * @param taskId 任务ID
     * @param commitHash 提交哈希
     * @param commitMessage 提交消息
     * @return 创建的快照
     */
    AgentFileSnapshot createGitSnapshot(Long sessionId, Long taskId, String commitHash, String commitMessage);

    /**
     * 获取会话的快照列表
     * @param sessionId 会话ID
     * @return 快照列表
     */
    List<AgentFileSnapshot> getSnapshotsBySessionId(Long sessionId);

    /**
     * 获取任务的快照列表
     * @param taskId 任务ID
     * @return 快照列表
     */
    List<AgentFileSnapshot> getSnapshotsByTaskId(Long taskId);

    /**
     * 获取文件的最新快照
     * @param sessionId 会话ID
     * @param filePath 文件路径
     * @return 最新快照
     */
    Optional<AgentFileSnapshot> getLatestSnapshot(Long sessionId, String filePath);

    /**
     * 获取会话的最新快照
     * @param sessionId 会话ID
     * @return 最新快照
     */
    Optional<AgentFileSnapshot> getLatestSnapshot(Long sessionId);

    /**
     * 根据提交哈希获取快照
     * @param commitHash 提交哈希
     * @return 快照
     */
    Optional<AgentFileSnapshot> getSnapshotByCommitHash(String commitHash);

    /**
     * 删除会话的所有快照
     * @param sessionId 会话ID
     */
    void deleteSnapshotsBySessionId(Long sessionId);
}
