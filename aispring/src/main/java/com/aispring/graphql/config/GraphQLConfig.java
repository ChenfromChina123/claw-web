package com.aispring.graphql.config;

import graphql.scalars.ExtendedScalars;
import graphql.schema.GraphQLScalarType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.graphql.execution.RuntimeWiringConfigurer;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * GraphQL 配置类
 * 配置自定义标量类型和运行时行为
 * 
 * 暂时禁用以修复启动问题
 */
// @Configuration
public class GraphQLConfig {

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    /**
     * 配置 GraphQL 运行时
     * 注册自定义标量类型
     */
    @Bean
    public RuntimeWiringConfigurer runtimeWiringConfigurer() {
        return wiringBuilder -> wiringBuilder
                // 注册 Long 标量类型（用于 ID 等大数值）
                .scalar(ExtendedScalars.GraphQLLong)
                // 注册自定义 DateTime 标量类型
                .scalar(dateTimeScalar());
    }

    /**
     * 自定义 DateTime 标量类型
     * 用于处理 LocalDateTime 与前端的序列化/反序列化
     */
    private GraphQLScalarType dateTimeScalar() {
        return GraphQLScalarType.newScalar()
                .name("DateTime")
                .description("Java LocalDateTime as ISO-8601 string")
                .coercing(new graphql.schema.Coercing<LocalDateTime, String>() {
                    @Override
                    public String serialize(Object dataFetcherResult) {
                        if (dataFetcherResult instanceof LocalDateTime) {
                            return ((LocalDateTime) dataFetcherResult).format(FORMATTER);
                        }
                        return null;
                    }

                    @Override
                    public LocalDateTime parseValue(Object input) {
                        if (input instanceof String) {
                            return LocalDateTime.parse((String) input, FORMATTER);
                        }
                        return null;
                    }

                    @Override
                    public LocalDateTime parseLiteral(Object input) {
                        if (input instanceof String) {
                            return LocalDateTime.parse((String) input, FORMATTER);
                        }
                        return null;
                    }
                })
                .build();
    }
}
