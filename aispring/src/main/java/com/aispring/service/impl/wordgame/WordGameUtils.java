package com.aispring.service.impl.wordgame;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 单词游戏工具类
 * 提供通用的字符串处理和类型转换方法
 */
public final class WordGameUtils {

    private WordGameUtils() {
    }

    /**
     * 匹配搜索关键词
     */
    public static boolean matchSearch(String name, String description, String search) {
        if (search == null || search.isBlank()) {
            return true;
        }
        String term = search.toLowerCase();
        return (name != null && name.toLowerCase().contains(term))
                || (description != null && description.toLowerCase().contains(term));
    }

    /**
     * 字符串修剪
     */
    public static String trimString(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    /**
     * 默认值处理
     */
    public static String defaultIfBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    /**
     * 字符串截断
     */
    public static String cut(String value, int maxLen) {
        if (value == null) {
            return "";
        }
        if (value.length() <= maxLen) {
            return value;
        }
        return value.substring(0, maxLen);
    }

    /**
     * 空字符串转 null
     */
    public static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * 转换为 int
     */
    public static int asInt(Object value, int fallback) {
        Integer v = asIntObj(value);
        return v == null ? fallback : v;
    }

    /**
     * 转换为 Integer
     */
    public static Integer asIntObj(Object value) {
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

    /**
     * 转换为 boolean
     */
    public static boolean asBoolean(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value == null) {
            return false;
        }
        return "true".equalsIgnoreCase(String.valueOf(value));
    }

    /**
     * 读取 sections 列表
     */
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> readSections(Map<String, Object> body) {
        Object sections = body.get("sections");
        if (!(sections instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> result = new java.util.ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                result.add(new LinkedHashMap<>((Map<String, Object>) map));
            }
        }
        return result;
    }

    /**
     * 读取 statements 列表
     */
    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> readStatements(Object source) {
        if (!(source instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> result = new java.util.ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                result.add(new LinkedHashMap<>((Map<String, Object>) map));
            }
        }
        return result;
    }

    /**
     * 包装旧版 statements 格式
     */
    public static List<Map<String, Object>> wrapLegacyStatements(Map<String, Object> body) {
        List<Map<String, Object>> statements = readStatements(body.get("statements"));
        if (statements.isEmpty()) {
            return List.of();
        }
        Map<String, Object> first = new LinkedHashMap<>();
        first.put("title", "第一课");
        first.put("statements", statements);
        return List.of(first);
    }
}
