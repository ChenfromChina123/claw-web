package com.aispring.common;

import java.util.Map;

/**
 * 代码执行相关常量
 * 统一管理代码执行服务的配置参数
 */
public final class CodeExecutionConstants {

    private CodeExecutionConstants() {
    }

    /**
     * 最大输出长度（100KB）
     */
    public static final int MAX_OUTPUT_LENGTH = 102400;

    /**
     * 编程语言对应文件名映射
     */
    public static final Map<String, String> FILE_NAME_MAP = Map.ofEntries(
            Map.entry("python", "main.py"),
            Map.entry("javascript", "main.js"),
            Map.entry("typescript", "main.ts"),
            Map.entry("java", "Main.java"),
            Map.entry("c", "main.c"),
            Map.entry("cpp", "main.cpp"),
            Map.entry("csharp", "main.cs"),
            Map.entry("go", "main.go"),
            Map.entry("rust", "main.rs"),
            Map.entry("ruby", "main.rb"),
            Map.entry("php", "main.php"),
            Map.entry("swift", "main.swift"),
            Map.entry("kotlin", "main.kt")
    );
}
