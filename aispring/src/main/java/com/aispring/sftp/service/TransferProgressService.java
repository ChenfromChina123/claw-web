package com.aispring.sftp.service;

import com.aispring.sftp.dto.TransferProgress;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 传输进度服务
 * 提供带节流的进度推送功能
 */
@Slf4j
@Service
public class TransferProgressService {

    private final Map<String, Long> lastPushTime = new ConcurrentHashMap<>();
    
    private static final long THROTTLE_INTERVAL_MS = 200;
    
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    public void setMessagingTemplate(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * 发送进度更新（带节流）
     * @param userId 用户 ID
     * @param taskId 任务 ID
     * @param progress 进度信息
     */
    public void sendProgressUpdate(String userId, String taskId, TransferProgress progress) {
        long now = System.currentTimeMillis();
        Long lastTime = lastPushTime.get(taskId);
        
        if (lastTime != null && (now - lastTime) < THROTTLE_INTERVAL_MS 
            && progress.getStatus() == TransferProgress.TransferStatus.TRANSFERRING) {
            return;
        }
        
        lastPushTime.put(taskId, now);
        
        try {
            messagingTemplate.convertAndSendToUser(
                userId, 
                "/queue/sftp/progress", 
                progress
            );
            log.debug("进度推送: taskId={}, progress={}%, speed={}", 
                taskId, progress.getProgress(), progress.getSpeed());
        } catch (Exception e) {
            log.warn("进度推送失败: taskId={}, error={}", taskId, e.getMessage());
        }
    }

    /**
     * 强制发送进度更新（不节流）
     * 用于发送完成、失败等关键状态
     * @param userId 用户 ID
     * @param taskId 任务 ID
     * @param progress 进度信息
     */
    public void forceSendProgress(String userId, String taskId, TransferProgress progress) {
        lastPushTime.put(taskId, System.currentTimeMillis());
        
        try {
            messagingTemplate.convertAndSendToUser(
                userId, 
                "/queue/sftp/progress", 
                progress
            );
            log.info("强制进度推送: taskId={}, status={}", taskId, progress.getStatus());
        } catch (Exception e) {
            log.error("强制进度推送失败: taskId={}, error={}", taskId, e.getMessage());
        }
    }

    /**
     * 清除任务的推送时间记录
     * @param taskId 任务 ID
     */
    public void clearTask(String taskId) {
        lastPushTime.remove(taskId);
    }

    /**
     * 清除所有任务的推送时间记录
     */
    public void clearAll() {
        lastPushTime.clear();
    }
}
