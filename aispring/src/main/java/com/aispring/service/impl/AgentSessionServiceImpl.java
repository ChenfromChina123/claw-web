package com.aispring.service.impl;

import com.aispring.entity.AgentSession;
import com.aispring.exception.CustomException;
import com.aispring.repository.AgentSessionRepository;
import com.aispring.service.AgentSessionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Agent 会话服务实现类
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AgentSessionServiceImpl implements AgentSessionService {

    private final AgentSessionRepository sessionRepository;

    @Override
    @Transactional
    public AgentSession createSession(Long userId, String name, String workingDirectory) {
        log.info("Creating agent session for user: {}, name: {}", userId, name);

        AgentSession session = new AgentSession();
        session.setUserId(userId);
        // 与 AI 问答一致：未命名时使用「新会话」，首条用户消息后再由前端更新标题
        session.setName(name != null && !name.isBlank() ? name : "新会话");
        session.setWorkingDirectory(workingDirectory);
        session.setSandboxPath(generateSandboxPath());
        session.setStatus("active");
        session.setGitInitialized(false);

        return sessionRepository.save(session);
    }

    @Override
    public List<AgentSession> getSessionsByUserId(Long userId) {
        return sessionRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Override
    public Page<AgentSession> getSessionsByUserId(Long userId, Pageable pageable) {
        return sessionRepository.findByUserId(userId, pageable);
    }

    @Override
    public List<AgentSession> getActiveSessions(Long userId) {
        return sessionRepository.findActiveSessionsByUserId(userId);
    }

    @Override
    public Optional<AgentSession> getSessionById(Long sessionId, Long userId) {
        return sessionRepository.findByIdAndUserId(sessionId, userId);
    }

    @Override
    @Transactional
    public AgentSession updateSession(Long sessionId, Long userId, String name) {
        AgentSession session = sessionRepository.findByIdAndUserId(sessionId, userId)
                .orElseThrow(() -> new CustomException("Session not found"));

        if (name != null) {
            session.setName(name);
        }

        return sessionRepository.save(session);
    }

    @Override
    @Transactional
    public void closeSession(Long sessionId, Long userId) {
        AgentSession session = sessionRepository.findByIdAndUserId(sessionId, userId)
                .orElseThrow(() -> new CustomException("Session not found"));

        session.close();
        sessionRepository.save(session);
    }

    @Override
    @Transactional
    public void deleteSession(Long sessionId, Long userId) {
        AgentSession session = sessionRepository.findByIdAndUserId(sessionId, userId)
                .orElseThrow(() -> new CustomException("Session not found"));

        sessionRepository.delete(session);
    }

    @Override
    @Transactional
    public AgentSession getOrCreateActiveSession(Long userId) {
        List<AgentSession> activeSessions = sessionRepository.findActiveSessionsByUserId(userId);

        if (!activeSessions.isEmpty()) {
            return activeSessions.get(0);
        }

        return createSession(userId, null, null);
    }

    @Override
    @Transactional
    public void updateGitStatus(Long sessionId, String commitHash, String branch) {
        AgentSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new CustomException("Session not found"));

        session.setGitInitialized(true);
        session.setLastCommitHash(commitHash);
        session.setCurrentBranch(branch);
        sessionRepository.save(session);
    }

    /**
     * 生成沙箱路径
     */
    private String generateSandboxPath() {
        return "/tmp/agent-sandbox/" + UUID.randomUUID().toString();
    }
}
