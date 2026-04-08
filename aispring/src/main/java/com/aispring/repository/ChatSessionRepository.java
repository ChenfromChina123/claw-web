package com.aispring.repository;

import com.aispring.entity.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, Long> {
    Optional<ChatSession> findBySessionId(String sessionId);
    void deleteBySessionId(String sessionId);
    java.util.List<ChatSession> findByUserIdAndSessionTypeOrderByCreatedAtDesc(Long userId, String sessionType);
}
