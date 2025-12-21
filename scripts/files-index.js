/* scripts/files-index.js */
'use strict';

const fs = require('fs');
const path = require('path');

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

hexo.extend.generator.register('files_index', function () {
  const filesDir = path.join(hexo.source_dir, 'files');

  if (!fs.existsSync(filesDir)) return [];

  const items = fs.readdirSync(filesDir, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name)
    .filter(name => name.toLowerCase() !== 'index.html') // 避免冲突
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  const root = hexo.config.root || '/';

  function fileUrl(name) {
    // 生成 /files/<filename>，并对文件名做 URL 编码（中文文件名也OK）
    return root.replace(/\/?$/, '/') + 'files/' + encodeURIComponent(name);
  }

  function previewLabel(ext) {
    if (ext === '.pdf') return '预览';
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return '查看';
    if (['.mp4', '.webm', '.mov', '.m4v'].includes(ext)) return '播放';
    return '打开';
  }

  const listHtml = items.map(name => {
    const ext = path.extname(name).toLowerCase();
    const url = fileUrl(name);
    const safeName = escapeHtml(name);
    const label = previewLabel(ext);

    return `
      <li class="item">
        <span class="name" title="${safeName}">${safeName}</span>
        <span class="actions">
          <a class="btn" href="${url}" target="_blank" rel="noopener">${label}</a>
          <a class="btn" href="${url}" download>下载</a>
        </span>
      </li>
    `;
  }).join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Files</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif; margin: 24px; }
    .wrap { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    .hint { opacity: .75; margin: 0 0 18px; }
    ul { list-style: none; padding: 0; margin: 0; border: 1px solid rgba(127,127,127,.25); border-radius: 10px; overflow: hidden; }
    .item { display: flex; gap: 12px; align-items: center; justify-content: space-between;
            padding: 12px 14px; border-top: 1px solid rgba(127,127,127,.15); }
    .item:first-child { border-top: 0; }
    .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actions { display: flex; gap: 8px; }
    .btn { text-decoration: none; padding: 6px 10px; border: 1px solid rgba(127,127,127,.35);
           border-radius: 8px; font-size: 14px; }
    .btn:hover { filter: brightness(1.05); }
    .empty { padding: 14px; opacity: .75; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>/files</h1>
    <p class="hint">点击“预览/打开”在新标签页打开文件；点击“下载”直接下载。</p>
    <ul>
      ${items.length ? listHtml : `<li class="empty">此目录下暂无文件</li>`}
    </ul>
  </div>
</body>
</html>`;

  return [{
    path: 'files/index.html',
    data: html
  }];
});
