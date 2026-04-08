package com.aispring.config;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.format.DateTimeFormatter;

@Configuration
public class JacksonConfig {

    private static final String DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
        return builder -> {
            // 使用SnakeCase命名策略（下划线命名），以匹配前端Vue应用中的字段名
            // 前端期望：file_id, file_name, file_size, upload_time, file_type
            // 实体类字段：id, filename, fileSize, uploadTime, fileType
            builder.propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE);
            
            // 配置日期时间格式化
            builder.serializers(new LocalDateTimeSerializer(DateTimeFormatter.ofPattern(DATETIME_FORMAT)));
        };
    }
}
