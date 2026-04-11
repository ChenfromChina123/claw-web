/**
 * 测试 SearXNG 或其他可用搜索引擎 API
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 代理配置
const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 9674;
const USE_PROXY = true;

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    
    let requestOptions;
    
    if (USE_PROXY) {
      requestOptions = {
        hostname: PROXY_HOST,
        port: PROXY_PORT,
        path: url,  // 完整 URL 作为路径
        method: options.method || 'GET',
        headers: {
          ...options.headers,
          'Host': parsedUrl.hostname,
        }
      };
    } else {
      requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers
      };
    }
    
    const client = USE_PROXY ? http : (parsedUrl.protocol === 'https:' ? https : http);
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function testSearXNG() {
  console.log("测试 SearXNG 实例...");
  console.log("=".repeat(60));
  
  // 一些公共 SearXNG 实例
  const instances = [
    'https://searx.be/search?q=Claude+AI&format=json',
    'https://search.sapti.me/search?q=Claude+AI&format=json',
    'https://search.bus-hit.me/search?q=Claude+AI&format=json',
  ];
  
  for (const url of instances) {
    console.log(`\n尝试: ${url.substring(0, 50)}...`);
    try {
      const result = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      console.log(`  状态码: ${result.status}`);
      
      if (result.status === 200) {
        try {
          const data = JSON.parse(result.data);
          console.log('  成功! 结果数:', data.results?.length || 0);
          if (data.results && data.results.length > 0) {
            console.log('  第一个结果:', data.results[0].title?.substring(0, 80));
          }
          return data;
        } catch (e) {
          console.log('  JSON 解析失败');
        }
      }
    } catch (error) {
      console.log(`  失败: ${error.message}`);
    }
  }
  
  return null;
}

async function testBingSearch() {
  console.log("\n\n测试 Bing 搜索 (HTML 抓取)...");
  console.log("=".repeat(60));
  
  try {
    const url = 'https://www.bing.com/search?q=Claude+AI';
    const result = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    console.log(`状态码: ${result.status}`);
    
    if (result.status === 200) {
      // 简单提取标题
      const titles = result.data.match(/<h2[^>]*>(.*?)<\/h2>/gi);
      console.log(`找到 ${titles?.length || 0} 个标题`);
      if (titles && titles.length > 0) {
        console.log('前3个标题:');
        titles.slice(0, 3).forEach((t, i) => {
          const text = t.replace(/<[^>]+>/g, '').substring(0, 80);
          console.log(`  ${i + 1}. ${text}`);
        });
      }
    }
  } catch (error) {
    console.log(`失败: ${error.message}`);
  }
}

async function testGoogleSearch() {
  console.log("\n\n测试 Google 搜索 (HTML 抓取)...");
  console.log("=".repeat(60));
  
  try {
    const url = 'https://www.google.com/search?q=Claude+AI';
    const result = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    console.log(`状态码: ${result.status}`);
    
    if (result.status === 200) {
      console.log('响应长度:', result.data.length);
      // 检查是否有人机验证
      if (result.data.includes('captcha') || result.data.includes('unusual traffic')) {
        console.log('注意: 可能遇到了人机验证');
      }
    }
  } catch (error) {
    console.log(`失败: ${error.message}`);
  }
}

// 运行所有测试
async function runTests() {
  console.log("搜索引擎 API 测试");
  console.log("代理:", USE_PROXY ? `${PROXY_HOST}:${PROXY_PORT}` : '无');
  console.log("=".repeat(60));
  
  await testSearXNG();
  await testBingSearch();
  await testGoogleSearch();
  
  console.log("\n\n测试完成!");
}

runTests().catch(console.error);
