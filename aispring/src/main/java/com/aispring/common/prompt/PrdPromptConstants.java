package com.aispring.common.prompt;

/**
 * PRD 生成相关提示词常量
 * 统一管理 PRD 文档生成流水线中使用的所有提示词
 */
public final class PrdPromptConstants {

    private PrdPromptConstants() {
    }

    /**
     * 最大修订轮数
     */
    public static final int MAX_REVISIONS = 3;

    /**
     * 审批通过短语
     */
    public static final String APPROVAL_PHRASE = "No issues found.";

    /**
     * PRD 大纲生成提示词
     */
    public static final String OUTLINE_PROMPT = """
        You are a world-class product manager. Your task is to create a structured
        outline for a Product Requirements Document (PRD) based on a given project idea.

        The outline should cover all standard sections of a PRD, including:
        1.  Executive Summary
        2.  Problem Statement & User Personas
        3.  Goals & Success Metrics
        4.  Functional Requirements (Features)
        5.  Non-Functional Requirements (Performance, Security, etc.)
        6.  Out-of-Scope Items
        7.  Risks & Mitigations

        Please generate a Markdown-formatted outline for the following project idea:

        **Project Idea:** "%s"

        **Instructions:**
        - Use Markdown headings (#, ##, ###) to structure the document.
        - For each section, include a brief, one-sentence placeholder description of what it will contain.
        - Do NOT write the full content of the PRD yet. Just the outline.
        """;

    /**
     * PRD 初稿生成提示词
     */
    public static final String DRAFT_PROMPT = """
        You are a world-class product manager. Your task is to expand a given PRD outline into a full first draft.

        Use the provided outline and flesh out each section with detailed, clear, and concise content. Make reasonable assumptions where necessary, but clearly state them.

        **PRD Outline to Draft:**
        ```markdown
        %s
        ```

        **Instructions:**
        - Write comprehensive content for every section of the outline.
        - Use clear and professional language.
        - Format the output as a complete Markdown document.
        - Ensure the functional requirements are specific and actionable.
        - The draft should be complete enough for a stakeholder to understand the entire scope of the project.
        """;

    /**
     * PRD 评审提示词
     */
    public static final String CRITIQUE_PROMPT = """
        You are a meticulous and critical product manager. Your task is to review a draft of a Product Requirements Document (PRD) and provide constructive feedback.

        Analyze the following PRD draft for clarity, completeness, coherence, and realism. Identify any ambiguities, contradictions, or missing information.

        **PRD Draft to Critique:**
        ```markdown
        %s
        ```

        **Instructions:**
        - Provide your critique as a list of bullet points.
        - For each point, specify the section of the PRD it refers to.
        - Focus on actionable feedback that can be used to improve the document.
        - Be ruthless but fair. The goal is to make the PRD as strong as possible.
        - **If the PRD is well-structured, clear, and comprehensive with no obvious issues, you MUST respond with the exact phrase "No issues found."**
        - Do not add any other text or formatting if you are approving the document.
        """;

    /**
     * PRD 修订提示词
     */
    public static final String REVISE_PROMPT = """
        You are a world-class product manager. Your task is to revise a Product Requirements Document (PRD) draft based on a set of critiques.

        Carefully review the original draft and the provided feedback. Update the PRD to address all the points raised in the critique.

        **Original PRD Draft:**
        ```markdown
        %s
        ```

        **Critique to Address:**
        ```
        %s
        ```

        **Instructions:**
        - Produce a new, complete version of the PRD in Markdown format.
        - Incorporate all the suggested changes from the critique.
        - Ensure the revised document is coherent and consistent.
        - Do not include the critique in the final output. Only the revised PRD.
        """;
}
