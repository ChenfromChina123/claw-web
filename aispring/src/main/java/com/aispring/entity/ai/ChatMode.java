package com.aispring.entity.ai;

/**
 * 聊天模式枚举（参考 void-main 的 ChatMode）
 * 
 * 控制 AI 的行为和工具权限
 * 
 * @author AISpring Team
 * @since 2025-12-23
 */
public enum ChatMode {
    /**
     * Agent 模式：可以执行所有工具，进行代码开发和修改
     * - 可以使用所有工具（读取、编辑、执行命令等）
     * - 可以自主规划和执行任务
     * - 适合复杂的开发任务
     */
    AGENT("agent", "自主操作"),
    
    /**
     * Gather 模式：只能使用读取类工具，用于收集信息
     * - 只能使用读取类工具（read_file, search, ls_dir 等）
     * - 不能进行文件编辑或命令执行
     * - 适合信息收集和分析任务
     */
    GATHER("gather", "信息收集"),
    
    /**
     * Normal 模式：普通对话，不提供工具
     * - 不提供任何工具调用
     * - 纯对话模式
     * - 适合简单的问答和建议
     */
    NORMAL("normal", "普通对话");
    
    private final String code;
    private final String displayName;
    
    ChatMode(String code, String displayName) {
        this.code = code;
        this.displayName = displayName;
    }
    
    public String getCode() {
        return code;
    }
    
    public String getDisplayName() {
        return displayName;
    }
    
    /**
     * 从代码获取枚举值
     */
    public static ChatMode fromCode(String code) {
        for (ChatMode mode : values()) {
            if (mode.code.equalsIgnoreCase(code)) {
                return mode;
            }
        }
        return AGENT; // 默认返回 AGENT
    }
}

