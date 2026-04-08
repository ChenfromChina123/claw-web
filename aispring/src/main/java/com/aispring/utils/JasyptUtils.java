package com.aispring.utils;

import org.jasypt.encryption.pbe.PooledPBEStringEncryptor;
import org.jasypt.encryption.pbe.config.SimpleStringPBEConfig;

/**
 * Jasypt 加密工具类
 * 用于对配置文件中的敏感信息进行加密
 */
public class JasyptUtils {

    /**
     * 加密方法
     * @param password 盐值（密钥）
     * @param value 要加密的明文
     * @return 加密后的密文
     */
    public static String encrypt(String password, String value) {
        PooledPBEStringEncryptor encryptor = new PooledPBEStringEncryptor();
        SimpleStringPBEConfig config = new SimpleStringPBEConfig();
        config.setPassword(password);
        config.setAlgorithm("PBEWithMD5AndDES");
        config.setKeyObtentionIterations("1000");
        config.setPoolSize("1");
        config.setProviderName("SunJCE");
        config.setSaltGeneratorClassName("org.jasypt.salt.RandomSaltGenerator");
        config.setIvGeneratorClassName("org.jasypt.iv.NoIvGenerator");
        config.setStringOutputType("base64");
        encryptor.setConfig(config);
        return encryptor.encrypt(value);
    }

    public static void main(String[] args) {
        // 默认盐值，实际运行时建议通过环境变量 jasypt.encryptor.password 传入
        String password = "aistudy_secret";
        
        System.out.println("--- Jasypt Encryption Tool ---");
        System.out.println("Salt: " + password);
        
        String[] values = {
            "123456",                                   // DB Password (dev)
            "dinasyxqstbodbej",                         // Mail Password
            "sk-7f17e997c31e4d82bf0286116ad34226",       // DeepSeek API Key
            "xGDswMCdHhsajfxF"                          // DB Password (prod)
        };
        
        for (String val : values) {
            String encrypted = encrypt(password, val);
            System.out.println("\nOriginal: " + val);
            System.out.println("Encrypted: ENC(" + encrypted + ")");
        }
    }
}
