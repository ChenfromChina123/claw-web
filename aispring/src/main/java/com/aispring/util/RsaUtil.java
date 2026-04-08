package com.aispring.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * RSA加密解密工具类
 * 用于前端加密敏感信息，后端解密
 */
@Slf4j
@Component
public class RsaUtil {
    
    private static final String ALGORITHM = "RSA";
    private static final String TRANSFORMATION = "RSA/ECB/PKCS1Padding";
    private static final int KEY_SIZE = 2048;
    
    // 存储公钥和私钥
    private String publicKey;
    private String privateKey;
    
    public RsaUtil() {
        try {
            generateKeyPair();
        } catch (Exception e) {
            log.error("初始化RSA密钥对失败", e);
        }
    }
    
    /**
     * 生成RSA密钥对
     */
    public void generateKeyPair() throws NoSuchAlgorithmException {
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance(ALGORITHM);
        keyPairGenerator.initialize(KEY_SIZE);
        KeyPair keyPair = keyPairGenerator.generateKeyPair();
        
        PublicKey pubKey = keyPair.getPublic();
        PrivateKey privKey = keyPair.getPrivate();
        
        this.publicKey = Base64.getEncoder().encodeToString(pubKey.getEncoded());
        this.privateKey = Base64.getEncoder().encodeToString(privKey.getEncoded());
        
        log.info("RSA密钥对生成成功");
    }
    
    /**
     * 获取公钥
     */
    public String getPublicKey() {
        return publicKey;
    }
    
    /**
     * 使用私钥解密
     */
    public String decrypt(String encryptedData) throws Exception {
        byte[] decodedKey = Base64.getDecoder().decode(privateKey);
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(decodedKey);
        KeyFactory keyFactory = KeyFactory.getInstance(ALGORITHM);
        PrivateKey privKey = keyFactory.generatePrivate(keySpec);
        
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, privKey);
        
        byte[] encryptedBytes = Base64.getDecoder().decode(encryptedData);
        byte[] decryptedBytes = cipher.doFinal(encryptedBytes);
        
        return new String(decryptedBytes);
    }
    
    /**
     * 使用公钥加密
     */
    public String encrypt(String plainText) throws Exception {
        byte[] decodedKey = Base64.getDecoder().decode(publicKey);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(decodedKey);
        KeyFactory keyFactory = KeyFactory.getInstance(ALGORITHM);
        PublicKey pubKey = keyFactory.generatePublic(keySpec);
        
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, pubKey);
        
        byte[] encryptedBytes = cipher.doFinal(plainText.getBytes());
        
        return Base64.getEncoder().encodeToString(encryptedBytes);
    }
}