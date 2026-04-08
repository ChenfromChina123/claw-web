package com.aispring.service.impl.chat;

import okhttp3.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;

import javax.net.ssl.*;
import java.security.cert.CertificateException;

/**
 * DeepSeek API 客户端封装
 * 负责与阿里百炼/DeepSeek API 的 HTTP 通信
 */
@Component
@Slf4j
public class DeepSeekApiClient {

    private final ObjectMapper objectMapper;
    private final OkHttpClient okHttpClient;
    private final String deepseekApiKey;
    private final String deepseekApiUrl;
    private final Integer maxTokens;

    public DeepSeekApiClient(
            ObjectMapper objectMapper,
            @Value("${ai.deepseek.api-key:}") String deepseekApiKey,
            @Value("${ai.deepseek.api-url:}") String deepseekApiUrl,
            @Value("${ai.max-tokens:4096}") Integer maxTokens) {
        this.objectMapper = objectMapper;
        this.deepseekApiKey = deepseekApiKey;
        this.deepseekApiUrl = deepseekApiUrl;
        this.maxTokens = maxTokens;
        this.okHttpClient = createUnsafeOkHttpClient();
        log.info("DeepSeekApiClient initialized with API URL: {}", deepseekApiUrl);
    }

    /**
     * 发送流式聊天请求
     * @param messages 消息列表
     * @param model 模型名称
     * @param enableThinking 是否开启思考模式
     * @param chunkProcessor 处理每个数据块的回调
     * @throws IOException IO异常
     */
    public void streamChat(List<Map<String, String>> messages, String model, boolean enableThinking,
                          BiConsumer<String, String> chunkProcessor) throws IOException {
        String apiUrl = buildApiUrl();
        Map<String, Object> payload = buildPayload(messages, model, true, enableThinking);

        String jsonPayload = objectMapper.writeValueAsString(payload);
        RequestBody body = RequestBody.create(jsonPayload, MediaType.get("application/json; charset=utf-8"));
        Request request = new Request.Builder()
                .url(apiUrl)
                .addHeader("Authorization", "Bearer " + deepseekApiKey)
                .post(body)
                .build();

        try (Response response = okHttpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Unexpected code " + response);
            }
            if (response.body() == null) {
                throw new IOException("Response body is null");
            }

            processStreamResponse(response, chunkProcessor);
        }
    }

    /**
     * 发送非流式聊天请求
     * @param messages 消息列表
     * @param model 模型名称
     * @return AI 响应内容
     * @throws IOException IO异常
     */
    public String chat(List<Map<String, String>> messages, String model) throws IOException {
        String apiUrl = buildApiUrl();
        Map<String, Object> payload = buildPayload(messages, model, false, false);

        String jsonPayload = objectMapper.writeValueAsString(payload);
        RequestBody body = RequestBody.create(jsonPayload, MediaType.get("application/json; charset=utf-8"));
        Request request = new Request.Builder()
                .url(apiUrl)
                .addHeader("Authorization", "Bearer " + deepseekApiKey)
                .post(body)
                .build();

        try (Response response = okHttpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                String errorBody = response.body() != null ? response.body().string() : "null";
                log.error("AI API Error: Code={}, Body={}", response.code(), errorBody);
                throw new IOException("Unexpected code " + response);
            }
            if (response.body() == null) {
                throw new IOException("Response body is null");
            }

            String responseBody = response.body().string();
            JsonNode rootNode = objectMapper.readTree(responseBody);
            if (rootNode.has("choices") && rootNode.get("choices").isArray() && rootNode.get("choices").size() > 0) {
                JsonNode choice = rootNode.get("choices").get(0);
                if (choice.has("message") && choice.get("message").has("content")) {
                    return choice.get("message").get("content").asText();
                }
            }
            return "";
        }
    }

    /**
     * 构建 API URL
     */
    private String buildApiUrl() {
        if (deepseekApiUrl.contains("dashscope.aliyuncs.com")) {
            return deepseekApiUrl + "/v1/chat/completions";
        } else {
            return deepseekApiUrl + "/v1/chat/completions";
        }
    }

    /**
     * 构建请求载荷
     */
    private Map<String, Object> buildPayload(List<Map<String, String>> messages, String model,
                                             boolean stream, boolean enableThinking) {
        String actualModel = normalizeModel(model);
        Map<String, Object> payload = new HashMap<>();
        payload.put("model", actualModel);
        payload.put("messages", messages);
        payload.put("stream", stream);
        payload.put("temperature", 0.6);
        payload.put("max_tokens", maxTokens);
        if (enableThinking) {
            payload.put("enable_thinking", true);
        }
        return payload;
    }

    /**
     * 规范化模型名称
     * 将前端传递的模型名称转换为阿里百炼 API 支持的格式
     */
    private String normalizeModel(String model) {
        if (model == null || model.isEmpty()) {
            return "deepseek-v3";
        }
        String normalized = model.toLowerCase().trim();
        if (normalized.contains("reasoner") || normalized.contains("r1")) {
            return "deepseek-r1";
        }
        if (normalized.contains("coder")) {
            return "deepseek-coder";
        }
        if (normalized.contains("v3") || normalized.contains("chat") || normalized.equals("deepseek")) {
            return "deepseek-v3";
        }
        if (normalized.contains("qwen")) {
            return model;
        }
        return "deepseek-v3";
    }

    /**
     * 处理流式响应
     */
    private void processStreamResponse(Response response, BiConsumer<String, String> chunkProcessor) throws IOException {
        java.io.InputStream is = response.body().byteStream();
        java.io.BufferedReader reader = new java.io.BufferedReader(
            new java.io.InputStreamReader(is, java.nio.charset.StandardCharsets.UTF_8), 8192);
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.isEmpty()) continue;
            if (line.startsWith("data: ")) {
                String data = line.substring(6).trim();
                if ("[DONE]".equals(data)) break;
                try {
                    JsonNode root = objectMapper.readTree(data);
                    JsonNode choices = root.path("choices");
                    if (choices.isArray() && choices.size() > 0) {
                        JsonNode delta = choices.get(0).path("delta");
                        String reasoningContent = delta.path("reasoning_content").asText("");
                        String content = delta.path("content").asText("");
                        if (!reasoningContent.isEmpty() || !content.isEmpty()) {
                            chunkProcessor.accept(content, reasoningContent);
                        }
                    }
                } catch (Exception e) {
                    log.debug("Parse SSE error: {}", e.getMessage());
                }
            }
        }
    }

    /**
     * 创建支持不安全 SSL 的 OkHttpClient
     */
    private OkHttpClient createUnsafeOkHttpClient() {
        try {
            final TrustManager[] trustAllCerts = new TrustManager[]{
                    new X509TrustManager() {
                        @Override
                        public void checkClientTrusted(java.security.cert.X509Certificate[] chain, String authType) throws CertificateException {
                        }
                        @Override
                        public void checkServerTrusted(java.security.cert.X509Certificate[] chain, String authType) throws CertificateException {
                        }
                        @Override
                        public java.security.cert.X509Certificate[] getAcceptedIssuers() {
                            return new java.security.cert.X509Certificate[]{};
                        }
                    }
            };

            final SSLContext sslContext = SSLContext.getInstance("SSL");
            sslContext.init(null, trustAllCerts, new java.security.SecureRandom());
            final SSLSocketFactory sslSocketFactory = sslContext.getSocketFactory();

            OkHttpClient.Builder builder = new OkHttpClient.Builder();
            builder.sslSocketFactory(sslSocketFactory, (X509TrustManager) trustAllCerts[0]);
            builder.hostnameVerifier((hostname, session) -> true);
            builder.connectTimeout(60, TimeUnit.SECONDS)
                   .writeTimeout(60, TimeUnit.SECONDS)
                   .readTimeout(300, TimeUnit.SECONDS);

            return builder.build();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * 获取 OkHttpClient 实例
     */
    public OkHttpClient getOkHttpClient() {
        return okHttpClient;
    }

    /**
     * 获取 API Key
     */
    public String getApiKey() {
        return deepseekApiKey;
    }

    /**
     * 获取 API URL
     */
    public String getApiUrl() {
        return deepseekApiUrl;
    }
}
