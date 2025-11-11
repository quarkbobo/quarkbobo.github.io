// scripts/blog-directory-generator.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

hexo.extend.generator.register('blog-directory', function(locals) {
  const postsDir = path.join(hexo.source_dir, '_posts');
  const categories = {
    '技术教程': { icon: '🎯', posts: [] },
    '个人博客': { icon: '📝', posts: [] },
    '游戏相关': { icon: '🎮', posts: [] },
    '关于我': { icon: '👤', posts: [] }
  };

  console.log('🔧 开始生成博客目录...');

  // 遍历所有分类文件夹
  Object.keys(categories).forEach(category => {
    const categoryDir = path.join(postsDir, category);
    
    if (fs.existsSync(categoryDir)) {
      console.log(`📁 处理分类: ${category}`);
      
      const files = fs.readdirSync(categoryDir);
      
      files.forEach(file => {
        if (file.endsWith('.md')) {
          const filePath = path.join(categoryDir, file);
          try {
            // 明确指定UTF-8编码读取
            const content = fs.readFileSync(filePath, { encoding: 'utf8' });
            const frontMatter = parseFrontMatter(content);
            
            if (frontMatter && frontMatter.title) {
              const postInfo = {
                title: frontMatter.title,
                permalink: frontMatter.permalink || generatePermalink(file, frontMatter),
                date: frontMatter.date || getFileDate(filePath)
              };
              
              categories[category].posts.push(postInfo);
              console.log(`   📄 添加文章: ${frontMatter.title}`);
            }
          } catch (error) {
            console.error(`   ❌ 读取文件错误: ${filePath}`, error);
          }
        }
      });
      
      // 按日期排序
      categories[category].posts.sort((a, b) => new Date(b.date) - new Date(a.date));
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
  const categoryOrder = ['技术教程', '个人博客', '游戏相关', '关于我'];
  
  categoryOrder.forEach(category => {
    const categoryData = categories[category];
    markdownContent += `### ${categoryData.icon} ${category}\n\n`;
    
    if (categoryData.posts.length > 0) {
      categoryData.posts.forEach(post => {
        markdownContent += `- [${post.title}](${post.permalink})\n`;
      });
    } else {
      markdownContent += `<!-- ${category}文件夹下的其他文章将在这里显示 -->\n`;
    }
    
    markdownContent += '\n';
  });

  // 添加页脚
  markdownContent += `---

**说明：**
- 点击文章标题即可跳转到对应内容
- 分类根据您的文件夹结构自动生成
- 新的文章会自动归类到对应的分类中

*最后更新：${new Date().toLocaleDateString('zh-CN')}*`;

  console.log('✅ 博客目录生成完成！');

  // 明确返回UTF-8编码的数据
  return {
    path: 'index.html',
    data: markdownContent
  };
});

// 解析front matter
function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  
  try {
    return yaml.load(match[1]);
  } catch (e) {
    console.error('解析YAML出错:', e);
    return null;
  }
}

// 生成permalink
function generatePermalink(filename, frontMatter) {
  if (frontMatter && frontMatter.permalink) {
    return frontMatter.permalink;
  }
  return `/${path.basename(filename, '.md')}/`;
}

// 获取文件日期
function getFileDate(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch (e) {
    return new Date();
  }
}