package com.aispring.service;

/**
 * ECDICT 词典库导入服务接口
 * 用于从 skywind3000/ECDICT 下载并导入300万+词库
 */
public interface EcdictImportService {

    /**
     * 下载并导入 ECDICT 词典库
     * @return 导入的词汇数量
     */
    long downloadAndImport();

    /**
     * 批量导入本地 ECDICT 文件
     * @param filePath 文件路径
     * @return 导入的词汇数量
     */
    long importFromFile(String filePath);

    /**
     * 获取当前词库统计信息
     * @return 词汇总数
     */
    long getWordCount();

    /**
     * 检查词库是否已导入
     * @return true 如果已导入
     */
    boolean isImported();
}
