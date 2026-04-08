package com.aispring.repository;

import com.aispring.entity.AgentFileSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Agent 文件快照 Repository 接口
 */
@Repository
public interface AgentFileSnapshotRepository extends JpaRepository<AgentFileSnapshot, Long> {

    /**
     * 根据会话ID查找快照列表
     */
    List<AgentFileSnapshot> findBySessionIdOrderByCreatedAtDesc(Long sessionId);

    /**
     * 根据任务ID查找快照列表
     */
    List<AgentFileSnapshot> findByTaskIdOrderByCreatedAtDesc(Long taskId);

    /**
     * 根据会话ID和文件路径查找快照
     */
    List<AgentFileSnapshot> findBySessionIdAndFilePath(Long sessionId, String filePath);

    /**
     * 根据会话ID和快照类型查找快照
     */
    List<AgentFileSnapshot> findBySessionIdAndSnapshotType(Long sessionId, String snapshotType);

    /**
     * 查找会话最新的快照
     */
    @Query("SELECT s FROM AgentFileSnapshot s WHERE s.sessionId = :sessionId ORDER BY s.createdAt DESC LIMIT 1")
    Optional<AgentFileSnapshot> findLatestSnapshotBySessionId(@Param("sessionId") Long sessionId);

    /**
     * 查找会话指定文件的最新快照
     */
    @Query("SELECT s FROM AgentFileSnapshot s WHERE s.sessionId = :sessionId AND s.filePath = :filePath ORDER BY s.createdAt DESC LIMIT 1")
    Optional<AgentFileSnapshot> findLatestSnapshotBySessionIdAndFilePath(
            @Param("sessionId") Long sessionId,
            @Param("filePath") String filePath
    );

    /**
     * 根据提交哈希查找快照
     */
    Optional<AgentFileSnapshot> findByCommitHash(String commitHash);

    /**
     * 统计会话的快照数量
     */
    long countBySessionId(Long sessionId);

    /**
     * 删除会话的所有快照
     */
    void deleteBySessionId(Long sessionId);
}
