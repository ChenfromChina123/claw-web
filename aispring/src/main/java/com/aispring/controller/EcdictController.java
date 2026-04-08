package com.aispring.controller;

import com.aispring.dto.response.ApiResponse;
import com.aispring.service.EcdictImportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * ECDICT 词典库导入控制器
 * 提供词库管理和导入功能
 */
@Slf4j
@RestController
@RequestMapping("/api/admin/dict")
@RequiredArgsConstructor
public class EcdictController {

    private final EcdictImportService ecdictImportService;

    /**
     * 获取词库统计信息
     */
    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalWords", ecdictImportService.getWordCount());
        stats.put("isImported", ecdictImportService.isImported());
        return ResponseEntity.ok(ApiResponse.success(stats));
    }

    /**
     * 触发词库导入（从 ECDICT 下载）
     */
    @PostMapping("/import")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importDict() {
        log.info("用户触发 ECDICT 词库导入...");

        try {
            long count = ecdictImportService.downloadAndImport();
            Map<String, Object> result = new HashMap<>();
            result.put("importedCount", count);
            result.put("totalWords", ecdictImportService.getWordCount());
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("ECDICT 词库导入失败", e);
            return ResponseEntity.internalServerError()
                    .body(ApiResponse.error(500, "词库导入失败: " + e.getMessage()));
        }
    }

    /**
     * 从本地文件导入词库
     */
    @PostMapping("/import/file")
    public ResponseEntity<ApiResponse<Map<String, Object>>> importFromFile(@RequestParam String filePath) {
        log.info("用户触发本地文件导入: {}", filePath);

        try {
            long count = ecdictImportService.importFromFile(filePath);
            Map<String, Object> result = new HashMap<>();
            result.put("importedCount", count);
            result.put("totalWords", ecdictImportService.getWordCount());
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("本地文件导入失败", e);
            return ResponseEntity.internalServerError()
                    .body(ApiResponse.error(500, "文件导入失败: " + e.getMessage()));
        }
    }
}
