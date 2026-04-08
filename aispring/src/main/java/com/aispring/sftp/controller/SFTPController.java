package com.aispring.sftp.controller;

import com.aispring.sftp.dto.FileInfo;
import com.aispring.sftp.dto.TransferProgress;
import com.aispring.sftp.service.SFTPService;
import com.aispring.sftp.service.TransferProgressService;
import com.aispring.util.JwtUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SFTP 文件管理控制器
 * 提供远程服务器文件操作的 REST API
 */
@Slf4j
@RestController
@RequestMapping("/api/sftp")
public class SFTPController {

    private SFTPService sftpService;
    private TransferProgressService progressService;
    private JwtUtil jwtUtil;

    @Autowired
    public void setSftpService(SFTPService sftpService) {
        this.sftpService = sftpService;
    }

    @Autowired
    public void setProgressService(TransferProgressService progressService) {
        this.progressService = progressService;
    }

    @Autowired
    public void setJwtUtil(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    /**
     * 获取目录文件列表
     * @param serverId 服务器 ID
     * @param path 目录路径
     * @return 文件列表
     */
    @GetMapping("/{serverId}/files")
    public ResponseEntity<Map<String, Object>> listFiles(
            @PathVariable Long serverId,
            @RequestParam(defaultValue = "/") String path) {
        try {
            List<FileInfo> files = sftpService.listFiles(serverId, path);

            Map<String, Object> result = new HashMap<>();
            result.put("path", path);
            result.put("files", files);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "获取成功",
                "data", result
            ));
        } catch (Exception e) {
            log.error("获取文件列表失败: serverId={}, path={}, error={}", serverId, path, e.getMessage());
            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "获取文件列表失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 上传文件
     * @param serverId 服务器 ID
     * @param path 目标目录路径
     * @param file 上传的文件
     * @param request HTTP 请求
     * @return 上传结果
     */
    @PostMapping("/{serverId}/upload")
    public ResponseEntity<Map<String, Object>> uploadFile(
            @PathVariable Long serverId,
            @RequestParam String path,
            @RequestParam("file") MultipartFile file,
            HttpServletRequest request) {

        String taskId = UUID.randomUUID().toString();
        String userId = getCurrentUserId(request);
        String fileName = file.getOriginalFilename();
        String remotePath = path.endsWith("/") ? path + fileName : path + "/" + fileName;

        try {
            long fileSize = file.getSize();

            try (InputStream inputStream = file.getInputStream()) {
                sftpService.uploadFile(serverId, remotePath, inputStream, fileSize, progress -> {
                    progress.setTaskId(taskId);
                    progressService.sendProgressUpdate(userId, taskId, progress);
                });
            }

            TransferProgress completed = TransferProgress.builder()
                .taskId(taskId)
                .fileName(fileName)
                .filePath(remotePath)
                .totalSize(fileSize)
                .transferredSize(fileSize)
                .progress(100)
                .status(TransferProgress.TransferStatus.COMPLETED)
                .build();
            progressService.forceSendProgress(userId, taskId, completed);

            log.info("文件上传成功: serverId={}, path={}, size={}", serverId, remotePath, fileSize);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "上传成功",
                "data", Map.of(
                    "taskId", taskId,
                    "fileName", fileName,
                    "path", remotePath,
                    "size", fileSize
                )
            ));

        } catch (Exception e) {
            log.error("文件上传失败: serverId={}, path={}, error={}", serverId, remotePath, e.getMessage());

            TransferProgress failed = TransferProgress.builder()
                .taskId(taskId)
                .fileName(fileName)
                .filePath(remotePath)
                .status(TransferProgress.TransferStatus.FAILED)
                .errorMessage(e.getMessage())
                .build();
            progressService.forceSendProgress(userId, taskId, failed);

            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "上传失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 下载文件
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @param request HTTP 请求
     * @param response HTTP 响应
     */
    @GetMapping("/{serverId}/download")
    public void downloadFile(
            @PathVariable Long serverId,
            @RequestParam String path,
            HttpServletRequest request,
            HttpServletResponse response) {

        String taskId = UUID.randomUUID().toString();
        String userId = getCurrentUserId(request);
        String fileName = path.substring(path.lastIndexOf('/') + 1);

        try {
            FileInfo fileInfo = sftpService.getFileInfo(serverId, path);

            if (fileInfo.isDirectory()) {
                response.setContentType("application/json");
                response.getWriter().write("{\"code\":400,\"message\":\"不能下载目录，请选择文件\"}");
                return;
            }

            long fileSize = fileInfo.getSize();

            String encodedFileName = URLEncoder.encode(fileName, StandardCharsets.UTF_8)
                .replaceAll("\\+", "%20");

            response.setContentType("application/octet-stream");
            response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodedFileName);
            response.setHeader("X-Task-Id", taskId);
            response.setHeader("X-File-Size", String.valueOf(fileSize));

            try (OutputStream outputStream = response.getOutputStream()) {
                sftpService.downloadFile(serverId, path, outputStream, progress -> {
                    progress.setTaskId(taskId);
                    try {
                        progressService.sendProgressUpdate(userId, taskId, progress);
                    } catch (Exception ex) {
                        log.error("发送进度更新失败：{}", ex.getMessage());
                    }
                });

                TransferProgress completed = TransferProgress.builder()
                    .taskId(taskId)
                    .fileName(fileName)
                    .filePath(path)
                    .totalSize(fileSize)
                    .transferredSize(fileSize)
                    .progress(100)
                    .status(TransferProgress.TransferStatus.COMPLETED)
                    .build();
                progressService.forceSendProgress(userId, taskId, completed);

                log.info("文件下载成功：serverId={}, path={}", serverId, path);

            } catch (Exception e) {
                log.error("文件下载失败：serverId={}, path={}, error={}", serverId, path, e.getMessage());

                TransferProgress failed = TransferProgress.builder()
                    .taskId(taskId)
                    .fileName(fileName)
                    .filePath(path)
                    .status(TransferProgress.TransferStatus.FAILED)
                    .errorMessage(e.getMessage())
                    .build();
                try {
                    progressService.forceSendProgress(userId, taskId, failed);
                } catch (Exception ex) {
                    log.error("发送失败进度更新失败：{}", ex.getMessage());
                }
            }

        } catch (Exception e) {
            log.error("文件下载失败: serverId={}, path={}, error={}", serverId, path, e.getMessage());
            try {
                response.setContentType("application/json");
                response.getWriter().write("{\"code\":500,\"message\":\"下载失败: " + e.getMessage() + "\"}");
            } catch (IOException ex) {
                log.error("写入错误响应失败：{}", ex.getMessage());
            }
        }
    }

    /**
     * 删除文件或目录
     * @param serverId 服务器 ID
     * @param path 文件/目录路径
     * @param isDirectory 是否为目录
     * @return 删除结果
     */
    @DeleteMapping("/{serverId}/file")
    public ResponseEntity<Map<String, Object>> deleteFile(
            @PathVariable Long serverId,
            @RequestParam String path,
            @RequestParam(defaultValue = "false") boolean isDirectory) {
        try {
            if (isDirectory) {
                sftpService.deleteDirectory(serverId, path);
            } else {
                sftpService.deleteFile(serverId, path);
            }

            log.info("删除成功: serverId={}, path={}, isDirectory={}", serverId, path, isDirectory);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "删除成功"
            ));

        } catch (Exception e) {
            log.error("删除失败: serverId={}, path={}, error={}", serverId, path, e.getMessage());
            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "删除失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 重命名文件或目录
     * @param serverId 服务器 ID
     * @param oldPath 原路径
     * @param newPath 新路径
     * @return 重命名结果
     */
    @PutMapping("/{serverId}/rename")
    public ResponseEntity<Map<String, Object>> rename(
            @PathVariable Long serverId,
            @RequestParam String oldPath,
            @RequestParam String newPath) {
        try {
            sftpService.rename(serverId, oldPath, newPath);

            log.info("重命名成功: serverId={}, {} -> {}", serverId, oldPath, newPath);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "重命名成功"
            ));

        } catch (Exception e) {
            log.error("重命名失败: serverId={}, {} -> {}, error={}", serverId, oldPath, newPath, e.getMessage());
            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "重命名失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 创建目录
     * @param serverId 服务器 ID
     * @param path 目录路径
     * @return 创建结果
     */
    @PostMapping("/{serverId}/mkdir")
    public ResponseEntity<Map<String, Object>> mkdir(
            @PathVariable Long serverId,
            @RequestParam String path) {
        try {
            sftpService.mkdir(serverId, path);

            log.info("创建目录成功: serverId={}, path={}", serverId, path);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "创建成功"
            ));

        } catch (Exception e) {
            log.error("创建目录失败: serverId={}, path={}, error={}", serverId, path, e.getMessage());
            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "创建失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 检查路径是否存在
     * @param serverId 服务器 ID
     * @param path 路径
     * @return 是否存在
     */
    @GetMapping("/{serverId}/exists")
    public ResponseEntity<Map<String, Object>> exists(
            @PathVariable Long serverId,
            @RequestParam String path) {
        try {
            boolean exists = sftpService.exists(serverId, path);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "查询成功",
                "data", Map.of("exists", exists)
            ));

        } catch (Exception e) {
            log.error("检查路径失败: serverId={}, path={}, error={}", serverId, path, e.getMessage());
            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "查询失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 获取文件信息
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @return 文件信息
     */
    @GetMapping("/{serverId}/info")
    public ResponseEntity<Map<String, Object>> getFileInfo(
            @PathVariable Long serverId,
            @RequestParam String path) {
        try {
            FileInfo fileInfo = sftpService.getFileInfo(serverId, path);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "获取成功",
                "data", fileInfo
            ));

        } catch (Exception e) {
            log.error("获取文件信息失败: serverId={}, path={}, error={}", serverId, path, e.getMessage());
            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "获取失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 获取文件内容
     * @param serverId 服务器 ID
     * @param path 文件路径
     * @param maxSize 最大读取大小（可选，默认 1MB）
     * @return 文件内容
     */
    @GetMapping("/{serverId}/content")
    public ResponseEntity<Map<String, Object>> getFileContent(
            @PathVariable Long serverId,
            @RequestParam String path,
            @RequestParam(defaultValue = "1048576") long maxSize) {
        try {
            String content = sftpService.readFileContent(serverId, path, maxSize);

            return ResponseEntity.ok(Map.of(
                "code", 200,
                "message", "获取成功",
                "content", content
            ));

        } catch (Exception e) {
            log.error("获取文件内容失败: serverId={}, path={}, error={}", serverId, path, e.getMessage());
            return ResponseEntity.ok(Map.of(
                "code", 500,
                "message", "获取失败: " + e.getMessage()
            ));
        }
    }

    /**
     * 从请求中获取当前用户 ID
     * @param request HTTP 请求
     * @return 用户 ID
     */
    private String getCurrentUserId(HttpServletRequest request) {
        String token = request.getHeader("Authorization");
        if (token != null && token.startsWith("Bearer ")) {
            token = token.substring(7);
            try {
                return jwtUtil.extractUsername(token);
            } catch (Exception e) {
                log.warn("解析 token 失败: {}", e.getMessage());
            }
        }
        return "anonymous";
    }
}
