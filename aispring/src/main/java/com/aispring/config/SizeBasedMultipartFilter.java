package com.aispring.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 基于文件大小的上传过滤器
 * 不限制上传时间，仅监控上传大小，超过限制则断开连接并返回友好提示
 */
@Slf4j
@Component
public class SizeBasedMultipartFilter implements Filter {

    @Value("${spring.servlet.multipart.max-file-size:1048576000}") // 默认1000MB (1GB)
    private String maxFileSize;

    @Value("${spring.servlet.multipart.max-request-size:1048576000}") // 默认1000MB (1GB)
    private String maxRequestSize;

    /**
     * 解析大小字符串为字节数（支持KB, MB, GB）
     */
    private long parseSize(String size) {
        if (size == null || size.trim().isEmpty()) {
            return Long.MAX_VALUE;
        }
        
        String upperSize = size.toUpperCase().trim();
        long multiplier = 1;
        String numStr = upperSize;
        
        if (upperSize.endsWith("KB")) {
            multiplier = 1024L;
            numStr = upperSize.substring(0, upperSize.length() - 2).trim();
        } else if (upperSize.endsWith("MB")) {
            multiplier = 1024L * 1024L;
            numStr = upperSize.substring(0, upperSize.length() - 2).trim();
        } else if (upperSize.endsWith("GB")) {
            multiplier = 1024L * 1024L * 1024L;
            numStr = upperSize.substring(0, upperSize.length() - 2).trim();
        } else if (upperSize.endsWith("B")) {
            numStr = upperSize.substring(0, upperSize.length() - 1).trim();
        }
        
        try {
            return Long.parseLong(numStr) * multiplier;
        } catch (NumberFormatException e) {
            log.warn("无法解析文件大小配置: {}, 使用默认值", size);
            return 1000L * 1024L * 1024L; // 默认1000MB (1GB)
        }
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        
        // 仅对文件上传请求进行处理
        String contentType = httpRequest.getContentType();
        if (contentType == null || !contentType.toLowerCase().contains("multipart/form-data")) {
            chain.doFilter(request, response);
            return;
        }
        
        // 获取Content-Length头
        long contentLength = httpRequest.getContentLengthLong();
        long maxSize = parseSize(maxRequestSize);
        
        // 如果Content-Length已经超过限制，立即拒绝
        if (contentLength > maxSize) {
            String errorMsg = String.format("文件大小超过限制。当前: %s, 限制: %s", 
                formatSize(contentLength), formatSize(maxSize));
            log.warn("拒绝上传请求: {}", errorMsg);
            sendErrorResponse(httpResponse, 413, errorMsg);
            return;
        }
        
        // 包装请求以监控实际读取的字节数
        SizeMonitoringRequest wrappedRequest = new SizeMonitoringRequest(httpRequest, maxSize);
        
        try {
            chain.doFilter(wrappedRequest, response);
        } catch (SizeLimitExceededException e) {
            String errorMsg = String.format("上传文件大小超过限制。已上传: %s, 限制: %s", 
                formatSize(e.getActualSize()), formatSize(e.getMaxSize()));
            log.warn("上传过程中超过大小限制: {}", errorMsg);
            sendErrorResponse(httpResponse, 413, errorMsg);
        }
    }

    /**
     * 发送错误响应
     */
    private void sendErrorResponse(HttpServletResponse response, int status, String message) 
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        
        String jsonResponse = String.format(
            "{\"success\":false,\"code\":%d,\"message\":\"%s\",\"data\":null}",
            status, message
        );
        
        response.getWriter().write(jsonResponse);
        response.getWriter().flush();
    }

    /**
     * 格式化文件大小显示
     */
    private String formatSize(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        } else if (bytes < 1024 * 1024) {
            return String.format("%.2f KB", bytes / 1024.0);
        } else if (bytes < 1024 * 1024 * 1024) {
            return String.format("%.2f MB", bytes / (1024.0 * 1024.0));
        } else {
            return String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0));
        }
    }

    /**
     * 监控上传大小的HttpServletRequest包装类
     */
    private static class SizeMonitoringRequest extends jakarta.servlet.http.HttpServletRequestWrapper {
        private final long maxSize;
        private final AtomicLong bytesRead = new AtomicLong(0);
        
        public SizeMonitoringRequest(HttpServletRequest request, long maxSize) {
            super(request);
            this.maxSize = maxSize;
        }
        
        @Override
        public ServletInputStream getInputStream() throws IOException {
            ServletInputStream originalStream = super.getInputStream();
            
            return new ServletInputStream() {
                @Override
                public int read() throws IOException {
                    int b = originalStream.read();
                    if (b != -1) {
                        long current = bytesRead.incrementAndGet();
                        if (current > maxSize) {
                            throw new SizeLimitExceededException(current, maxSize);
                        }
                    }
                    return b;
                }
                
                @Override
                public int read(byte[] b, int off, int len) throws IOException {
                    int count = originalStream.read(b, off, len);
                    if (count > 0) {
                        long current = bytesRead.addAndGet(count);
                        if (current > maxSize) {
                            throw new SizeLimitExceededException(current, maxSize);
                        }
                    }
                    return count;
                }
                
                @Override
                public boolean isFinished() {
                    return originalStream.isFinished();
                }
                
                @Override
                public boolean isReady() {
                    return originalStream.isReady();
                }
                
                @Override
                public void setReadListener(ReadListener readListener) {
                    originalStream.setReadListener(readListener);
                }
            };
        }
    }

    /**
     * 文件大小超限异常
     */
    private static class SizeLimitExceededException extends IOException {
        private final long actualSize;
        private final long maxSize;
        
        public SizeLimitExceededException(long actualSize, long maxSize) {
            super("文件大小超过限制");
            this.actualSize = actualSize;
            this.maxSize = maxSize;
        }
        
        public long getActualSize() {
            return actualSize;
        }
        
        public long getMaxSize() {
            return maxSize;
        }
    }
}

