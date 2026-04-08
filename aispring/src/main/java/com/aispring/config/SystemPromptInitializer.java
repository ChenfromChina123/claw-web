package com.aispring.config;

import com.aispring.entity.SystemPrompt;
import com.aispring.repository.SystemPromptRepository;
import com.aispring.service.SystemPromptService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 系统提示词初始化器
 * 自动拉取 awesome-prompts (f/awesome-chatgpt-prompts) 核心内容并应用
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SystemPromptInitializer implements CommandLineRunner {

    private final SystemPromptRepository promptRepository;
    private final SystemPromptService promptService;

    @Override
    public void run(String... args) {
        if (promptRepository.count() > 0) {
            log.info("System prompts already initialized.");
            return;
        }

        log.info("Starting system prompts initialization...");
        
        // 1. 先同步远程 awesome-prompts 库内容 (英文)
        promptService.syncFromRemote();

        // 2. 添加针对本项目优化的核心中文提示词 (作为补充)
        List<SystemPrompt> corePrompts = new ArrayList<>();

        // 需求分析专家 (基于 IEEE 830 标准的专业增强版)
        corePrompts.add(SystemPrompt.builder()
                .role("Requirement Analysis Expert")
                .category("Role")
                .language("zh")
                .content("### 角色指令\n" +
                        "你是一名拥有10年经验的顶级资深需求分析专家（Senior Business Analyst）。你擅长通过苏格拉底式提问，从用户模糊的想法中挖掘深层业务逻辑、核心价值主张和潜在的技术风险。\n\n" +
                        "### 任务目标\n" +
                        "根据用户的初步想法：\"%s\"\n" +
                        "1. **精准识别领域**：识别该想法所属的垂直行业（如：跨境电商、K12在线教育、FinTech支付、大模型应用、企业级SaaS、社交媒体等）。\n" +
                        "2. **生成深度问卷**：生成5-8道具有行业深度、逻辑严密的问卷题目，用于补齐需求的拼图。\n\n" +
                        "### 题目设计准则\n" +
                        "- **核心流程**：涉及关键业务闭环（如：订单流、审批流、数据流）。\n" +
                        "- **用户角色**：明确不同端（App/Admin/Vendor）的职责边界。\n" +
                        "- **商业模式**：挖掘变现逻辑或核心痛点。\n" +
                        "- **技术约束**：涉及数据安全、并发量预估、第三方集成等。\n" +
                        "- **题型分布**：包含单选(radio)和多选(checkbox)，必须提供专业且覆盖面广的选项。\n\n" +
                        "### 输出约束\n" +
                        "1. 纯JSON格式，禁止Markdown代码块。\n" +
                        "2. 结构必须包含 domain 和 questions。")
                .build());

        // 资深产品经理 (PRD 生成专家)
        corePrompts.add(SystemPrompt.builder()
                .role("Product Manager")
                .category("Role")
                .language("zh")
                .content("### 角色指令\n" +
                        "你是一名世界级的资深产品经理。你的目标是编写一份具有高度专业性、可落地性、且能作为研发/测试唯一事实来源的需求分析文档（PRD）。\n\n" +
                        "### 输入上下文\n" +
                        "1. 用户原始愿景: \"%s\"\n" +
                        "2. 深度问答补充: \"%s\"\n" +
                        "3. 行业洞察参考: \"%s\"\n\n" +
                        "### 文档结构要求\n" +
                        "包含文档概览、用户画像、业务架构、详细功能需求(MoSCoW)、非功能性需求、数据约束及风险建议。")
                .build());

        promptRepository.saveAll(corePrompts);
        log.info("Successfully initialized core Chinese prompts.");
    }
}
