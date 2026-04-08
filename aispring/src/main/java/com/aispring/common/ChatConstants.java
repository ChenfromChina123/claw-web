package com.aispring.common;

/**
 * 聊天相关常量
 * 统一管理聊天服务的配置参数
 */
public final class ChatConstants {

    private ChatConstants() {
    }

    /**
     * 图片元数据前缀
     */
    public static final String IMAGE_META_PREFIX = "IMG_META_JSON:";

    /**
     * 最大图片数量
     */
    public static final int MAX_IMAGE_COUNT = 3;

    /**
     * 单个图片项最大长度
     */
    public static final int MAX_IMAGE_ITEM_LENGTH = 14000;

    /**
     * 图片元数据最大长度
     */
    public static final int MAX_IMAGE_META_LENGTH = 50000;
}
