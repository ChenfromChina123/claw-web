package com.aispring.service.impl;

import com.aispring.common.ModelConstants;
import com.aispring.common.prompt.PrdPromptConstants;
import com.aispring.dto.PrdStateDto;
import com.aispring.service.AiChatService;
import com.aispring.service.PrdPipelineService;
import com.aispring.service.PrdStreamHolder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * PRD 流水线服务实现
 * 复刻 prd 项目 pipeline：Outline → Draft → Critique（最多 MAX_REVISIONS 轮修订）→ Complete
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PrdPipelineServiceImpl implements PrdPipelineService {

    private final AiChatService aiChatService;
    private final PrdStreamHolder streamHolder;

    @Override
    @Async
    public void runPipelineAsync(String runId, String idea, Long userId) {
        log.info("PRD pipeline started: runId={}, userId={}", runId, userId);
        String content = "# PRD for " + idea + "\n\n*Initial state.*";
        int revision = 0;

        try {
            // 推送初始状态（Outline）
            sendState(runId, "Outline", content, revision, null);

            // Step 1: Outline → 生成大纲
            String outlinePrompt = String.format(PrdPromptConstants.OUTLINE_PROMPT, idea);
            content = aiChatService.ask(outlinePrompt, null, ModelConstants.DEFAULT_MODEL, userId);
            if (content == null || content.isBlank()) {
                content = "# PRD for " + idea + "\n\n*Outline step returned empty.*";
            }
            revision++;
            sendState(runId, "Draft", content, revision, null);

            // Step 2: Draft → 根据大纲写初稿
            String draftPrompt = String.format(PrdPromptConstants.DRAFT_PROMPT, content);
            content = aiChatService.ask(draftPrompt, null, ModelConstants.DEFAULT_MODEL, userId);
            if (content == null || content.isBlank()) {
                content = "# PRD for " + idea + "\n\n*Draft step returned empty.*";
            }
            revision++;
            sendState(runId, "Critique", content, revision, null);

            // Step 3: Critique 循环（最多 MAX_REVISIONS 轮）
            for (int i = 0; i < PrdPromptConstants.MAX_REVISIONS; i++) {
                log.info("Running critique step (Revision {}/{}).", i + 1, PrdPromptConstants.MAX_REVISIONS);
                String critiquePrompt = String.format(PrdPromptConstants.CRITIQUE_PROMPT, content);
                String critique = aiChatService.ask(critiquePrompt, null, ModelConstants.DEFAULT_MODEL, userId);
                if (critique == null) {
                    critique = "";
                }

                if (critique.contains(PrdPromptConstants.APPROVAL_PHRASE)) {
                    log.info("PRD approved. Exiting revision loop.");
                    break;
                }

                String contentWithCritique = content + "\n\n---\n\n## Critique\n\n" + critique;
                revision++;
                sendState(runId, "Critique", contentWithCritique, revision, null);

                log.info("Running revise step (Revision {}/{}).", i + 1, PrdPromptConstants.MAX_REVISIONS);
                String revisePrompt = String.format(PrdPromptConstants.REVISE_PROMPT, content, critique);
                content = aiChatService.ask(revisePrompt, null, ModelConstants.DEFAULT_MODEL, userId);
                if (content == null || content.isBlank()) {
                    content = contentWithCritique;
                }
                revision++;
                sendState(runId, "Critique", content, revision, null);
            }

            // 完成
            sendState(runId, "Complete", content, revision, null);
            log.info("PRD pipeline complete: runId={}", runId);
        } catch (Exception e) {
            log.error("PRD pipeline error: runId=" + runId, e);
            String errorContent = content + "\n\n---\n\n**Pipeline Error:**\n`" + e.getMessage() + "`";
            sendState(runId, "Error", errorContent, revision + 1, null);
        } finally {
            streamHolder.complete(runId);
        }
    }

    /**
     * 构建状态并推送到 SSE
     */
    private void sendState(String runId, String step, String content, int revision, String diff) {
        PrdStateDto state = PrdStateDto.builder()
                .step(step)
                .content(content)
                .revision(revision)
                .diff(diff)
                .build();
        streamHolder.send(runId, state);
    }
}
