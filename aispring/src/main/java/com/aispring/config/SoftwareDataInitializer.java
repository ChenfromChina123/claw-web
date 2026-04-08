package com.aispring.config;

import com.aispring.entity.Category;
import com.aispring.entity.Resource;
import com.aispring.repository.CategoryRepository;
import com.aispring.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 软件数据初始化器
 * 在系统启动时自动检查并填充初始软件信息（CodeNova, Agent）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SoftwareDataInitializer implements CommandLineRunner {

    private final ResourceRepository resourceRepository;
    private final CategoryRepository categoryRepository;

    @Override
    public void run(String... args) throws Exception {
        log.info("检查并初始化软件版本信息...");

        // 获取或创建软件分类
        Category softwareCategory = categoryRepository.findByName("软件项目")
                .orElseGet(() -> {
                    Category newCategory = Category.builder()
                            .name("软件项目")
                            .description("各类软件项目的下载与说明资源")
                            .build();
                    return categoryRepository.save(newCategory);
                });

        // 检查 CodeNova 是否存在
        List<Resource> resources = resourceRepository.findAll();
        boolean hasCodeNova = resources.stream()
                .anyMatch(r -> r.getTitle().toLowerCase().contains("codenova"));
        
        if (!hasCodeNova) {
            Resource codenova = Resource.builder()
                    .userId(21L) // 默认管理员ID
                    .title("CodeNova")
                    .version("v1.0.2")
                    .type("software")
                    .platform("Android")
                    .category(softwareCategory)
                    .url("https://github.com/ChenfromChina123/CodeNova")
                    .description("CodeNova 是一款为开发者打造的现代化移动端 IDE，支持多种编程语言，提供流畅的编码体验。")
                    .isPublic(1)
                    .build();
            resourceRepository.save(codenova);
            log.info("已初始化 CodeNova (Android) 软件信息");
        }

        // 检查旧的“通用”平台 Agent 是否存在，如果存在则删除或更新
        resources.stream()
                .filter(r -> r.getTitle().contains("Agent") && (r.getPlatform() == null || r.getPlatform().equals("") || r.getPlatform().equals("通用")))
                .forEach(r -> {
                    resourceRepository.delete(r);
                    log.info("已清理旧的通用平台 Agent 记录: {}", r.getId());
                });

        // 重新获取列表以反映删除操作
        List<Resource> currentResources = resourceRepository.findAll();

        // 检查 Agent 是否存在 (多平台版本)
        boolean hasAgentWindows = currentResources.stream()
                .anyMatch(r -> r.getTitle().contains("Agent") && "Windows".equals(r.getPlatform()));
        
        if (!hasAgentWindows) {
            Resource agentWin = Resource.builder()
                    .userId(21L)
                    .title("Agent 终端助手")
                    .version("v1.0.0")
                    .type("software")
                    .platform("Windows")
                    .category(softwareCategory)
                    .url("/agent/windows")
                    .description("Agent 是一款智能终端助手，支持自动化任务处理、文件系统监控以及多模型智能对话。")
                    .isPublic(1)
                    .build();
            resourceRepository.save(agentWin);
            log.info("已初始化 Agent (Windows) 软件信息");
        }

        boolean hasAgentLinux = currentResources.stream()
                .anyMatch(r -> r.getTitle().contains("Agent") && "Linux".equals(r.getPlatform()));
        
        if (!hasAgentLinux) {
            Resource agentLinux = Resource.builder()
                    .userId(21L)
                    .title("Agent 终端助手")
                    .version("v1.0.0")
                    .type("software")
                    .platform("Linux")
                    .category(softwareCategory)
                    .url("/agent/linux")
                    .description("Agent 是一款智能终端助手，支持自动化任务处理、文件系统监控以及多模型智能对话。")
                    .isPublic(1)
                    .build();
            resourceRepository.save(agentLinux);
            log.info("已初始化 Agent (Linux) 软件信息");
        }
    }
}
