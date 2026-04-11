/**
 * 测试 WebSearch API 的脚本（使用代理）
 * 测试 DuckDuckGo Instant Answer API
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// 使用代理端口 9674
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 9674;

function fetchWithProxy(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    
    const options = {
      hostname: PROXY_HOST,
      port: PROXY_PORT,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Host': parsedUrl.hostname,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };
    
    console.log(`通过代理 ${PROXY_HOST}:${PROXY_PORT} 请求...`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function testWebSearch() {
  const query = "Claude AI";
  
  console.log(`正在测试 WebSearch API (带代理)，查询: "${query}"`);
  console.log("=".repeat(60));
  
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`;
    const result = await fetchWithProxy(url);
    
    console.log(`HTTP 状态码: ${result.status}`);
    console.log("\n原始响应内容 (前2000字符):");
    console.log(result.data.substring(0, 2000));
    
    // 尝试解析 JSON
    try {
      const data = JSON.parse(result.data);
      console.log("\n\n解析成功! 关键信息:");
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
    console.log("\n可能的解决方案:");
    console.log("1. 检查代理是否运行");
    console.log("2. 检查网络连接");
    console.log("3. DuckDuckGo API 可能需要特殊请求头");
  }
}

// 运行测试
testWebSearch();
