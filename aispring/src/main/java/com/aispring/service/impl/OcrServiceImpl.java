package com.aispring.service.impl;

import com.aispring.service.OcrService;
import com.aliyun.ocr_api20210707.models.RecognizeAllTextRequest;
import com.aliyun.ocr_api20210707.models.RecognizeAllTextResponse;
import com.aliyun.teaopenapi.models.Config;
import com.aliyun.teautil.models.RuntimeOptions;
import com.aliyun.ocr_api20210707.Client;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OCR服务实现类
 * 使用阿里云OCR服务进行文字识别
 */
@Service
public class OcrServiceImpl implements OcrService {

    private Client ocrClient;
    private final ObjectMapper objectMapper;

    /**
     * 初始化阿里云OCR客户端
     */
    public OcrServiceImpl(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        try {
            String accessKeyId = System.getenv("ALIBABA_CLOUD_ACCESS_KEY_ID");
            String accessKeySecret = System.getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET");

            if (accessKeyId == null || accessKeySecret == null) {
                System.err.println("阿里云OCR: 环境变量未配置，请设置 ALIBABA_CLOUD_ACCESS_KEY_ID 和 ALIBABA_CLOUD_ACCESS_KEY_SECRET");
                return;
            }

            Config config = new Config()
                    .setAccessKeyId(accessKeyId)
                    .setAccessKeySecret(accessKeySecret);
            config.endpoint = "ocr-api.cn-hangzhou.aliyuncs.com";

            ocrClient = new Client(config);
            System.out.println("阿里云OCR引擎初始化成功");

        } catch (Exception e) {
            System.err.println("阿里云OCR初始化失败: " + e.getMessage());
            ocrClient = null;
        }
    }

    /**
     * 解析OCR响应结果
     * @param response OCR响应
     * @return 解析后的文本内容
     */
    private String parseOcrResponse(RecognizeAllTextResponse response) {
        try {
            if (response == null || response.getBody() == null) {
                return "";
            }

            // 直接获取响应体数据
            Object body = response.getBody();

            // 尝试将响应体转换为JSON字符串并解析
            String bodyStr = objectMapper.writeValueAsString(body);
            JsonNode rootNode = objectMapper.readTree(bodyStr);

            // 检查是否有数据字段
            if (rootNode.has("data")) {
                JsonNode dataNode = rootNode.get("data");

                // 尝试从content字段获取文本
                if (dataNode.has("content")) {
                    String content = dataNode.get("content").asText();
                    if (content != null && !content.isEmpty()) {
                        return content.trim();
                    }
                }

                // 如果content为空，尝试从subRegins中提取
                if (dataNode.has("subRegins")) {
                    JsonNode subReginsNode = dataNode.get("subRegins");
                    if (subReginsNode.isArray()) {
                        StringBuilder textBuilder = new StringBuilder();
                        for (JsonNode subRegionNode : subReginsNode) {
                            if (subRegionNode.has("text")) {
                                textBuilder.append(subRegionNode.get("text").asText()).append("\n");
                            }
                        }
                        if (textBuilder.length() > 0) {
                            return textBuilder.toString().trim();
                        }
                    }
                }
            }

            return "";

        } catch (Exception e) {
            System.err.println("解析OCR响应失败: " + e.getMessage());
            return "";
        }
    }

    @Override
    public Map<String, Object> recognizeText(MultipartFile file) throws IOException {
        if (ocrClient == null) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", "OCR引擎未初始化");
            return errorResult;
        }

        try {
            // 保存文件到临时目录
            String originalFilename = file.getOriginalFilename();
            String suffix = ".jpg";
            if (originalFilename != null && originalFilename.contains(".")) {
                suffix = originalFilename.substring(originalFilename.lastIndexOf("."));
            }
            File tempFile = File.createTempFile("ocr", suffix);
            try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                fos.write(file.getBytes());
            }

            try {
                // 构建请求
                RecognizeAllTextRequest request = new RecognizeAllTextRequest()
                        .setBody(new java.io.ByteArrayInputStream(java.nio.file.Files.readAllBytes(tempFile.toPath())))
                        .setType("General");
                RuntimeOptions runtime = new RuntimeOptions();

                // 发送请求
                RecognizeAllTextResponse response = ocrClient.recognizeAllTextWithOptions(request, runtime);

                // 解析响应
                String recognizedText = parseOcrResponse(response);

                Map<String, Object> result = new HashMap<>();
                result.put("success", true);
                result.put("text", recognizedText);
                return result;

            } finally {
                // 删除临时文件
                if (tempFile.exists()) {
                    tempFile.delete();
                }
            }

        } catch (Exception e) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", e.getMessage());
            return errorResult;
        }
    }

    @Override
    public Map<String, Object> recognizeTextFromBase64(String base64Image) throws IOException {
        if (ocrClient == null) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", "OCR引擎未初始化");
            return errorResult;
        }

        try {
            // 解码Base64图像数据
            byte[] imageBytes;
            if (base64Image.startsWith("data:image")) {
                base64Image = base64Image.split(",")[1];
            }
            imageBytes = java.util.Base64.getDecoder().decode(base64Image);

            // 保存到临时文件
            File tempFile = File.createTempFile("ocr", ".jpg");
            try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                fos.write(imageBytes);
            }

            try {
                // 构建请求
                RecognizeAllTextRequest request = new RecognizeAllTextRequest()
                        .setBody(new java.io.ByteArrayInputStream(java.nio.file.Files.readAllBytes(tempFile.toPath())))
                        .setType("General");
                RuntimeOptions runtime = new RuntimeOptions();

                // 发送请求
                RecognizeAllTextResponse response = ocrClient.recognizeAllTextWithOptions(request, runtime);

                // 解析响应
                String recognizedText = parseOcrResponse(response);

                Map<String, Object> result = new HashMap<>();
                result.put("success", true);
                result.put("text", recognizedText);
                return result;

            } finally {
                // 删除临时文件
                if (tempFile.exists()) {
                    tempFile.delete();
                }
            }

        } catch (Exception e) {
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("error", e.getMessage());
            return errorResult;
        }
    }

    @Override
    public boolean isAvailable() {
        return ocrClient != null;
    }
}
