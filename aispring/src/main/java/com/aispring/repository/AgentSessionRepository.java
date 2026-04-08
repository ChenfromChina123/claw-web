package com.aispring.repository;

import com.aispring.entity.AgentSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Agent 会话 Repository 接口
 */
@Repository
public interface AgentSessionRepository extends JpaRepository<AgentSession, Long> {

    /**
     * 根据用户ID查找会话列表
     */
    List<AgentSession> findByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * 根据用户ID分页查找会话列表
     */
    Page<AgentSession> findByUserId(Long userId, Pageable pageable);

    /**
     * 根据用户ID和状态查找会话列表
     */
    List<AgentSession> findByUserIdAndStatus(Long userId, String status);

    /**
     * 根据用户ID查找活跃会话
     */
    @Query("SELECT s FROM AgentSession s WHERE s.userId = :userId AND s.status = 'active' ORDER BY s.updatedAt DESC")
    List<AgentSession> findActiveSessionsByUserId(@Param("userId") Long userId);

    /**
     * 根据用户ID和会话ID查找会话
     */
    Optional<AgentSession> findByIdAndUserId(Long id, Long userId);

    /**
     * 统计用户的会话数量
     */
    long countByUserId(Long userId);

    /**
     * 统计用户的活跃会话数量
     */
    long countByUserIdAndStatus(Long userId, String status);

    /**
     * 查找用户最近的活跃会话
     */
    @Query("SELECT s FROM AgentSession s WHERE s.userId = :userId AND s.status = 'active' ORDER BY s.updatedAt DESC LIMIT 1")
    Optional<AgentSession> findLatestActiveSession(@Param("userId") Long userId);
}
