package com.aispring.common;

import java.time.format.DateTimeFormatter;

/**
 * 日期时间常量类
 * 统一管理日期时间格式化器，避免重复创建
 */
public final class DateTimeConstants {

    private DateTimeConstants() {
    }

    /**
     * 标准日期时间格式
     */
    public static final String DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";

    /**
     * 标准日期时间格式化器（线程安全）
     */
    public static final DateTimeFormatter DATETIME_FORMATTER =
            DateTimeFormatter.ofPattern(DATETIME_FORMAT);

    /**
     * 日期格式
     */
    public static final String DATE_FORMAT = "yyyy-MM-dd";

    /**
     * 日期格式化器
     */
    public static final DateTimeFormatter DATE_FORMATTER =
            DateTimeFormatter.ofPattern(DATE_FORMAT);

    /**
     * 时间格式
     */
    public static final String TIME_FORMAT = "HH:mm:ss";

    /**
     * 时间格式化器
     */
    public static final DateTimeFormatter TIME_FORMATTER =
            DateTimeFormatter.ofPattern(TIME_FORMAT);
}
