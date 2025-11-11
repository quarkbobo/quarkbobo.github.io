// scripts/next-directory-fixed.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

hexo.extend.generator.register('next-directory', function(locals) {
  const postsDir = path.join(hexo.source_dir, '_posts');
  
  // 定义分类结构
  const categories = [
    { 
      name: '技术教程', 
      icon: '🎯', 
      posts: [],
      dir: '技术教程'
    },
    { 
      name: '个人博客', 
      icon: '📝', 
      posts: [],
      dir: '个人博客'
    },
    { 
      name: '游戏相关', 
      icon: '🎮', 
      posts: [],
      dir: '游戏相关'
    },
    { 
      name: '关于我', 
      icon: '👤', 
      posts: [],
      dir: '关于我'
    }
  ];

  console.log('🔧 开始生成博客目录...');

  // 收集文章信息
  categories.forEach(category => {
    const categoryDir = path.join(postsDir, category.dir);
    
    if (fs.existsSync(categoryDir)) {
      console.log(`📁 处理分类: ${category.name}`);
      
      const files = fs.readdirSync(categoryDir);
      
      files.forEach(file => {
        if (file.endsWith('.md')) {
          const filePath = path.join(categoryDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const frontMatter = parseFrontMatter(content);
            
            if (frontMatter && frontMatter.title) {
              category.posts.push({
                title: frontMatter.title,
                permalink: frontMatter.permalink || `/${path.basename(file, '.md')}/`,
                date: frontMatter.date
              });
              console.log(`   📄 添加文章: ${frontMatter.title}`);
            }
          } catch (error) {
            console.error(`   ❌ 读取文件错误: ${filePath}`, error);
          }
        }
      });
      
      // 按日期排序
      category.posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
  });

  // 生成符合 Next 主题的页面内容
  let pageContent = `
<div class="directory-container">
  <h1>📚 博客目录</h1>
  
  <div class="directory-intro">
    <p>欢迎访问我的博客！这里按照分类整理了所有文章。</p>
  </div>
`;

  // 生成分类区块
  categories.forEach(category => {
    pageContent += `
  <div class="category-block">
    <h2>${category.icon} ${category.name}</h2>
    <div class="post-list">
    `;
    
    if (category.posts.length > 0) {
      category.posts.forEach(post => {
        pageContent += `
      <div class="post-item">
        <a href="${post.permalink}" class="post-link">${post.title}</a>
      </div>`;
      });
    } else {
      pageContent += `
      <div class="empty-message">
        暂无文章，敬请期待...
      </div>`;
    }
    
    pageContent += `
    </div>
  </div>`;
  });

  // 添加页脚
  pageContent += `
  <div class="directory-footer">
    <div class="footer-note">
      <h3>📋 使用说明</h3>
      <ul>
        <li>点击文章标题即可阅读完整内容</li>
        <li>文章按照发布时间排序（最新的在前）</li>
        <li>分类根据文件夹结构自动生成</li>
      </ul>
      <p class="update-time">最后更新：${new Date().toLocaleDateString('zh-CN')}</p>
    </div>
  </div>
</div>

<style>
.directory-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.directory-intro {
  text-align: center;
  margin-bottom: 3rem;
  color: #666;
  font-size: 1.1rem;
}

.category-block {
  margin-bottom: 3rem;
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  border-left: 4px solid #3498db;
}

.category-block h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #2c3e50;
  font-size: 1.5rem;
  border-bottom: 2px solid #f8f9fa;
  padding-bottom: 0.5rem;
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.post-item {
  padding: 0.8rem 0;
  border-bottom: 1px solid #f1f3f4;
  transition: background-color 0.2s;
}

.post-item:hover {
  background-color: #f8f9fa;
  border-radius: 6px;
  margin: 0 -0.5rem;
  padding: 0.8rem 0.5rem;
}

.post-item:last-child {
  border-bottom: none;
}

.post-link {
  color: #2c3e50;
  text-decoration: none;
  font-size: 1.1rem;
  display: block;
  transition: color 0.2s;
}

.post-link:hover {
  color: #3498db;
}

.empty-message {
  text-align: center;
  color: #999;
  font-style: italic;
  padding: 2rem;
}

.directory-footer {
  margin-top: 4rem;
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 12px;
}

.footer-note h3 {
  margin-top: 0;
  color: #2c3e50;
}

.footer-note ul {
  color: #666;
  line-height: 1.6;
}

.footer-note li {
  margin-bottom: 0.5rem;
}

.update-time {
  margin-top: 1.5rem;
  text-align: right;
  color: #999;
  font-size: 0.9rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .directory-container {
    padding: 1rem 0.5rem;
  }
  
  .category-block {
    padding: 1.5rem;
    margin-bottom: 2rem;
  }
  
  .post-link {
    font-size: 1rem;
  }
}
</style>
`;

  console.log('✅ 博客目录生成完成！');

  return {
    path: 'index.html',
    data: {
      title: '博客目录',
      date: new Date(),
      content: pageContent,
      layout: 'page',
      comments: false
    }
  };
});

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