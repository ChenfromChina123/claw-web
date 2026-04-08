package com.aispring.service.impl;

import com.aispring.common.ModelConstants;
import com.aispring.common.prompt.VocabPromptConstants;
import com.aispring.service.AiChatService;
import com.aispring.service.AiVocabService;
import com.aispring.service.LearningRecordService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.beans.factory.annotation.Value;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class AiVocabServiceImpl implements AiVocabService {

    private final AiChatService aiChatService;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate;
    private final LearningRecordService learningRecordService;

    @Value("${whisper.server.url:http://127.0.0.1:8090/inference}")
    private String whisperServerUrl;

    @Override
    public Map<String, Object> evaluateSpeech(org.springframework.web.multipart.MultipartFile audio, String targetText, Long userId) {
        // 1. 调用真实的本地 whisper.cpp ASR 服务将音频转为文本
        String recognizedText = transcribeAudioWithWhisper(audio);
        log.info("ASR recognized text: '{}', target text: '{}'", recognizedText, targetText);

        if (recognizedText == null || recognizedText.trim().isEmpty()) {
            Map<String, Object> result = new HashMap<>();
            result.put("score", 0);
            result.put("recognizedText", "");
            result.put("targetText", targetText);
            result.put("aiFeedback", "未能识别到有效发音，请检查麦克风或大声朗读。");
            return result;
        }

        // 2. 使用莱文斯坦距离计算基础相似度得分
        int baseScore = calculateLevenshteinScore(targetText.toLowerCase().replaceAll("[^a-z0-9 ]", ""),
                recognizedText.toLowerCase().replaceAll("[^a-z0-9 ]", ""));
        log.info("Base Levenshtein score: {}", baseScore);

        // 3. 构造 LLM 评测 Prompt 进行深度纠错
        String prompt = String.format("目标文本：%s\n实际发音识别结果：%s\n基础相似度得分：%d", targetText, recognizedText, baseScore);

        // 4. 调用大模型
        String aiResponse = aiChatService.ask(prompt, null, ModelConstants.DEFAULT_MODEL, userId, VocabPromptConstants.SPEECH_EVALUATION_PROMPT, null);
        
        Map<String, Object> result = parseJsonToMap(aiResponse, recognizedText, targetText, "speech");
        
        // 5. 保存发音记录到数据库
        if (userId != null) {
            try {
                Integer score = (Integer) result.get("score");
                String aiFeedback = (String) result.get("aiFeedback");
                List<String> weakWords = (List<String>) result.get("weakWords");
                
                learningRecordService.recordPronunciation(
                    userId, 
                    null, 
                    targetText, 
                    recognizedText, 
                    score, 
                    aiFeedback, 
                    weakWords
                );
                log.info("已保存发音记录到数据库 - 用户：{}", userId);
            } catch (Exception e) {
                log.error("保存发音记录失败", e);
            }
        }
        
        return result;
    }

    @Override
    public Map<String, Object> evaluateSpelling(String targetWord, String userSpelling, Long userId) {
        String prompt = String.format("目标单词：%s\n用户错误拼写：%s", targetWord, userSpelling);

        // 调用大模型
        String aiResponse = aiChatService.ask(prompt, null, ModelConstants.DEFAULT_MODEL, userId, VocabPromptConstants.SPELLING_EVALUATION_PROMPT, null);

        return parseJsonToMap(aiResponse, userSpelling, targetWord, "spelling");
    }

    /**
     * 调用本地 whisper.cpp 服务进行真实语音识别
     */
    private String transcribeAudioWithWhisper(org.springframework.web.multipart.MultipartFile audio) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            // 包装 MultipartFile 为 ByteArrayResource，因为 RestTemplate 需要知道文件名
            ByteArrayResource fileAsResource = new ByteArrayResource(audio.getBytes()) {
                @Override
                public String getFilename() {
                    return audio.getOriginalFilename() != null ? audio.getOriginalFilename() : "audio.wav";
                }
            };
            
            body.add("file", fileAsResource);
            body.add("temperature", "0.0");
            body.add("response_format", "json");

            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            log.info("Sending audio to local whisper service at: {}", whisperServerUrl);
            ResponseEntity<String> response = restTemplate.postForEntity(whisperServerUrl, requestEntity, String.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                if (root.has("text")) {
                    return root.path("text").asText().trim();
                }
            }
            log.error("Whisper service returned unexpected response: {}", response.getBody());
            return "";
        } catch (Exception e) {
            log.error("Error transcribing audio with local whisper service", e);
            return "";
        }
    }

    /**
     * 计算两个字符串的莱文斯坦距离（编辑距离）并转换为百分制得分
     */
    private int calculateLevenshteinScore(String s1, String s2) {
        if (s1.isEmpty() && s2.isEmpty()) return 100;
        if (s1.isEmpty() || s2.isEmpty()) return 0;

        int[] costs = new int[s2.length() + 1];
        for (int j = 0; j < costs.length; j++) costs[j] = j;
        for (int i = 1; i <= s1.length(); i++) {
            costs[0] = i;
            int nw = i - 1;
            for (int j = 1; j <= s2.length(); j++) {
                int cj = Math.min(1 + Math.min(costs[j], costs[j - 1]),
                        s1.charAt(i - 1) == s2.charAt(j - 1) ? nw : nw + 1);
                nw = costs[j];
                costs[j] = cj;
            }
        }
        int distance = costs[s2.length()];
        int maxLength = Math.max(s1.length(), s2.length());
        
        // 转换为百分制：(最大长度 - 距离) / 最大长度 * 100
        return (int) (((double) (maxLength - distance) / maxLength) * 100);
    }

    /**
     * 解析 AI 返回的 JSON 字符串并合并结果
     */
    private Map<String, Object> parseJsonToMap(String aiResponse, String userText, String targetText, String type) {
        Map<String, Object> result = new HashMap<>();
        try {
            // 清理可能的 Markdown 代码块
            String jsonStr = aiResponse.trim();
            if (jsonStr.startsWith("```json")) {
                jsonStr = jsonStr.substring(7);
            }
            if (jsonStr.startsWith("```")) {
                jsonStr = jsonStr.substring(3);
            }
            if (jsonStr.endsWith("```")) {
                jsonStr = jsonStr.substring(0, jsonStr.length() - 3);
            }
            jsonStr = jsonStr.trim();

            JsonNode rootNode = objectMapper.readTree(jsonStr);
            
            if ("speech".equals(type)) {
                result.put("score", rootNode.path("score").asInt(80));
                result.put("recognizedText", userText);
                result.put("targetText", targetText);
                result.put("aiFeedback", rootNode.path("aiFeedback").asText("发音不错！"));
                if (rootNode.has("weakWords")) {
                    result.put("weakWords", objectMapper.convertValue(rootNode.path("weakWords"), List.class));
                }
            } else if ("spelling".equals(type)) {
                result.put("targetWord", targetText);
                result.put("userSpelling", userText);
                result.put("aiFeedback", rootNode.path("aiFeedback").asText("拼写需要注意。"));
                if (rootNode.has("tags")) {
                    result.put("tags", objectMapper.convertValue(rootNode.path("tags"), List.class));
                }
            }

        } catch (Exception e) {
            log.error("Failed to parse AI response to JSON: {}", aiResponse, e);
            result.put("aiFeedback", "AI 解析失败，请参考原始回复: " + aiResponse);
            if ("speech".equals(type)) {
                result.put("score", 0);
                result.put("recognizedText", userText);
                result.put("targetText", targetText);
            } else {
                result.put("targetWord", targetText);
                result.put("userSpelling", userText);
            }
        }
        return result;
    }
}
