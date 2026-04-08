package com.aispring.dto.response;

import lombok.Builder;
import lombok.Data;

/**
 * 统一API响应包装类
 * 用于统一前后端API响应格式
 */
@Data
@Builder
public class ApiResponse<T> {
    private int code;
    private String message;
    private T data;
    private Object error;

    /**
     * 成功响应
     * @param data 响应数据
     * @return 统一API响应
     * @param <T> 数据类型
     */
    public static <T> ApiResponse<T> success(T data) {
        return ApiResponse.<T>builder()
                .code(200)
                .message("操作成功")
                .data(data)
                .build();
    }

    /**
     * 成功响应（带自定义消息）
     * @param message 自定义消息
     * @param data 响应数据
     * @return 统一API响应
     * @param <T> 数据类型
     */
    public static <T> ApiResponse<T> success(String message, T data) {
        return ApiResponse.<T>builder()
                .code(200)
                .message(message)
                .data(data)
                .build();
    }

    /**
     * 错误响应
     * @param code 错误码
     * @param message 错误消息
     * @return 统一API响应
     * @param <T> 数据类型
     */
    public static <T> ApiResponse<T> error(int code, String message) {
        return ApiResponse.<T>builder()
                .code(code)
                .message(message)
                .build();
    }

    /**
     * 错误响应（带错误详情）
     * @param code 错误码
     * @param message 错误消息
     * @param error 错误详情
     * @return 统一API响应
     * @param <T> 数据类型
     */
    public static <T> ApiResponse<T> error(int code, String message, Object error) {
        return ApiResponse.<T>builder()
                .code(code)
                .message(message)
                .error(error)
                .build();
    }
}