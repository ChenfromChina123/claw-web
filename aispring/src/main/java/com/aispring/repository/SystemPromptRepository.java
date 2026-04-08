package com.aispring.repository;

import com.aispring.entity.SystemPrompt;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

/**
 * 系统提示词仓库接口
 */
public interface SystemPromptRepository extends JpaRepository<SystemPrompt, Long> {
    Optional<SystemPrompt> findByRole(String role);
}
