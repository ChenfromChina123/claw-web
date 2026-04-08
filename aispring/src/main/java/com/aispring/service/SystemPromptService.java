package com.aispring.service;

import com.aispring.entity.SystemPrompt;
import java.util.List;
import java.util.Optional;

/**
 * 系统提示词服务接口
 */
public interface SystemPromptService {
    Optional<SystemPrompt> getByRole(String role);
    List<SystemPrompt> getAllPrompts();
    SystemPrompt savePrompt(SystemPrompt prompt);
    void deletePrompt(Long id);
    
    /**
     * 从远程 GitHub 仓库同步提示词 (awesome-chatgpt-prompts)
     */
    void syncFromRemote();
}
