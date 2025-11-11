const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// 博客源文件目录
const postsDir = path.join(__dirname, 'source', '_posts');
// 输出的index.md路径
const outputFile = path.join(__dirname, 'source', 'index.md');

// 分类文件夹映射
const categoryMap = {
  '技术教程': '技术教程',
  '个人博客': '个人博客',
  '关于我': '关于我',
  '游戏相关': '游戏相关',
  'games': '游戏相关'
};

// 我们想要显示的分类顺序
const categoryOrder = ['技术教程', '个人博客', '游戏相关', '关于我'];

// 读取每个分类文件夹
const categories = {};

// 先初始化
categoryOrder.forEach(cat => {
  categories[cat] = [];
});

// 遍历postsDir下的每个文件夹
fs.readdirSync(postsDir).forEach(folder => {
  const folderPath = path.join(postsDir, folder);
  if (fs.statSync(folderPath).isDirectory()) {
    // 获取映射后的分类名
    const categoryName = categoryMap[folder];
    if (!categoryName) {
      console.warn(`Warning: No mapping for folder ${folder}`);
      return;
    }
    // 如果这个分类不在我们预定义的顺序中，则跳过（或者我们可以添加，但这里我们按照顺序来）
    if (!categoryOrder.includes(categoryName)) {
      console.warn(`Warning: Category ${categoryName} is not in the categoryOrder, skipping.`);
      return;
    }

    // 读取文件夹下的所有.md文件
    fs.readdirSync(folderPath).forEach(file => {
      if (path.extname(file) === '.md') {
        const filePath = path.join(folderPath, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(fileContent);

        // 获取title和permalink
        let title = data.title;
        if (!title) {
          // 从文件名生成，去掉扩展名，然后将连字符替换为空格，并大写每个单词的首字母
          title = path.basename(file, '.md').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        let permalink = data.permalink;
        if (!permalink) {
          permalink = '/' + path.basename(file, '.md');
        }

        // 如果permalink不是绝对URL，则确保以/开头
        if (!permalink.startsWith('http')) {
          permalink = '/' + permalink.replace(/^\//, ''); // 确保没有重复的斜杠
        }

        categories[categoryName].push({
          title,
          permalink
        });
      }
    });
  }
});

// 生成Markdown内容
let mdContent = `---
title: 博客目录
permalink: /
---

## 📚 文章分类

`;

categoryOrder.forEach(category => {
  if (categories[category].length > 0) {
    mdContent += `### ${getEmoji(category)} ${category}\n\n`;
    categories[category].forEach(post => {
      mdContent += `- [${post.title}](${post.permalink})\n`;
    });
    mdContent += '\n';
  }
});

// 为每个分类添加一个图标函数
function getEmoji(category) {
  const emojiMap = {
    '技术教程': '🎯',
    '个人博客': '📝',
    '游戏相关': '🎮',
    '关于我': '👤'
  };
  return emojiMap[category] || '📁';
}

// 写入文件
fs.writeFileSync(outputFile, mdContent);

console.log('目录生成完毕！');