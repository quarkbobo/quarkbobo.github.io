const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ejs = require('ejs')
const yaml = require('js-yaml')
const hexoToc = require(path.resolve(__dirname, '..', 'node_modules', 'hexo', 'dist', 'plugins', 'helper', 'toc.js'))

const publicRoot = path.resolve(__dirname, '..', 'public')
const built = relative => fs.readFileSync(path.join(publicRoot, relative), 'utf8')
const imageDimensions = yaml.load(fs.readFileSync(
  path.resolve(__dirname, '..', 'themes', 'fluid-particle', '_config.yml'),
  'utf8'
)).image_dimensions || {}
const postFullTemplate = fs.readFileSync(
  path.resolve(__dirname, '..', 'themes', 'fluid-particle', 'layout', '_partial', 'post-full.ejs'),
  'utf8'
)

const renderArticleFixture = () => ejs.render(postFullTemplate, {
  config: { language: 'zh-CN', title: 'Fixture site', timezone: 'Asia/Shanghai' },
  theme: {
    image_dimensions: {
      'https://example.test/diagram.png': { width: 640, height: 360 },
      'https://example.test/detail.png': { width: 320, height: 240 }
    }
  },
  post: {
    path: 'fixture/index.html',
    title: 'Fixture article',
    date: new Date('2026-09-03T00:00:00.000Z'),
    content: [
      '<h2>起点<a class="header-anchor" href="#old-start">#</a></h2>',
      '<p>正文内容。</p>',
      '<h4>深层章节<a class="header-anchor" href="#old-deep">#</a></h4>',
      '<p><img src="https://example.test/detail.png" alt="细节图"></p>',
      '<h2><img src="https://example.test/diagram.png" alt="架构图"><a class="header-anchor" href="#old-diagram">#</a></h2>'
    ].join('\n')
  },
  strip_html: html => String(html).replace(/<[^>]+>/g, ''),
  toc: hexoToc,
  date_xml: value => value.toISOString()
})

const decodeHtml = value => value
  .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
  .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')

const textContent = html => decodeHtml(html.replace(/<[^>]+>/g, '')).trim()

const htmlAttribute = (attributes, name) => {
  const match = String(attributes).match(new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  ))
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3]) : undefined
}

const generatedArticleImages = (directory = publicRoot) => {
  const images = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      images.push(...generatedArticleImages(absolute))
      continue
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.html') continue
    const output = fs.readFileSync(absolute, 'utf8')
    const body = output.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/article>/)?.[1]
    if (!body) continue
    const route = path.relative(publicRoot, absolute)
    images.push(...[...body.matchAll(/<img\b([^>]*)>/gi)].map(match => ({ route, attributes: match[1] })))
  }
  return images
}

class ClassList {
  constructor () {
    this.values = new Set()
  }

  add (...tokens) {
    for (const token of tokens) this.values.add(token)
  }

  toggle (token, force) {
    if (force) this.values.add(token)
    else this.values.delete(token)
    return Boolean(force)
  }

  contains (token) {
    return this.values.has(token)
  }
}

class Element {
  constructor (attributes = {}) {
    this.attributes = new Map(Object.entries(attributes))
    this.classList = new ClassList()
    this.listeners = new Map()
  }

  addEventListener (type, listener) {
    this.listeners.set(type, listener)
  }

  click () {
    this.listeners.get('click')?.()
  }

  getAttribute (name) {
    return this.attributes.get(name) ?? null
  }

  setAttribute (name, value) {
    this.attributes.set(name, value)
  }
}

test('generated navigation exposes a skip target and a controlled collapsed menu', () => {
  // Removing any relationship makes keyboard navigation ambiguous even if the templates still look similar.
  const output = built('index.html')
  const skip = output.match(/<a\b[^>]*class="skip-link"[^>]*href="([^"]+)"/)
  const main = output.match(/<main\b([^>]*)>/)
  const toggle = output.match(/<button\b([^>]*)class="nav-toggle"([^>]*)>/)
  const nav = output.match(/<nav\b([^>]*)id="site-menu"([^>]*)>/)

  assert.equal(skip?.[1], '#main-content')
  assert.match(`${main?.[1]}`, /id="main-content"/)
  assert.match(`${main?.[1]}`, /tabindex="-1"/)
  assert.match(`${toggle?.[1]} ${toggle?.[2]}`, /aria-expanded="false"/)
  assert.match(`${toggle?.[1]} ${toggle?.[2]}`, /aria-controls="site-menu"/)
  assert.match(`${nav?.[1]} ${nav?.[2]}`, /aria-label="主要导航"/)
})

test('generated home brand names the approved station and links home', () => {
  // Reverting to the configuration title would expose the prior Q / LOG brand instead of the approved station.
  const output = built('index.html')
  const brand = output.match(/<a\b([^>]*)class="site-brand"([^>]*)>([\s\S]*?)<\/a>/)
  assert.ok(brand)
  const attributes = `${brand[1]} ${brand[2]}`
  assert.equal(htmlAttribute(attributes, 'href'), '/')
  assert.equal(htmlAttribute(attributes, 'aria-label'), '政治月测后宫版V3/太空站 首页')
  assert.equal(textContent(brand[3]), '政治月测后宫版V3/太空站')
})

test('generated home exposes a keyboard-native control for the continuous background motion', () => {
  // Removing the control would leave the persistent Canvas and Saturn motion with no pause path.
  const output = built('index.html')
  const control = output.match(/<button\b([^>]*)id="motion-toggle"([^>]*)>([\s\S]*?)<\/button>/)

  assert.ok(control, 'background motion control is rendered')
  const attributes = `${control[1]} ${control[2]}`
  assert.match(attributes, /type="button"/)
  assert.match(attributes, /aria-pressed="false"/)
  assert.match(attributes, /aria-controls="space-scene"/)
  assert.match(control[3], /暂停背景动态/)
  assert.equal((output.match(/<canvas\b/g) || []).length, 2)
  assert.match(output, /id="space-scene"[^>]*aria-hidden="true"/)
  assert.match(output, /id="space-scene"[^>]*aria-hidden="true"[\s\S]*id="planet-surface"[^>]*aria-hidden="true"/)
})

test('generated dates use the configured Chinese locale instead of a fixed numeric pattern', () => {
  // Reverting to YYYY-MM-DD would ignore the site's declared zh-CN locale.
  const output = built('index.html')
  const firstTime = output.match(/<time\b[^>]*datetime="[^"]+"[^>]*>([^<]+)<\/time>/)

  assert.match(firstTime?.[1] || '', /^\d{4}年\d{1,2}月\d{1,2}日$/)
})

test('generated long-form article headings and TOC form one complete navigation graph', () => {
  // IDs on nested spans leave Hexo's TOC anchors without destinations, especially for image-only headings.
  const output = renderArticleFixture()
  const body = output.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/article>/)?.[1]
  const toc = output.match(/<aside class="article-toc"[\s\S]*?(<ol class="toc">[\s\S]*?<\/ol>)\s*<\/aside>/)?.[1]

  assert.ok(body, 'article body is rendered')
  assert.ok(toc, 'article TOC is rendered')
  assert.equal([...output.matchAll(/<h1\b/gi)].length, 1, 'the page has one h1')

  const headings = [...body.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)]
  assert.ok(headings.length >= 3, `expected the article fixture, saw ${headings.length} headings`)
  const levels = headings.map(match => Number(match[1]))
  let previous = 1
  for (const level of levels) {
    assert.ok(level <= previous + 1, `heading jumped from h${previous} to h${level}`)
    previous = level
  }

  for (const heading of headings) {
    assert.match(heading[2], /\bid="[^"]+"/i, `h${heading[1]} has no stable id`)
    const permalink = heading[3].match(/<a\b([^>]*)class="[^"]*\bheader-anchor\b[^"]*"([^>]*)>([\s\S]*?)<\/a>/i)
    if (permalink) {
      const href = `${permalink[1]} ${permalink[2]}`.match(/\bhref="([^"]+)"/i)?.[1]
      assert.match(href || '', /^#.+/, `h${heading[1]} permalink has no fragment destination`)
      if (textContent(permalink[3]) === '#') {
        assert.match(`${permalink[1]} ${permalink[2]}`, /\baria-label="[^"]+"/i, `h${heading[1]} glyph permalink has no accessible name`)
      }
    }
  }

  const allIds = [...output.matchAll(/\bid="([^"]*)"/gi)].map(match => decodeHtml(match[1]))
  assert.ok(allIds.every(Boolean), 'every generated id is non-empty')
  assert.equal(new Set(allIds).size, allIds.length, 'generated ids are globally unique')

  const tocLinks = [...toc.matchAll(/<a\b([^>]*)class="toc-link"([^>]*)>([\s\S]*?)<\/a>/gi)]
  assert.ok(tocLinks.length >= 3, `expected a populated TOC, saw ${tocLinks.length} links`)
  for (const link of tocLinks) {
    const attributes = `${link[1]} ${link[2]}`
    const href = attributes.match(/\bhref="([^"]+)"/i)?.[1]
    assert.match(href || '', /^#.+/, 'TOC link has no fragment destination')
    const target = decodeURIComponent(decodeHtml(href.slice(1)))
    assert.equal(allIds.filter(id => id === target).length, 1, `TOC target #${target} is not unique`)
    assert.notEqual(textContent(link[3]), '', `TOC target #${target} has an empty label`)
    assert.notEqual(textContent(link[3]), '#', `TOC target #${target} only exposes a permalink glyph`)
  }

  const imageOnlyHeading = headings.find(heading => /diagram\.png/i.test(heading[3]))
  assert.ok(imageOnlyHeading, 'fixture includes the authored image-only heading')
  const imageHeadingId = decodeHtml(imageOnlyHeading[2].match(/\bid="([^"]+)"/i)?.[1] || '')
  const imageTocLink = tocLinks.find(link => decodeURIComponent(decodeHtml(
    (`${link[1]} ${link[2]}`.match(/\bhref="([^"]+)"/i)?.[1] || '#').slice(1)
  )) === imageHeadingId)
  assert.ok(imageTocLink, 'image-only heading is reachable from the TOC')
  assert.notEqual(textContent(imageTocLink[3]), '', 'image-only heading receives a readable fallback label')
  assert.notEqual(textContent(imageTocLink[3]), '#', 'image-only heading is not labelled by the permalink glyph')
})

test('generated article TOC is a native disclosure before the article body', () => {
  // Moving the TOC after the article makes it effectively unreachable at 320px; a custom div is not keyboard-native.
  const output = renderArticleFixture()
  const layoutStart = output.indexOf('<div class="article-layout content-shell">')
  const tocStart = output.indexOf('<details class="article-toc-disclosure"', layoutStart)
  const desktopTocStart = output.indexOf('<aside class="article-toc"', layoutStart)
  const articleStart = output.indexOf('<article class="article-shell">', layoutStart)

  assert.ok(layoutStart >= 0, 'article layout is rendered')
  assert.ok(tocStart > layoutStart, 'article TOC is rendered as details')
  assert.ok(articleStart > tocStart, 'article TOC precedes the article in DOM order')
  assert.match(output.slice(tocStart, articleStart), /<summary>\s*文章目录\s*<\/summary>/)
  assert.doesNotMatch(output.slice(tocStart, articleStart), /<details\b[^>]*\bopen(?:\s|>)/)
  assert.ok(desktopTocStart > layoutStart, 'desktop sticky TOC remains rendered')
})

test('generated long-form article images use lazy decoding defaults', () => {
  // Passing authored images through unchanged would eagerly decode the whole image-heavy article.
  const output = renderArticleFixture()
  const body = output.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/article>/)?.[1]

  assert.ok(body, 'article body is rendered')
  const images = [...body.matchAll(/<img\b([^>]*)>/gi)]
  assert.equal(images.length, 2, `expected two fixture images, saw ${images.length}`)
  for (const image of images) {
    assert.match(image[1], /\bloading="lazy"/i)
    assert.match(image[1], /\bdecoding="async"/i)
  }
})

test('generated article images use configured intrinsic dimensions when available', () => {
  // Unknown images remain valid content; cache hits must still reserve the verified dimensions.
  const images = generatedArticleImages()
  for (const { route, attributes } of images) {
    const source = htmlAttribute(attributes, 'src')
    const expected = imageDimensions[source]
    if (!expected) continue
    assert.equal(htmlAttribute(attributes, 'width'), String(expected.width), `${route} ${source} width`)
    assert.equal(htmlAttribute(attributes, 'height'), String(expected.height), `${route} ${source} height`)
  }
})

test('article normalization transfers only direct Hexo wrapper IDs', () => {
  // Matching any descendant ID would steal authored deep-link targets from nested article content.
  const template = fs.readFileSync(path.resolve(__dirname, '..', 'themes', 'fluid-particle', 'layout', '_partial', 'post-full.ejs'), 'utf8')
  const output = ejs.render(template, {
    config: { language: 'zh-CN', title: 'Fixture site' },
    post: {
      path: 'fixture/index.html',
      title: 'Fixture article',
      content: [
        '<h2 data-origin="span"><span class="title" id="direct-span">Direct span</span><a href="#direct-span" class="header-anchor">#</a></h2>',
        '<h2 data-origin="anchor"><a class="title" id="direct-anchor" href="#source">Direct anchor</a><a href="#direct-anchor" class="header-anchor">#</a></h2>',
        '<h2 data-origin="deep"><span class="title"><em id="deep-authored">Deep authored target</em></span><a href="#deep-authored" class="header-anchor">#</a></h2>'
      ].join('')
    },
    strip_html: html => html.replace(/<[^>]+>/g, ''),
    toc: () => '',
    date_xml: value => String(value)
  })
  const headings = [...output.matchAll(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi)]

  assert.equal(headings.length, 3)
  assert.match(headings[0][1], /data-origin="span"/)
  assert.match(headings[0][1], /id="direct-span"/)
  assert.doesNotMatch(headings[0][2], /id="direct-span"/)
  assert.match(headings[1][1], /data-origin="anchor"/)
  assert.match(headings[1][1], /id="direct-anchor"/)
  assert.doesNotMatch(headings[1][2], /id="direct-anchor"/)
  assert.match(headings[2][1], /data-origin="deep"/)
  assert.match(headings[2][1], /id="article-section-3"/)
  assert.match(headings[2][2], /<em id="deep-authored">Deep authored target<\/em>/)
  assert.match(headings[2][2], /class="header-anchor"[^>]*href="#article-section-3"|href="#article-section-3"[^>]*class="header-anchor"/)
})

test('the authored 2048 fragment receives one meaningful themed page heading', () => {
  // Full standalone documents bypass the theme; only the authored fragment needs the theme to supply its page h1.
  const output = built('2048/index.html')
  const main = output.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1]
  const h1s = [...(main || '').matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]

  assert.equal(h1s.length, 1)
  assert.equal(h1s[0][1].replace(/<[^>]+>/g, '').trim(), '2048')
})

test('generated site script keeps menu visibility and aria-expanded in sync', () => {
  // A visual-only toggle would leave assistive technology reporting the opposite state.
  const root = new Element()
  const toggle = new Element({ 'aria-expanded': 'false' })
  const menu = new Element()
  const document = {
    documentElement: root,
    querySelector (selector) {
      if (selector === '.nav-toggle') return toggle
      if (selector === '.site-nav') return menu
      return null
    }
  }

  vm.runInNewContext(built(path.join('js', 'site.js')), { document }, { filename: 'public/js/site.js' })

  assert.equal(root.classList.contains('is-enhanced'), true)
  toggle.click()
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(menu.classList.contains('is-open'), true)
  toggle.click()
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(menu.classList.contains('is-open'), false)
})
