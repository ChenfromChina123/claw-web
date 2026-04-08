package com.aispring.service;

import com.aispring.entity.Feedback;
import com.aispring.repository.FeedbackRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 反馈服务
 * 对应Python: app.py中的反馈相关功能
 */
@Service
@RequiredArgsConstructor
public class FeedbackService {
    
    private final FeedbackRepository feedbackRepository;
    
    /**
     * 创建反馈
     */
    @Transactional
    public Feedback createFeedback(Long userId, String type, String title, String content) {
        Feedback feedback = Feedback.builder()
            .userId(userId)
            .type(type)
            .feedbackType(type)
            .title(title)
            .content(content)
            .status("pending")
            .build();
        
        return feedbackRepository.save(feedback);
    }
    
    /**
     * 获取用户的所有反馈
     */
    public List<Feedback> getUserFeedback(Long userId) {
        return feedbackRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }
    
    /**
     * 根据ID获取反馈
     */
    public Feedback getFeedbackById(Long id) {
        return feedbackRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("反馈不存在"));
    }
    
    /**
     * 管理员：获取所有反馈
     */
    public List<Feedback> getAllFeedback() {
        return feedbackRepository.findAllByOrderByCreatedAtDesc();
    }
    
    /**
     * 管理员：更新反馈状态
     */
    @Transactional
    public Feedback updateFeedbackStatus(Long id, String status, String adminReply) {
        Feedback feedback = getFeedbackById(id);
        feedback.setStatus(status);
        if (adminReply != null) {
            feedback.setAdminReply(adminReply);
        }
        return feedbackRepository.save(feedback);
    }
    
    /**
     * 管理员：删除反馈
     */
    @Transactional
    public void deleteFeedback(Long id) {
        feedbackRepository.deleteById(id);
    }
}

