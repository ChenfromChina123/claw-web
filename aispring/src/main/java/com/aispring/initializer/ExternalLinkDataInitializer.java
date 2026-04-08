package com.aispring.initializer;

import com.aispring.entity.ExternalLink;
import com.aispring.repository.ExternalLinkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * 外部链接数据初始化器
 * 在应用启动时检查并初始化示例外部链接数据
 */
@Component
@Order(5)
@RequiredArgsConstructor
@Slf4j
public class ExternalLinkDataInitializer implements CommandLineRunner {

    private final ExternalLinkRepository externalLinkRepository;

    @Override
    public void run(String... args) {
        try {
            // 检查是否已有数据
            long count = externalLinkRepository.count();
            if (count > 0) {
                log.info("外部链接数据已存在，跳过初始化（当前数量: {}）", count);
                return;
            }

            log.info("开始初始化外部链接示例数据...");
            
            List<ExternalLink> sampleLinks = Arrays.asList(
                createLink(
                    "GitHub - 全球最大的代码托管平台",
                    "https://github.com",
                    "全球最大的开源代码托管平台，汇聚数百万开发者。探索开源项目、协作开发、版本控制，加速您的编程之旅。",
                    "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
                    1
                ),
                createLink(
                    "Stack Overflow - 程序员问答社区",
                    "https://stackoverflow.com",
                    "全球最大的程序员问答社区，数百万技术问题和专业解答。从初学者到资深工程师，都能在这里找到帮助。",
                    "https://cdn.sstatic.net/Sites/stackoverflow/Img/apple-touch-icon@2.png",
                    2
                ),
                createLink(
                    "MDN Web Docs - Web 开发权威文档",
                    "https://developer.mozilla.org",
                    "Mozilla 维护的 Web 技术权威文档，涵盖 HTML、CSS、JavaScript 等，是 Web 开发者的必备参考手册。",
                    "https://developer.mozilla.org/apple-touch-icon.png",
                    3
                ),
                createLink(
                    "LeetCode - 算法刷题平台",
                    "https://leetcode.com",
                    "全球领先的编程算法练习平台，助你提升编程能力、准备技术面试。支持多种编程语言，题库丰富且持续更新。",
                    "https://leetcode.com/favicon.png",
                    4
                ),
                createLink(
                    "菜鸟教程 - 编程学习网站",
                    "https://www.runoob.com",
                    "提供简单易懂的编程教程，涵盖前端、后端、数据库、移动开发等。适合初学者入门和进阶学习。",
                    "https://static.runoob.com/images/favicon.ico",
                    5
                ),
                createLink(
                    "Hugging Face - AI 模型社区",
                    "https://huggingface.co",
                    "全球最大的 AI 模型和数据集社区，提供开源模型、数据集、演示应用。从 NLP 到计算机视觉，应有尽有。",
                    "https://huggingface.co/front/assets/huggingface_logo.svg",
                    6
                ),
                createLink(
                    "DeepSeek - AI 大模型平台",
                    "https://www.deepseek.com",
                    "国内领先的 AI 大模型平台，提供强大的对话、编程、写作等能力。支持 API 调用，助力开发者构建智能应用。",
                    null,
                    7
                ),
                createLink(
                    "Vue.js - 渐进式 JavaScript 框架",
                    "https://vuejs.org",
                    "易学易用、性能出色、适用场景丰富的前端框架。渐进式的设计让你可以逐步采用，从简单的交互到复杂的 SPA。",
                    "https://vuejs.org/logo.svg",
                    8
                )
            );

            externalLinkRepository.saveAll(sampleLinks);
            log.info("✅ 外部链接示例数据初始化成功！已添加 {} 条链接", sampleLinks.size());
            
        } catch (Exception e) {
            log.error("外部链接数据初始化失败", e);
        }
    }

    /**
     * 创建外部链接对象
     */
    private ExternalLink createLink(String title, String url, String description, 
                                   String imageUrl, int sortOrder) {
        ExternalLink link = new ExternalLink();
        link.setTitle(title);
        link.setUrl(url);
        link.setDescription(description);
        link.setImageUrl(imageUrl);
        link.setClickCount(0);
        link.setIsActive(true);
        link.setSortOrder(sortOrder);
        link.setCreatedAt(LocalDateTime.now());
        link.setUpdatedAt(LocalDateTime.now());
        
        // 自动分类
        if (title.contains("GitHub") || title.contains("Stack Overflow")) {
            link.setCategory("开发工具");
        } else if (title.contains("MDN") || title.contains("LeetCode") || title.contains("菜鸟教程")) {
            link.setCategory("学习资源");
        } else if (title.contains("AI") || title.contains("DeepSeek") || title.contains("Hugging Face")) {
            link.setCategory("AI平台");
        } else if (title.contains("Vue") || title.contains("React") || title.contains("Angular")) {
            link.setCategory("前端框架");
        } else {
            link.setCategory("其他");
        }
        
        return link;
    }
}
