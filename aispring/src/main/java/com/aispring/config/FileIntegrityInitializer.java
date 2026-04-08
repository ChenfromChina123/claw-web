package com.aispring.config;

import com.aispring.service.CloudDiskService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 文件完整性初始化器
 * 在系统启动时自动检查并清理数据库中存在但物理文件不存在的记录
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileIntegrityInitializer implements CommandLineRunner {

    private final CloudDiskService cloudDiskService;

    @Value("${app.file.auto-cleanup-on-startup:true}")
    private boolean autoCleanupOnStartup;

    @Override
    public void run(String... args) throws Exception {
        if (!autoCleanupOnStartup) {
            log.info("文件自动清理已禁用，跳过启动时清理");
            return;
        }

        log.info("=================================================================");
        log.info("开始系统启动文件完整性检查...");
        log.info("=================================================================");

        try {
            // 首先验证文件
            Map<String, Object> verifyResult = cloudDiskService.verifyAllFiles();
            int totalFiles = (int) verifyResult.get("totalFiles");
            int validFiles = (int) verifyResult.get("validFiles");
            int missingFiles = (int) verifyResult.get("missingFiles");

            log.info("文件验证完成:");
            log.info("  - 总文件数: {}", totalFiles);
            log.info("  - 有效文件: {}", validFiles);
            log.info("  - 缺失文件: {}", missingFiles);

            // 如果有缺失的文件，执行清理
            if (missingFiles > 0) {
                log.warn("检测到 {} 个物理文件缺失的数据库记录，开始清理...", missingFiles);
                
                Map<String, Object> cleanupResult = cloudDiskService.cleanupOrphanFiles();
                int deletedCount = (int) cleanupResult.get("deletedCount");
                
                log.info("清理完成: 已删除 {} 条孤立的数据库记录", deletedCount);
                
                // 打印删除的文件详情
                if (deletedCount > 0 && log.isDebugEnabled()) {
                    @SuppressWarnings("unchecked")
                    var deletedFiles = (java.util.List<Map<String, Object>>) cleanupResult.get("deletedFiles");
                    log.debug("已删除的记录详情:");
                    for (Map<String, Object> file : deletedFiles) {
                        log.debug("  - 文件ID: {}, 用户ID: {}, 文件名: {}, 路径: {}", 
                            file.get("fileId"), 
                            file.get("userId"), 
                            file.get("filename"), 
                            file.get("filepath"));
                    }
                }
            } else {
                log.info("所有文件完整性检查通过，无需清理");
            }

        } catch (Exception e) {
            log.error("文件完整性检查失败: {}", e.getMessage(), e);
            // 不抛出异常，避免影响应用启动
        }

        log.info("=================================================================");
        log.info("文件完整性检查完成");
        log.info("=================================================================");
    }
}

