package com.aispring.service.impl;

import com.aispring.entity.SystemPrompt;
import com.aispring.repository.SystemPromptRepository;
import com.aispring.service.SystemPromptService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 系统提示词服务实现类
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SystemPromptServiceImpl implements SystemPromptService {

    private final SystemPromptRepository promptRepository;
    private final RestTemplate restTemplate;

    private static final String REMOTE_CSV_URL = "https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv";

    @Override
    public Optional<SystemPrompt> getByRole(String role) {
        return promptRepository.findByRole(role);
    }

    @Override
    public List<SystemPrompt> getAllPrompts() {
        return promptRepository.findAll();
    }

    @Override
    public SystemPrompt savePrompt(SystemPrompt prompt) {
        return promptRepository.save(prompt);
    }

    @Override
    public void deletePrompt(Long id) {
        promptRepository.deleteById(id);
    }

    @Override
    public void syncFromRemote() {
        log.info("Starting to sync prompts from remote: {}", REMOTE_CSV_URL);
        try {
            String csvContent = restTemplate.getForObject(REMOTE_CSV_URL, String.class);
            if (csvContent == null || csvContent.isEmpty()) {
                log.warn("Remote CSV content is empty.");
                return;
            }

            String[] lines = csvContent.split("\n");
            List<SystemPrompt> prompts = new ArrayList<>();
            
            // 跳过表头
            for (int i = 1; i < lines.length; i++) {
                String line = lines[i].trim();
                if (line.isEmpty()) continue;

                List<String> fields = parseCsvLine(line);
                if (fields.size() >= 2) {
                    String act = fields.get(0).replace("\"", "");
                    String prompt = fields.get(1);
                    
                    // 去掉开头和结尾的引号并处理转义引号
                    if (prompt.startsWith("\"") && prompt.endsWith("\"")) {
                        prompt = prompt.substring(1, prompt.length() - 1).replace("\"\"", "\"");
                    }

                    prompts.add(SystemPrompt.builder()
                            .role(act)
                            .content(prompt)
                            .category("Awesome-Prompts")
                            .language("en") // 原始库主要是英文
                            .build());
                }
            }

            if (!prompts.isEmpty()) {
                // 批量保存前先清理旧的远程同步数据 (可选)
                // promptRepository.deleteByCategory("Awesome-Prompts");
                promptRepository.saveAll(prompts);
                log.info("Successfully synced {} prompts from remote.", prompts.size());
            }

        } catch (Exception e) {
            log.error("Failed to sync prompts from remote: {}", e.getMessage(), e);
        }
    }

    /**
     * 简单的 CSV 行解析器，支持引号内包含逗号
     */
    private List<String> parseCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder currentField = new StringBuilder();
        boolean inQuotes = false;
        
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '\"') {
                inQuotes = !inQuotes;
                currentField.append(c);
            } else if (c == ',' && !inQuotes) {
                fields.add(currentField.toString());
                currentField.setLength(0);
            } else {
                currentField.append(c);
            }
        }
        fields.add(currentField.toString());
        return fields;
    }
}
