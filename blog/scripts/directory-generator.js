// scripts/directory-generator.js
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  categoryOrder: ['个人博客', '技术教程', '游戏相关', '关于我'],
  categoryIcons: {
    '技术教程': '🎯',
    '个人博客': '📝', 
    '游戏相关': '🎮',
    '关于我': '👤',
  },
  categoryNames: {
    'games': '游戏集合'
  }
};

hexo.extend.generator.register('blog-directory', function(locals) {
  // 按分类组织文章
  const categories = {};
  
  // 初始化分类
  CONFIG.categoryOrder.forEach(cat => {
    categories[cat] = [];
  });

  // 处理所有文章
  locals.posts.forEach(post => {
    // 获取文章的分类（第一个分类）
    const category = post.categories && post.categories.length > 0 
      ? post.categories.data[0].name 
      : '未分类';
    
    if (categories[category]) {
      categories[category].push({
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
      const displayName = CONFIG.categoryNames[category] || category;
      
      markdownContent += `### ${icon} ${displayName}\n\n`;
      
      // 按日期排序（最新的在前）
      categories[category]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(post => {
          markdownContent += `- [${post.title}](${post.permalink})\n`;
        });
      
      markdownContent += '\n';
    }
  });

  // 添加页脚
  markdownContent += `---

**说明：**
- 点击文章标题即可跳转到对应内容
- 分类按照指定顺序排列
- 文章按发布时间排序（最新的在前）
- 本目录自动生成，最后更新：${new Date().toLocaleDateString('zh-CN')}`;

  return {
    path: 'index.html',
    data: markdownContent,
    layout: ['page', 'post', 'index']
  };
});