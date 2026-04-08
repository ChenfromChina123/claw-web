-- 插入示例外部链接数据
INSERT INTO external_links (title, url, description, image_url, click_count, is_active, sort_order, created_at, updated_at)
VALUES
    ('GitHub - 全球最大的代码托管平台',
     'https://github.com',
     '全球最大的开源代码托管平台，汇聚数百万开发者。探索开源项目、协作开发、版本控制，加速您的编程之旅。',
     'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
     0, TRUE, 1, NOW(), NOW()),
    
    ('Stack Overflow - 程序员问答社区',
     'https://stackoverflow.com',
     '全球最大的程序员问答社区，数百万技术问题和专业解答。从初学者到资深工程师，都能在这里找到帮助。',
     'https://cdn.sstatic.net/Sites/stackoverflow/Img/apple-touch-icon@2.png',
     0, TRUE, 2, NOW(), NOW()),
    
    ('MDN Web Docs - Web 开发权威文档',
     'https://developer.mozilla.org',
     'Mozilla 维护的 Web 技术权威文档，涵盖 HTML、CSS、JavaScript 等，是 Web 开发者的必备参考手册。',
     'https://developer.mozilla.org/apple-touch-icon.png',
     0, TRUE, 3, NOW(), NOW()),
    
    ('LeetCode - 算法刷题平台',
     'https://leetcode.com',
     '全球领先的编程算法练习平台，助你提升编程能力、准备技术面试。支持多种编程语言，题库丰富且持续更新。',
     'https://leetcode.com/favicon.png',
     0, TRUE, 4, NOW(), NOW()),
    
    ('菜鸟教程 - 编程学习网站',
     'https://www.runoob.com',
     '提供简单易懂的编程教程，涵盖前端、后端、数据库、移动开发等。适合初学者入门和进阶学习。',
     'https://static.runoob.com/images/favicon.ico',
     0, TRUE, 5, NOW(), NOW()),
    
    ('Hugging Face - AI 模型社区',
     'https://huggingface.co',
     '全球最大的 AI 模型和数据集社区，提供开源模型、数据集、演示应用。从 NLP 到计算机视觉，应有尽有。',
     'https://huggingface.co/front/assets/huggingface_logo.svg',
     0, TRUE, 6, NOW(), NOW()),
    
    ('DeepSeek - AI 大模型平台',
     'https://www.deepseek.com',
     '国内领先的 AI 大模型平台，提供强大的对话、编程、写作等能力。支持 API 调用，助力开发者构建智能应用。',
     NULL,
     0, TRUE, 7, NOW(), NOW()),
    
    ('Vue.js - 渐进式 JavaScript 框架',
     'https://vuejs.org',
     '易学易用、性能出色、适用场景丰富的前端框架。渐进式的设计让你可以逐步采用，从简单的交互到复杂的 SPA。',
     'https://vuejs.org/logo.svg',
     0, TRUE, 8, NOW(), NOW());
