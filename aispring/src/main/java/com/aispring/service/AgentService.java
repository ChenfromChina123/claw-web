package com.aispring.service;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 需求分析 Agent 服务接口
 */
public interface AgentService {

    /**
     * 根据用户想法识别领域并生成细化问题
     * @param userIdea 用户初步需求想法
     * @param userId 用户ID
     * @return JSON格式的问题列表
     */
    String generateQuestions(String userIdea, Long userId);

    /**
     * 根据用户想法、作答结果和搜索信息生成完整需求文档（流式）
     * @param userIdea 用户初步需求想法
     * @param answers 用户作答结果（JSON）
     * @param searchResult 搜索结果
     * @param userId 用户ID
     * @return SSE发射器
     */
    SseEmitter generateDocumentStream(String userIdea, String answers, String searchResult, Long userId);
}
