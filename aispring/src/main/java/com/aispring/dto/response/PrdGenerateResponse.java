package com.aispring.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * PRD 生成启动响应，返回 runId 供前端订阅 SSE
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PrdGenerateResponse {

    /** 本次生成任务 ID，用于 GET /api/requirements/prd/stream/{runId} */
    private String runId;
}
