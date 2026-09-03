const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const modulePath = path.resolve(__dirname, '../themes/fluid-particle/scripts/post-lead-core.js')

assert.ok(fs.existsSync(modulePath), 'post lead extractor module exists')
const { extractPostLead } = require(modulePath)

test('extracts only a Tab-indented first paragraph after front matter', () => {
  const source = `---
title: 航行日志
date: 2026-09-03
---

\t第一段文字，作为首页引导。

第二段不会进入摘要。`

  assert.equal(extractPostLead(source), '第一段文字，作为首页引导。')
})

test('accepts four-space indentation and keeps readable inline link text', () => {
  assert.equal(
    extractPostLead('    [下载入口](https://example.com/file) 和 **重点内容**'),
    '下载入口 和 重点内容'
  )
})

test('ignores invisible source markers before the paragraph indentation', () => {
  assert.equal(extractPostLead('\uFEFF\u200B\t带不可见字符的段落'), '带不可见字符的段落')
})

test('joins wrapped lines in the same first paragraph until a blank line', () => {
  assert.equal(
    extractPostLead('\t第一行文字\n    第二行带有 `代码`\n第三行继续说明\n\n\t下一段'),
    '第一行文字 第二行带有 代码 第三行继续说明'
  )
})

for (const [name, source] of [
  ['unindented text', '普通但没有缩进的正文'],
  ['heading', '# 标题\n\n    后面的段落'],
  ['quote', '> 引用\n\n    后面的段落'],
  ['list', '- 列表\n\n    后面的段落'],
  ['image', '![图片](cover.png)\n\n    后面的段落'],
  ['fenced code', '```js\nalert(1)\n```\n\n    后面的段落'],
  ['html', '<p>HTML 段落</p>\n\n    后面的段落']
]) {
  test(`rejects a first ${name} block instead of searching later content`, () => {
    assert.equal(extractPostLead(source), '')
  })
}

test('rejects an indented structural block instead of treating it as prose', () => {
  assert.equal(extractPostLead('    # 缩进标题'), '')
  assert.equal(extractPostLead('\t> 缩进引用'), '')
  assert.equal(extractPostLead('    ```js\n    alert(1)\n    ```'), '')
})

test('returns an empty lead for missing or non-string source', () => {
  assert.equal(extractPostLead(''), '')
  assert.equal(extractPostLead(null), '')
  assert.equal(extractPostLead({}), '')
})
