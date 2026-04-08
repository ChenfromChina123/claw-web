package com.aispring.service.impl;

import com.aispring.common.ModelConstants;
import com.aispring.service.AgentService;
import com.aispring.service.AiChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 需求分析 Agent 服务实现类
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class AgentServiceImpl implements AgentService {

    private final AiChatService aiChatService;
    private final com.aispring.service.SystemPromptService promptService;

    /**
     * 根据用户想法识别领域并生成细化问题
     * @param userIdea 用户初步需求想法
     * @param userId 用户ID
     * @return JSON格式的问题列表
     */
    @Override
    public String generateQuestions(String userIdea, Long userId) {
        log.info("Generating questions for userIdea: {} (userId: {})", userIdea, userId);

        // 从数据库获取"需求分析专家"的提示词模板
        String template = promptService.getByRole("Requirement Analysis Expert")
                .map(com.aispring.entity.SystemPrompt::getContent)
                .orElse("请充当需求分析专家，根据想法 \"%s\" 生成细化问题（JSON格式）。");

        String prompt = String.format(template, userIdea);

        // 调用AI生成题目
        String response = aiChatService.ask(prompt, null, ModelConstants.DEFAULT_MODEL, userId, null);

        // 简单清洗响应，确保是纯JSON（有时AI会带Markdown标记）
        if (response != null) {
            response = response.trim();
            if (response.startsWith("```json")) {
                response = response.substring(7);
            }
            if (response.endsWith("```")) {
                response = response.substring(0, response.length() - 3);
            }
            response = response.trim();
        }

        return response;
    }

    /**
     * 根据用户想法、作答结果和搜索信息生成完整需求文档（流式）
     * @param userIdea 用户初步需求想法
     * @param answers 用户作答结果（JSON）
     * @param searchResult 搜索结果
     * @param userId 用户ID
     * @return SSE发射器
     */
    @Override
    public SseEmitter generateDocumentStream(String userIdea, String answers, String searchResult, Long userId) {
        log.info("Generating document stream for userIdea: {} (userId: {})", userIdea, userId);

        // 从数据库获取"产品经理"的提示词模板
        String template = promptService.getByRole("Product Manager")
                .map(com.aispring.entity.SystemPrompt::getContent)
                .orElse("请充当产品经理，根据想法 \"%s\"、答案 \"%s\" 和参考信息 \"%s\" 生成 PRD 文档。");

        String prompt = String.format(template, userIdea, answers, searchResult);

        // 调用AI流式生成文档
        return aiChatService.askStream(prompt, null, ModelConstants.DEFAULT_MODEL, userId);
    }
}
