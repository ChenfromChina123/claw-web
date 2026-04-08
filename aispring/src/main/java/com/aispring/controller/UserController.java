package com.aispring.controller;

import com.aispring.config.StorageProperties;
import com.aispring.dto.request.ProfileUpdateRequest;
import com.aispring.dto.response.ApiResponse;
import com.aispring.entity.User;
import com.aispring.security.CustomUserDetails;
import com.aispring.service.UserService;
import com.aispring.utils.FileUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Slf4j
public class UserController {
    private final UserService userService;
    private final StorageProperties storageProperties;

    /**
     * 更新用户资料
     */
    @PutMapping("/profile")
    public ResponseEntity<ApiResponse<User>> updateProfile(
            @Valid @RequestBody ProfileUpdateRequest request,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        try {
            if (customUserDetails == null || customUserDetails.getUser() == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error(401, "请先登录"));
            }
            
            Long userId = customUserDetails.getUser().getId();
            User updatedUser = userService.updateUsername(userId, request.getUsername());
            
            return ResponseEntity.ok(ApiResponse.success("资料更新成功", updatedUser));
        } catch (Exception e) {
            log.error("更新资料失败: ", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(500, "更新失败: " + e.getMessage()));
        }
    }

    /**
     * 上传用户头像
     */
    @PostMapping("/upload-avatar")
    public ResponseEntity<ApiResponse<String>> uploadAvatar(
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal CustomUserDetails customUserDetails) {
        
        try {
            if (customUserDetails == null || customUserDetails.getUser() == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error(401, "请先登录"));
            }
            
            if (file == null || file.isEmpty()) {
                return ResponseEntity.badRequest().body(ApiResponse.error(400, "文件不能为空"));
            }

            // 验证文件类型
            String contentType = file.getContentType();
            if (contentType == null || !contentType.startsWith("image/")) {
                return ResponseEntity.badRequest().body(ApiResponse.error(400, "只能上传图片文件"));
            }

            Long userId = customUserDetails.getUser().getId();
            String originalFilename = file.getOriginalFilename();
            String extension = ".jpg"; // 默认扩展名
            if (originalFilename != null && originalFilename.contains(".")) {
                extension = originalFilename.substring(originalFilename.lastIndexOf("."));
            }
            
            // 生成唯一文件名: userId_uuid.ext
            String filename = userId + "_" + UUID.randomUUID().toString().substring(0, 8) + extension;
            
            String avatarsBase = storageProperties.getAvatarsAbsolute();
            if (avatarsBase == null) {
                throw new RuntimeException("无法获取头像存储路径");
            }
            log.info("头像存储基目录: {}", avatarsBase);
            
            Path filePath = Paths.get(avatarsBase).resolve(filename).normalize();
            log.info("目标文件路径: {}", filePath);
            
            // 确保父目录存在
            Path parentDir = filePath.getParent();
            if (parentDir != null && !Files.exists(parentDir)) {
                log.info("创建目录: {}", parentDir);
                Files.createDirectories(parentDir);
            }
            
            // 保存文件
            Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);
            log.info("文件已保存到磁盘");
            
            // 更新数据库中的头像路径
            String avatarPath = "/api/users/avatar/" + filename;
            try {
                userService.updateAvatar(userId, avatarPath);
                log.info("数据库已更新: userId={}, path={}", userId, avatarPath);
            } catch (Exception dbEx) {
                log.error("更新数据库头像路径失败: ", dbEx);
                // 如果数据库更新失败，尝试删除已上传的文件以保持一致性
                Files.deleteIfExists(filePath);
                throw new RuntimeException("更新个人资料失败: " + (dbEx.getMessage() != null ? dbEx.getMessage() : "数据库异常"));
            }
            
            return ResponseEntity.ok(ApiResponse.success("头像上传成功", avatarPath));
            
        } catch (Exception e) {
            log.error("上传头像过程发生异常: ", e);
            String errorMsg = "系统繁忙，请稍后再试";
            if (e != null) {
                if (e.getMessage() != null) {
                    errorMsg = e.getMessage();
                } else {
                    errorMsg = e.getClass().getSimpleName();
                }
            }
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error(500, "上传失败: " + errorMsg));
        }
    }

    @GetMapping("/avatar/{filename:.+}")
    public ResponseEntity<?> getAvatar(@PathVariable String filename) throws IOException {
        Path primary = Paths.get(storageProperties.getAvatarsAbsolute(), filename);
        Path path = Files.exists(primary) ? primary : Paths.get("../../old_pro/py/avatars", filename);
        if (!Files.exists(path)) {
            String fallback;
            Long uid = null;
            int idx = filename.indexOf('_');
            if (idx > 0) {
                try { uid = Long.parseLong(filename.substring(0, idx)); } catch (Exception ignore) {}
            }
            if (uid != null) {
                try {
                    String name = userService.getUserById(uid).getUsername().replace(" ", "+");
                    fallback = String.format("https://ui-avatars.com/api/?name=%s&background=random&color=fff&size=128", name);
                } catch (Exception e) {
                    fallback = "https://ui-avatars.com/api/?name=User&background=random&color=fff&size=128";
                }
            } else {
                fallback = "https://ui-avatars.com/api/?name=User&background=random&color=fff&size=128";
            }
            return ResponseEntity.status(HttpStatus.FOUND).header(HttpHeaders.LOCATION, fallback).build();
        }
        Resource resource = new UrlResource(path.toUri());
        String contentType = FileUtils.getContentType(path);
        MediaType mediaType = contentType != null ? MediaType.parseMediaType(contentType) : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                .body(resource);
    }
}
