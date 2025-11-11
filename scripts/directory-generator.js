// 博客根目录/scripts/directory-generator.js
hexo.extend.generator.register('blog-directory', function(locals) {
  const CONFIG = {
    categoryOrder: ['个人博客', '技术教程', '游戏相关', '关于我'],
    categoryIcons: {
      '技术教程': '🎯',
      '个人博客': '📝', 
      '游戏相关': '🎮',
      '关于我': '👤'
    }
  };

  console.log('🔧 开始生成博客目录...');
  console.log('📝 总文章数:', locals.posts.length);

  // 按分类组织文章
  const categories = {};
  CONFIG.categoryOrder.forEach(cat => {
    categories[cat] = [];
  });

  // 处理所有文章
  locals.posts.each(function(post) {
    let categoryName = '未分类';
    
    // 获取分类名称
    if (post.categories && post.categories.length > 0) {
      // Hexo 3.x+ 使用 .data 属性
      if (post.categories.data && post.categories.data.length > 0) {
        categoryName = post.categories.data[0].name;
      } 
      // Hexo 2.x 或直接访问
      else if (post.categories.length > 0 && typeof post.categories[0] === 'object') {
        categoryName = post.categories[0].name;
      }
    }
    
    console.log(`📄 文章: "${post.title}", 分类: ${categoryName}`);
    
    if (categories[categoryName]) {
      categories[categoryName].push({
        title: post.title,
        permalink: post.permalink,
        date: post.date
      });
    }
  });

  // 生成 Markdown 内容
  let markdownContent = `---
title: 博客目录
date: ${new Date().toISOString()}
permalink: /
layout: page
comments: false
---

## 📚 文章分类

`;

  let hasContent = false;

  // 按指定顺序生成分类
  CONFIG.categoryOrder.forEach(category => {
    if (categories[category] && categories[category].length > 0) {
      hasContent = true;
      const icon = CONFIG.categoryIcons[category];
      
      markdownContent += `### ${icon} ${category}\n\n`;
      
      // 按日期排序（最新的在前）
      categories[category]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(post => {
          markdownContent += `- [${post.title}](${post.permalink})\n`;
        });
      
      markdownContent += '\n';
    }
  });

  // 如果没有内容，显示提示
  if (!hasContent) {
    markdownContent += `暂无文章，请先添加一些文章到对应的分类文件夹中。\n\n`;
  }

  // 添加页脚
  markdownContent += `---

**说明：**
- 点击文章标题即可跳转到对应内容
- 分类按照指定顺序排列  
- 文章按发布时间排序（最新的在前）
- 本目录自动生成，最后更新：${new Date().toLocaleDateString('zh-CN')}`;

  console.log('✅ 博客目录生成完成！');

  return {
    path: 'index.html',
    data: markdownContent
  };
});