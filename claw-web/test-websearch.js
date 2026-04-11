/**
 * 测试 WebSearch API 的脚本
 * 测试 DuckDuckGo Instant Answer API
 */

async function testWebSearch() {
  const query = "Claude AI";
  
  console.log(`正在测试 WebSearch API，查询: "${query}"`);
  console.log("=".repeat(60));
  
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    console.log(`HTTP 状态码: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const text = await response.text();
    console.log("\n原始响应内容:");
    console.log(text.substring(0, 2000));
    
    // 尝试解析 JSON
    try {
      const data = JSON.parse(text);
      console.log("\n解析后的数据:");
      console.log(JSON.stringify(data, null, 2).substring(0, 3000));
      
      // 提取关键字段
      console.log("\n关键信息:");
      console.log(`- Heading: ${data.Heading || 'N/A'}`);
      console.log(`- AbstractText: ${data.AbstractText ? data.AbstractText.substring(0, 200) + '...' : 'N/A'}`);
      console.log(`- AbstractURL: ${data.AbstractURL || 'N/A'}`);
      console.log(`- RelatedTopics 数量: ${data.RelatedTopics?.length || 0}`);
      
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        console.log("\n相关主题 (前3个):");
        data.RelatedTopics.slice(0, 3).forEach((topic, i) => {
          console.log(`  ${i + 1}. ${topic.Text?.substring(0, 100) || 'N/A'}`);
        });
      }
    } catch (e) {
      console.log("\nJSON 解析失败，响应可能不是标准 JSON 格式");
    }
    
  } catch (error) {
    console.error("测试失败:", error.message);
  }
}

// 运行测试
testWebSearch();
