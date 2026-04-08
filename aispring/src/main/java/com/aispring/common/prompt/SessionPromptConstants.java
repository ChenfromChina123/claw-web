package com.aispring.common.prompt;

/**
 * 会话元数据相关提示词常量
 * 统一管理会话标题和建议生成中使用的所有提示词
 */
public final class SessionPromptConstants {

    private SessionPromptConstants() {
    }

    /**
     * 会话标题和建议生成基础提示词
     */
    public static final String SESSION_METADATA_BASE_PROMPT =
            "你是一个中文助手，需要基于【当前用户询问】（最重要）以及【历史用户询问】（仅供参考）生成结果。\n" +
            "仅输出 JSON，不要输出任何额外文字（包括 Markdown/代码块）。\n" +
            "请生成 3 个\"用户视角\"的下一步追问（用户对助手说的话），要求：\n" +
            "1) 每个都是完整问题，优先更具体、更可执行；\n" +
            "2) 不要以 AI 口吻表达（如\"我可以为你.../我还能...\"），不要自称\"AI/助手\"；\n" +
            "3) 不要复述历史问题，不要照抄历史原句；\n" +
            "4) 每个问题 8~25 个汉字，末尾使用\"？\"。\n";

    /**
     * 标题生成附加提示词
     */
    public static final String TITLE_GENERATION_SUFFIX =
            "由于这是会话的第一条消息，请同时生成一个简短的标题（不超过15个字）。\n";

    /**
     * 默认建议问题1
     */
    public static final String DEFAULT_SUGGESTION_1 = "我下一步应该先做什么？";

    /**
     * 默认建议问题2
     */
    public static final String DEFAULT_SUGGESTION_2 = "你能给我一个可执行的步骤清单吗？";

    /**
     * 默认建议问题3
     */
    public static final String DEFAULT_SUGGESTION_3 = "有哪些常见坑需要我提前避免？";
}
