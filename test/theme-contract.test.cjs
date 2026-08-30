const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8').replace(/^\uFEFF/, '')
const loadYaml = relative => yaml.load(read(relative))
const loadFrontMatter = relative => {
  const match = read(relative).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  assert.ok(match, `${relative} has YAML front matter`)
  return yaml.load(match[1])
}

test('fluid-particle is selected and declares its home-menu contract', () => {
  // A different configured theme would silently route generation to the wrong layouts.
  assert.equal(loadYaml('_config.yml').theme, 'fluid-particle')

  assert.deepEqual(loadYaml('themes/fluid-particle/_config.yml'), {
    name: '流体粒子',
    hero: {
      eyebrow: 'PERSONAL ARCHIVE · DEEP SPACE SIGNAL',
      title: '在噪声里，保留信号。',
      description: '技术笔记、游戏实验与日常观测。'
    },
    menu: {
      首页: '/',
      归档: '/archives/',
      分类: '/categories/',
      标签: '/tags/',
      关于: '/关于我/About-me/'
    }
  })
})

test('fluid-particle provides every renderer entry point and stylesheet', () => {
  // Removing a renderer or stylesheet leaves a selected theme unable to render a route.
  for (const file of [
    'layout/layout.ejs',
    'layout/index.ejs',
    'layout/post.ejs',
    'layout/page.ejs',
    'layout/archive.ejs',
    'layout/category.ejs',
    'layout/tag.ejs',
    'source/css/main.css'
  ]) {
    assert.ok(fs.existsSync(path.join(root, 'themes/fluid-particle', file)), file)
  }
})

test('the existing root catalogue route remains unchanged', () => {
  // Changing this permalink would prevent the root catalogue from reaching home dispatch.
  assert.equal(loadFrontMatter('source/_posts/博客目录.md').permalink, '/')
})
