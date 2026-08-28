const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', 'public')
const html = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('root catalogue renders as the designed home without changing its URL', () => {
  const output = html('index.html')

  assert.match(output, /data-fluid-home/)
  assert.match(output, /Quark(?:'|&#39;)s Blog/)
  assert.match(output, /在噪声里，保留信号。/)
  assert.match(output, /技术笔记、游戏实验与日常观测。/)
  assert.match(output, /class="post-card"/)
  assert.match(output, /博客目录/)
})

test('normal posts render an article shell and heading-derived contents', () => {
  const output = html('个人博客/Hello-World/index.html')

  assert.match(output, /<article[^>]*class="article-shell"/)
  assert.match(output, /class="article-toc"/)
  assert.match(output, /Quick Start/)
})

test('archive and taxonomy routes render their semantic collection surfaces', () => {
  assert.match(html('archives/index.html'), /class="archive-list"/)
  assert.match(html('categories/index.html'), /class="taxonomy-index"/)
  assert.match(html('tags/index.html'), /class="taxonomy-index"/)
  assert.match(html('index.html'), /<nav[^>]*aria-label="主要导航"/)
})

test('existing games, tools, and downloads keep their generated routes', () => {
  for (const route of [
    '2048/index.html',
    'snake/index.html',
    '国际象棋/index.html',
    '中国象棋/index.html',
    'image_transformer/index.html'
  ]) {
    assert.ok(fs.existsSync(path.join(root, route)), route)
  }
})
