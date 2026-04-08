package com.aispring.service;

/**
 * PRD 流水线服务接口
 * 对应 prd 项目 run_pipeline：Outline → Draft → Critique（多轮修订）→ Complete
 */
public interface PrdPipelineService {

    /**
     * 异步启动 PRD 生成流水线，通过 PrdStreamHolder 推送各步骤状态
     *
     * @param runId  本次任务 ID，与前端订阅 SSE 的 runId 一致
     * @param idea   项目想法 / 高层需求描述
     * @param userId 用户 ID，用于调用 AI 与计费
     */
    void runPipelineAsync(String runId, String idea, Long userId);
}
