package com.aispring.service;

import com.aispring.entity.AgentSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

/**
 * Agent 会话服务接口
 */
public interface AgentSessionService {

    /**
     * 创建新会话
     * @param userId 用户ID
     * @param name 会话名称
     * @param workingDirectory 工作目录
     * @return 创建的会话
     */
    AgentSession createSession(Long userId, String name, String workingDirectory);

    /**
     * 获取用户的会话列表
     * @param userId 用户ID
     * @return 会话列表
     */
    List<AgentSession> getSessionsByUserId(Long userId);

    /**
     * 分页获取用户的会话列表
     * @param userId 用户ID
     * @param pageable 分页参数
     * @return 会话分页
     */
    Page<AgentSession> getSessionsByUserId(Long userId, Pageable pageable);

    /**
     * 获取用户的活跃会话
     * @param userId 用户ID
     * @return 活跃会话列表
     */
    List<AgentSession> getActiveSessions(Long userId);

    /**
     * 获取会话详情
     * @param sessionId 会话ID
     * @param userId 用户ID
     * @return 会话详情
     */
    Optional<AgentSession> getSessionById(Long sessionId, Long userId);

    /**
     * 更新会话
     * @param sessionId 会话ID
     * @param userId 用户ID
     * @param name 会话名称
     * @return 更新后的会话
     */
    AgentSession updateSession(Long sessionId, Long userId, String name);

    /**
     * 关闭会话
     * @param sessionId 会话ID
     * @param userId 用户ID
     */
    void closeSession(Long sessionId, Long userId);

    /**
     * 删除会话
     * @param sessionId 会话ID
     * @param userId 用户ID
     */
    void deleteSession(Long sessionId, Long userId);

    /**
     * 获取或创建用户的最近活跃会话
     * @param userId 用户ID
     * @return 会话
     */
    AgentSession getOrCreateActiveSession(Long userId);

    /**
     * 更新会话的 Git 状态
     * @param sessionId 会话ID
     * @param commitHash 最新提交哈希
     * @param branch 当前分支
     */
    void updateGitStatus(Long sessionId, String commitHash, String branch);
}
