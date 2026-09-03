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

const declarationsFor = (css, selector) => {
  const declarations = {}
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1].split(',').map(value => value.trim()).includes(selector)) continue
    for (const declaration of rule[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
      declarations[declaration[1]] = declaration[2].trim()
    }
  }
  return declarations
}

test('fluid-particle is selected and declares its home-menu contract', () => {
  // A different configured theme would silently route generation to the wrong layouts.
  assert.equal(loadYaml('_config.yml').theme, 'fluid-particle')

  const { image_dimensions: imageDimensions, ...themeShell } = loadYaml('themes/fluid-particle/_config.yml')

  assert.deepEqual(themeShell, {
    name: '流体粒子',
    hero: {
      eyebrow: 'PERSONAL ARCHIVE · DEEP SPACE SIGNAL',
      title: '蓝色空间号',
      description: '技术笔记、游戏合集、日常Vlog'
    },
    menu: {
      首页: '/',
      归档: '/archives/',
      关于: '/#guan-yu-wo'
    }
  })
  assert.ok(imageDimensions, 'the theme declares its offline image dimension cache')
})

test('every optional offline image cache entry has a valid URL and positive dimensions', () => {
  // Content may be added or removed without updating this optional optimization cache.
  const cache = loadYaml('themes/fluid-particle/_config.yml').image_dimensions || {}

  for (const [url, dimensions] of Object.entries(cache)) {
    assert.doesNotThrow(() => new URL(url), url)
    assert.equal(Number.isInteger(dimensions.width) && dimensions.width > 0, true, `${url} width`)
    assert.equal(Number.isInteger(dimensions.height) && dimensions.height > 0, true, `${url} height`)
  }
})

test('article entry links declare a 44px block-size touch target without broadening category selectors', () => {
  // Leaving either link inline shrinks its hit area; broadening the card selector would also stretch category links.
  const css = read('themes/fluid-particle/source/css/main.css')

  for (const selector of ['.post-card h3 a', '.archive-list a']) {
    const declarations = declarationsFor(css, selector)
    assert.equal(declarations.display, 'flex', `${selector} display`)
    assert.equal(declarations['min-block-size'], '44px', `${selector} min-block-size`)
    assert.equal(declarations['align-items'], 'center', `${selector} alignment`)
  }

  assert.equal(declarationsFor(css, '.post-card__categories a').display, 'inline-flex')
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
    'source/js/planet-core.js',
    'source/js/planet-surface.js',
    'source/css/main.css'
  ]) {
    assert.ok(fs.existsSync(path.join(root, 'themes/fluid-particle', file)), file)
  }
})

test('the existing root catalogue route remains unchanged', () => {
  // Changing this permalink would prevent the root catalogue from reaching home dispatch.
  assert.equal(loadFrontMatter('source/_posts/博客目录.md').permalink, '/')
})
