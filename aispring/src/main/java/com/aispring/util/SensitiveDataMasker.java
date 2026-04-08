package com.aispring.util;

import java.util.regex.Pattern;

/**
 * 敏感信息脱敏工具
 * 在请求发送给大模型前对身份证号、手机号等隐私数据进行脱敏（Masking）
 */
public final class SensitiveDataMasker {

    private static final String MASK_PLACEHOLDER = "***";

    /** 中国大陆身份证号：17 位数字 + 1 位数字或 X/x */
    private static final Pattern ID_CARD = Pattern.compile(
            "\\b[1-9]\\d{5}(?:19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[0-9Xx]\\b");

    /** 中国大陆手机号：1 开头 11 位 */
    private static final Pattern PHONE_CN = Pattern.compile(
            "\\b1[3-9]\\d{9}\\b");

    /** 固定电话/带区号：0 开头 10~12 位等常见格式 */
    private static final Pattern PHONE_LANDLINE = Pattern.compile(
            "\\b0\\d{2,3}-?\\d{7,8}\\b");

    /** 邮箱：本地部分@域名 */
    private static final Pattern EMAIL = Pattern.compile(
            "\\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\\b");

    /** 银行卡号：16~19 位连续数字（简单规则，可能误伤） */
    private static final Pattern BANK_CARD = Pattern.compile(
            "\\b\\d{16,19}\\b");

    private SensitiveDataMasker() {
    }

    /**
     * 对文本中的敏感信息进行脱敏，替换为 ***
     *
     * @param text 原始文本，可为 null
     * @return 脱敏后的文本；null 返回 null
     */
    public static String mask(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String result = text;
        result = ID_CARD.matcher(result).replaceAll(MASK_PLACEHOLDER);
        result = PHONE_CN.matcher(result).replaceAll(MASK_PLACEHOLDER);
        result = PHONE_LANDLINE.matcher(result).replaceAll(MASK_PLACEHOLDER);
        result = EMAIL.matcher(result).replaceAll(MASK_PLACEHOLDER);
        result = BANK_CARD.matcher(result).replaceAll(MASK_PLACEHOLDER);
        return result;
    }
}
