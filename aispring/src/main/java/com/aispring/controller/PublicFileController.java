package com.aispring.controller;

import com.aispring.config.StorageProperties;
import com.aispring.dto.response.ApiResponse;
import com.aispring.utils.FileUtils;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@RestController
@RequestMapping("/api/public-files")
@RequiredArgsConstructor
public class PublicFileController {

    private final StorageProperties storageProperties;

    @GetMapping
    public ResponseEntity<ApiResponse<List<PublicFileInfo>>> listFiles() {
        try {
            String pathStr = storageProperties.getPublicFilesAbsolute();
            Path path = Paths.get(pathStr);
            if (!Files.exists(path)) {
                Files.createDirectories(path);
            }

            try (Stream<Path> stream = Files.list(path)) {
                List<PublicFileInfo> files = stream
                    .filter(Files::isRegularFile)
                    .map(p -> {
                        try {
                            BasicFileAttributes attrs = Files.readAttributes(p, BasicFileAttributes.class);
                            return new PublicFileInfo(
                                p.getFileName().toString(),
                                attrs.size(),
                                attrs.lastModifiedTime().toMillis()
                            );
                        } catch (IOException e) {
                            log.error("Error reading file attributes: " + p, e);
                            return null;
                        }
                    })
                    .filter(f -> f != null)
                    .collect(Collectors.toList());
                return ResponseEntity.ok(ApiResponse.success("获取公共文件列表成功", files));
            }
        } catch (IOException e) {
            log.error("Failed to list public files", e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(500, "获取文件列表失败"));
        }
    }

    @GetMapping("/download/{filename:.+}")
    public ResponseEntity<Resource> downloadFile(@PathVariable String filename) {
        return downloadFileFromSubDir(null, filename);
    }

    @GetMapping("/download/{subdir}/{filename:.+}")
    public ResponseEntity<Resource> downloadFileFromSubDir(
            @PathVariable(required = false) String subdir,
            @PathVariable String filename) {
        try {
            Path base = Paths.get(storageProperties.getPublicFilesAbsolute());
            if (subdir != null && !subdir.isEmpty()) {
                base = base.resolve(subdir);
            }
            Path file = base.resolve(filename).normalize();
            Resource resource = new UrlResource(file.toUri());

            if (resource.exists() || resource.isReadable()) {
                String contentType = FileUtils.getContentType(file);
                String resourceFilename = resource.getFilename();
                
                // 针对 APK 文件，强制使用正确的 MIME 类型
                if (resourceFilename != null && resourceFilename.toLowerCase().endsWith(".apk")) {
                    contentType = "application/vnd.android.package-archive";
                }
                
                String encodedFilename = java.net.URLEncoder.encode(resourceFilename, "UTF-8").replace("+", "%20");

                HttpHeaders headers = new HttpHeaders();
                headers.set(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + encodedFilename + "\"; filename*=UTF-8''" + encodedFilename);
                headers.set(HttpHeaders.CONTENT_TYPE, contentType);
                // 禁止浏览器 MIME 嗅探
                headers.set("X-Content-Type-Options", "nosniff");
                headers.setContentLength(resource.contentLength());
                // 支持断点续传
                headers.set("Accept-Ranges", "bytes");

                return ResponseEntity.ok()
                        .headers(headers)
                        .body(resource);
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (IOException e) {
            log.error("Failed to download public file: " + filename, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @PostMapping("/upload")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<String>> uploadFile(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(ApiResponse.error(400, "文件不能为空"));
        }
        try {
            String filename = file.getOriginalFilename();
            // 防止路径遍历攻击
            if (filename == null || filename.contains("..")) {
                 return ResponseEntity.badRequest().body(ApiResponse.error(400, "非法的文件名"));
            }
            
            Path targetLocation = Paths.get(storageProperties.getPublicFilesAbsolute()).resolve(filename);
            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);
            return ResponseEntity.ok(ApiResponse.success("上传成功", filename));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(ApiResponse.error(500, "上传失败: " + e.getMessage()));
        }
    }

    @DeleteMapping("/{filename:.+}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<String>> deleteFile(@PathVariable String filename) {
        try {
            // 防止路径遍历攻击
            if (filename == null || filename.contains("..")) {
                 return ResponseEntity.badRequest().body(ApiResponse.error(400, "非法的文件名"));
            }
            
            Path targetLocation = Paths.get(storageProperties.getPublicFilesAbsolute()).resolve(filename).normalize();
            
            if (Files.exists(targetLocation)) {
                Files.delete(targetLocation);
                return ResponseEntity.ok(ApiResponse.success("删除成功", filename));
            } else {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error(404, "文件不存在"));
            }
        } catch (IOException e) {
            log.error("Failed to delete public file: " + filename, e);
            return ResponseEntity.internalServerError().body(ApiResponse.error(500, "删除失败: " + e.getMessage()));
        }
    }

    @Data
    public static class PublicFileInfo {
        private String name;
        private long size;
        private long lastModified;

        public PublicFileInfo(String name, long size, long lastModified) {
            this.name = name;
            this.size = size;
            this.lastModified = lastModified;
        }
    }
}
