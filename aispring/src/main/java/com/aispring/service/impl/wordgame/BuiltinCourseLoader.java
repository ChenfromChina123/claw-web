package com.aispring.service.impl.wordgame;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 内置课程加载器
 * 负责加载内置的星荣零基础英语课程
 */
@Component
@Slf4j
public class BuiltinCourseLoader {

    private static final String BUILTIN_PACKAGE_ID = "xingrong-beginner";
    private final ObjectMapper objectMapper;

    public BuiltinCourseLoader(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 获取内置课程包ID
     */
    public String getBuiltinPackageId() {
        return BUILTIN_PACKAGE_ID;
    }

    /**
     * 检查是否为内置课程包
     */
    public boolean isBuiltinPackage(String packageId) {
        return BUILTIN_PACKAGE_ID.equals(packageId);
    }

    /**
     * 加载内置课程列表
     */
    public List<Map<String, Object>> loadBuiltinCourses() {
        List<Map<String, Object>> result = new ArrayList<>();
        Path dir = builtinCoursesDir();
        if (!Files.exists(dir)) {
            return result;
        }
        try {
            List<Path> files = Files.list(dir)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".json"))
                    .sorted(Comparator.comparingInt(path -> parseCourseIndex(path.getFileName().toString())))
                    .toList();
            for (Path file : files) {
                int index = parseCourseIndex(file.getFileName().toString());
                if (index <= 0) {
                    continue;
                }
                List<Map<String, Object>> statements = objectMapper.readValue(file.toFile(), new TypeReference<>() {});
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("index", index);
                item.put("title", toChineseTitle(index));
                item.put("count", statements.size());
                result.add(item);
            }
        } catch (IOException ignored) {
        }
        return result;
    }

    /**
     * 加载内置课程题目
     */
    public List<Map<String, Object>> loadBuiltinCourseQuestions(int index) {
        Path file = builtinCoursesDir().resolve(String.format("%02d.json", index));
        if (!Files.exists(file)) {
            throw new IllegalArgumentException("课程数据不存在");
        }
        try {
            List<Map<String, Object>> rows = objectMapper.readValue(file.toFile(), new TypeReference<>() {});
            List<Map<String, Object>> result = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("english", WordGameUtils.trimString(row.get("english")));
                item.put("chinese", WordGameUtils.trimString(row.get("chinese")));
                item.put("soundmark", WordGameUtils.trimString(row.get("soundmark")));
                result.add(item);
            }
            return result;
        } catch (IOException e) {
            throw new IllegalArgumentException("课程数据读取失败");
        }
    }

    /**
     * 获取内置课程目录
     */
    private Path builtinCoursesDir() {
        return Path.of(System.getProperty("user.dir"), "..", "packages", "xingrong-courses", "data", "courses")
                .normalize()
                .toAbsolutePath();
    }

    /**
     * 解析课程索引
     */
    private int parseCourseIndex(String fileName) {
        String pure = fileName.replace(".json", "");
        try {
            return Integer.parseInt(pure);
        } catch (Exception e) {
            return -1;
        }
    }

    /**
     * 数字转中文标题
     */
    public String toChineseTitle(int num) {
        String[] nums = {"零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"};
        if (num <= 10) {
            return "第" + nums[num] + "课";
        }
        int tens = num / 10;
        int ones = num % 10;
        String tensStr = tens == 1 ? "" : nums[tens];
        String onesStr = ones == 0 ? "" : nums[ones];
        return "第" + tensStr + "十" + onesStr + "课";
    }
}
