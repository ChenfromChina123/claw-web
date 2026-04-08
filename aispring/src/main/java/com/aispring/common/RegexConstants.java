package com.aispring.common;

import java.util.regex.Pattern;

/**
 * 正则表达式常量
 * 统一管理项目中使用的正则表达式模式
 */
public final class RegexConstants {

    private RegexConstants() {
    }

    /**
     * 搜索指令正则模式
     * 匹配格式: <search site="xxx">内容</search>
     */
    public static final Pattern SEARCH_PATTERN = Pattern.compile(
            "<search(?:\\s+site=\"([^\"]+)\")?>(.*?)</search>", Pattern.DOTALL);

    /**
     * URL 获取指令正则模式
     * 匹配格式: <fetch-url>URL</fetch-url>
     */
    public static final Pattern URL_PATTERN = Pattern.compile(
            "<fetch-url>(.*?)</fetch-url>", Pattern.DOTALL);

    /**
     * 词汇查询指令正则模式
     * 匹配格式: <query-vocab topic="xxx" limit="n"/>
     */
    public static final Pattern VOCAB_PATTERN = Pattern.compile(
            "<query-vocab\\s+topic=\"([^\"]+)\"\\s+limit=\"(\\d+)\"\\s*/>", Pattern.DOTALL);
}
