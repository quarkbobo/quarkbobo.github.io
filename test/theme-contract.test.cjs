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

const expectedImageDimensions = new Map([
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762238688380-8ceb053b-5d25-432f-a0eb-84443781f7e7.png', { width: 968, height: 122 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762240163395-212e4180-df61-4995-bf7a-2ca35bf6ab35.png', { width: 912, height: 529 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762304073440-e2574706-5ccd-4e52-96e3-182d8e1fa4e9.png', { width: 440, height: 341 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762306910706-ca8e09e3-4bdc-4887-babc-c72ff376e94e.png', { width: 1525, height: 536 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762304948963-03e04cdf-110e-4f78-94e8-dc4a5d274654.png', { width: 739, height: 920 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762339554466-c9ba98cc-0b30-4f01-a233-98fd5ed4b909.png', { width: 1405, height: 1209 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762339931610-196000a2-c7a3-4dd5-8bdd-4acb14062781.png', { width: 2560, height: 1528 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343581486-ff9e97f4-261c-45e2-9e16-a62f55c279ef.png', { width: 2560, height: 1528 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343672137-9b3dee82-47a2-480d-95ce-69e293078c5d.png', { width: 2560, height: 1528 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343712340-fce9bedb-c156-40ec-8430-06bef9ad70df.png', { width: 2560, height: 1528 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762343747580-114ab113-acd7-495f-9ccb-2ce2a78562db.png', { width: 2560, height: 1600 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762344955237-b8b84a0a-806a-4464-a692-00f3e78723b2.png', { width: 2560, height: 1528 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762345055555-f85572b7-4f9c-4b37-b385-682e8b24be05.png', { width: 2560, height: 1528 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762347014182-deca4d85-4f79-4093-8878-d099a988e687.png', { width: 2560, height: 1528 }],
  ['https://cdn.nlark.com/yuque/0/2025/png/54207903/1762435641656-59cb517d-00cf-424f-926f-66c422fd258e.png', { width: 2560, height: 1528 }],
  ['https://quark567.patrickliucloud.top/images/wx公众号.jpg', { width: 430, height: 430 }]
])

const remoteArticleImages = relative => {
  const source = read(relative)
  return [
    ...[...source.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)(?:\s+[^)]*)?\)/gi)].map(match => match[1]),
    ...[...source.matchAll(/<img\b[^>]*\ssrc\s*=\s*(?:"(https?:\/\/[^" ]+)"|'(https?:\/\/[^' ]+)'|(https?:\/\/[^\s>]+))/gi)]
      .map(match => match[1] || match[2] || match[3])
  ]
}

const filesBelow = relative => fs.readdirSync(path.join(root, relative), { withFileTypes: true })
  .flatMap(entry => {
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) return filesBelow(child)
    return entry.isFile() ? [child] : []
  })

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
  assert.ok(imageDimensions, 'the theme declares its offline image dimension cache')
})

test('the offline image cache covers every authored remote article image exactly once', () => {
  // A missing or stale cache entry would leave a generated article image without trustworthy intrinsic dimensions.
  const cache = loadYaml('themes/fluid-particle/_config.yml').image_dimensions || {}
  const authoredUrls = filesBelow(path.join('source', '_posts'))
    .filter(relative => path.extname(relative).toLowerCase() === '.md')
    .flatMap(remoteArticleImages)

  assert.equal(new Set(authoredUrls).size, authoredUrls.length, 'article image URLs are unique')
  assert.deepEqual(Object.keys(cache).sort(), [...expectedImageDimensions.keys()].sort())
  assert.deepEqual(Object.keys(cache).sort(), [...authoredUrls].sort())
  for (const [url, dimensions] of expectedImageDimensions) {
    assert.deepEqual(cache[url], dimensions, url)
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
