package com.aispring.service;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * OCR服务接口
 * 提供文字识别相关功能
 */
public interface OcrService {
    
    /**
     * 识别图像中的文字
     * 
     * @param file 图像文件
     * @return 识别结果，包含文本内容
     * @throws IOException 如果文件处理失败
     */
    Map<String, Object> recognizeText(MultipartFile file) throws IOException;
    
    /**
     * 识别Base64编码的图像中的文字
     * 
     * @param base64Image Base64编码的图像数据
     * @return 识别结果，包含文本内容
     * @throws IOException 如果图像处理失败
     */
    Map<String, Object> recognizeTextFromBase64(String base64Image) throws IOException;
    
    /**
     * 检查OCR服务是否可用
     * 
     * @return 是否可用
     */
    boolean isAvailable();
}
