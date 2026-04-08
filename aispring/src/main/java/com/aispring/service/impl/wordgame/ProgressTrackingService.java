package com.aispring.service.impl.wordgame;

import com.aispring.entity.WordGameProgress;
import com.aispring.repository.WordGameProgressRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 进度追踪服务
 * 负责用户学习进度的保存和查询
 */
@Component
@RequiredArgsConstructor
public class ProgressTrackingService {

    private final WordGameProgressRepository progressRepository;

    /**
     * 获取用户在指定课程包的进度
     * @param userId 用户ID
     * @param packageId 课程包ID
     * @return 进度数据
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getProgress(Long userId, String packageId) {
        if (packageId == null || packageId.isBlank()) {
            throw new IllegalArgumentException("packageId 不能为空");
        }
        List<WordGameProgress> rows = progressRepository.findByUserIdAndPackageId(userId, packageId);
        Map<String, Object> data = new LinkedHashMap<>();
        for (WordGameProgress row : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("currentQuestion", row.getCurrentQuestion());
            item.put("completed", Boolean.TRUE.equals(row.getCompleted()));
            item.put("studySeconds", row.getStudySeconds());
            item.put("updatedAt", row.getUpdatedAt().toString());
            data.put(String.valueOf(row.getCourseIndex()), item);
        }
        return data;
    }

    /**
     * 保存用户学习进度
     * @param userId 用户ID
     * @param body 进度数据
     */
    @Transactional
    public void saveProgress(Long userId, Map<String, Object> body) {
        String packageId = trimString(body.get("packageId"));
        Integer courseIndex = asIntObj(body.get("courseIndex"));
        if (packageId.isBlank() || courseIndex == null) {
            throw new IllegalArgumentException("packageId 和 courseIndex 必填");
        }
        WordGameProgress progress = progressRepository.findByUserIdAndPackageIdAndCourseIndex(userId, packageId, courseIndex)
                .orElse(WordGameProgress.builder()
                        .userId(userId)
                        .packageId(packageId)
                        .courseIndex(courseIndex)
                        .build());
        progress.setCurrentQuestion(asInt(body.get("currentQuestion"), 0));
        progress.setCompleted(asBoolean(body.get("completed")));
        progress.setStudySeconds(asInt(body.get("studySeconds"), 0));
        progress.setUpdatedAt(LocalDateTime.now());
        progressRepository.save(progress);
    }

    /**
     * 迁移进度（当前已统一登录态，无需迁移）
     */
    public Map<String, Object> migrateProgress(Long userId, Map<String, Object> body) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("migrated", 0);
        result.put("message", "当前已统一登录态，无需迁移");
        return result;
    }

    private String trimString(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private int asInt(Object value, int fallback) {
        Integer v = asIntObj(value);
        return v == null ? fallback : v;
    }

    private Integer asIntObj(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    private boolean asBoolean(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value == null) {
            return false;
        }
        return "true".equalsIgnoreCase(String.valueOf(value));
    }
}
