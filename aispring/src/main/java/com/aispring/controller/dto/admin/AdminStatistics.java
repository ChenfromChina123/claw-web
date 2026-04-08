package com.aispring.controller.dto.admin;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * 管理员统计数据 DTO
 */
@Data
public class AdminStatistics {
    @JsonProperty("totalUsers")
    private long totalUsers;

    @JsonProperty("totalChats")
    private long totalChats;

    @JsonProperty("totalFiles")
    private long totalFiles;

    @JsonProperty("totalStorage")
    private long totalStorage;
}
