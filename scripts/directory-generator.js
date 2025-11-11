// scripts/directory-generator.js
hexo.extend.generator.register('blog-directory', function(locals) {
  // 配置 - 只保留前四个分类
  const CONFIG = {
    categoryOrder: ['个人博客', '技术教程', '游戏相关', '关于我'],
    categoryIcons: {
      '技术教程': '🎯',
      '个人博客': '📝', 
      '游戏相关': '🎮',
      '关于我': '👤'
    }
  };

  console.log('🔧 开始生成目录...');

  // 按分类组织文章
  const categories = {};
  
  // 初始化分类
  CONFIG.categoryOrder.forEach(cat => {
    categories[cat] = [];
  });

  // 处理所有文章
  locals.posts.data.forEach(post => {
    let categoryName = '未分类';
    
    // 多种方式获取分类
    if (post.categories && post.categories.length > 0) {
      // 方式1: 通过分类对象获取
      categoryName = post.categories.data[0].name;
    } else if (post.category) {
      // 方式2: 直接通过category字段获取
      categoryName = post.category;
    } else {
      // 方式3: 从路径推断
      const pathParts = post.source.split('/');
      if (pathParts.length > 2) {
        categoryName = pathParts[pathParts.length - 2];
      }
    }
    
    console.log(`📄 文章 "${post.title}" 分类: ${categoryName}`);
    
    // 只处理配置中的分类
    if (categories[categoryName]) {
      categories[categoryName].push({
        title: post.title,
        permalink: post.permalink,
        date: post.date
      });
    }
  });

  // 生成目录内容
  let markdownContent = `---
title: 博客目录
permalink: /
layout: page
---

## 📚 文章分类

`;

  // 按指定顺序生成分类
  CONFIG.categoryOrder.forEach(category => {
    if (categories[category] && categories[category].length > 0) {
      const icon = CONFIG.categoryIcons[category] || '📁';
      
      markdownContent += `### ${icon} ${category}\n\n`;
      
      // 按日期排序（最新的在前）
      categories[category]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(post => {
          markdownContent += `- [${post.title}](${post.permalink})\n`;
        });
      
      markdownContent += '\n';
    } else {
      console.log(`⚠️  分类 "${category}" 中没有文章`);
    }
  });

  // 添加页脚
  markdownContent += `---

**说明：**
- 点击文章标题即可跳转到对应内容
- 分类按照指定顺序排列
- 文章按发布时间排序（最新的在前）
- 本目录自动生成，最后更新：${new Date().toLocaleDateString('zh-CN')}`;

  console.log('✅ 目录生成完成！');

  return {
    path: 'index.html',
    data: markdownContent,
    layout: ['page', 'post', 'index']
  };
});