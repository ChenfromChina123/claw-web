package com.aispring.utils;

import org.springframework.http.MediaType;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * 文件工具类
 * 提供文件相关的辅助方法，如 MIME 类型检测等
 */
public class FileUtils {

    private static final Map<String, String> EXTENSION_TO_MIME = new HashMap<>();

    static {
        // 安卓安装包
        EXTENSION_TO_MIME.put("apk", "application/vnd.android.package-archive");
        // 压缩包
        EXTENSION_TO_MIME.put("zip", "application/zip");
        EXTENSION_TO_MIME.put("rar", "application/x-rar-compressed");
        EXTENSION_TO_MIME.put("7z", "application/x-7z-compressed");
        // 文档
        EXTENSION_TO_MIME.put("pdf", "application/pdf");
        EXTENSION_TO_MIME.put("doc", "application/msword");
        EXTENSION_TO_MIME.put("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        EXTENSION_TO_MIME.put("xls", "application/vnd.ms-excel");
        EXTENSION_TO_MIME.put("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        // 脚本/代码
        EXTENSION_TO_MIME.put("sh", "application/x-sh");
        EXTENSION_TO_MIME.put("py", "text/x-python");
        EXTENSION_TO_MIME.put("js", "application/javascript");
        // 图片
        EXTENSION_TO_MIME.put("png", "image/png");
        EXTENSION_TO_MIME.put("jpg", "image/jpeg");
        EXTENSION_TO_MIME.put("jpeg", "image/jpeg");
        EXTENSION_TO_MIME.put("gif", "image/gif");
        EXTENSION_TO_MIME.put("svg", "image/svg+xml");
    }

    /**
     * 获取文件的 MIME 类型
     * 优先根据后缀识别，识别失败则使用 Files.probeContentType
     * 
     * @param path 文件路径
     * @return MIME 类型字符串
     */
    public static String getContentType(Path path) {
        if (path == null) {
            return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        String fileName = path.getFileName().toString().toLowerCase();
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0 && dotIndex < fileName.length() - 1) {
            String extension = fileName.substring(dotIndex + 1);
            String mime = EXTENSION_TO_MIME.get(extension);
            if (mime != null) {
                return mime;
            }
        }

        try {
            String contentType = Files.probeContentType(path);
            if (contentType != null) {
                // 特殊处理：如果 Files.probeContentType 将 apk 识别为 zip，则纠正它
                if (fileName.endsWith(".apk") && contentType.equals("application/zip")) {
                    return "application/vnd.android.package-archive";
                }
                return contentType;
            }
        } catch (IOException ignored) {
        }

        return MediaType.APPLICATION_OCTET_STREAM_VALUE;
    }
}
