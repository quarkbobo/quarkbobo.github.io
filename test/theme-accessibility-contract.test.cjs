const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const publicRoot = path.resolve(__dirname, '..', 'public')
const built = relative => fs.readFileSync(path.join(publicRoot, relative), 'utf8')

const decodeHtml = value => value
  .replace(/&#x([0-9a-f]+);/gi, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
  .replace(/&#([0-9]+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')

const textContent = html => decodeHtml(html.replace(/<[^>]+>/g, '')).trim()

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
  assert.match(output, /id="space-scene"[^>]*aria-hidden="true"/)
})

test('generated dates use the configured Chinese locale instead of a fixed numeric pattern', () => {
  // Reverting to YYYY-MM-DD would ignore the site's declared zh-CN locale.
  const output = built('index.html')
  const firstTime = output.match(/<time\b[^>]*datetime="2026-08-18T16:00:00\.000Z"[^>]*>([^<]+)<\/time>/)

  assert.equal(firstTime?.[1], '2026年8月19日')
})

test('generated long-form article headings and TOC form one complete navigation graph', () => {
  // IDs on nested spans leave Hexo's TOC anchors without destinations, especially for image-only headings.
  const output = built(path.join('技术教程', 'How-to-create-a-website', 'index.html'))
  const body = output.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/article>/)?.[1]
  const toc = output.match(/<aside class="article-toc"[\s\S]*?(<ol class="toc">[\s\S]*?<\/ol>)\s*<\/aside>/)?.[1]

  assert.ok(body, 'article body is rendered')
  assert.ok(toc, 'article TOC is rendered')
  assert.equal([...output.matchAll(/<h1\b/gi)].length, 1, 'the page has one h1')

  const headings = [...body.matchAll(/<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)]
  assert.ok(headings.length >= 30, `expected the long article, saw ${headings.length} headings`)
  const levels = headings.map(match => Number(match[1]))
  let previous = 1
  for (const level of levels) {
    assert.ok(level <= previous + 1, `heading jumped from h${previous} to h${level}`)
    previous = level
  }

  for (const heading of headings) {
    assert.match(heading[2], /\bid="[^"]+"/i, `h${heading[1]} has no stable id`)
    const permalink = heading[3].match(/<a\b([^>]*)class="[^"]*\bheader-anchor\b[^"]*"([^>]*)>/i)
    if (permalink) {
      const href = `${permalink[1]} ${permalink[2]}`.match(/\bhref="([^"]+)"/i)?.[1]
      assert.match(href || '', /^#.+/, `h${heading[1]} permalink has no fragment destination`)
    }
  }

  const allIds = [...output.matchAll(/\bid="([^"]*)"/gi)].map(match => decodeHtml(match[1]))
  assert.ok(allIds.every(Boolean), 'every generated id is non-empty')
  assert.equal(new Set(allIds).size, allIds.length, 'generated ids are globally unique')

  const tocLinks = [...toc.matchAll(/<a\b([^>]*)class="toc-link"([^>]*)>([\s\S]*?)<\/a>/gi)]
  assert.ok(tocLinks.length >= 30, `expected a populated TOC, saw ${tocLinks.length} links`)
  for (const link of tocLinks) {
    const attributes = `${link[1]} ${link[2]}`
    const href = attributes.match(/\bhref="([^"]+)"/i)?.[1]
    assert.match(href || '', /^#.+/, 'TOC link has no fragment destination')
    const target = decodeURIComponent(decodeHtml(href.slice(1)))
    assert.equal(allIds.filter(id => id === target).length, 1, `TOC target #${target} is not unique`)
    assert.notEqual(textContent(link[3]), '', `TOC target #${target} has an empty label`)
    assert.notEqual(textContent(link[3]), '#', `TOC target #${target} only exposes a permalink glyph`)
  }

  const imageOnlyHeading = headings.find(heading => /1762306910706-ca8e09e3-4bdc-4887-babc-c72ff376e94e\.png/i.test(heading[3]))
  assert.ok(imageOnlyHeading, 'fixture includes the authored image-only heading')
  const imageHeadingId = decodeHtml(imageOnlyHeading[2].match(/\bid="([^"]+)"/i)?.[1] || '')
  const imageTocLink = tocLinks.find(link => decodeURIComponent(decodeHtml(
    (`${link[1]} ${link[2]}`.match(/\bhref="([^"]+)"/i)?.[1] || '#').slice(1)
  )) === imageHeadingId)
  assert.ok(imageTocLink, 'image-only heading is reachable from the TOC')
  assert.notEqual(textContent(imageTocLink[3]), '', 'image-only heading receives a readable fallback label')
  assert.notEqual(textContent(imageTocLink[3]), '#', 'image-only heading is not labelled by the permalink glyph')
})

test('generated long-form article images use lazy decoding defaults', () => {
  // Passing authored images through unchanged would eagerly decode the whole image-heavy article.
  const output = built(path.join('技术教程', 'How-to-create-a-website', 'index.html'))
  const body = output.match(/<div class="article-body">([\s\S]*?)<\/div>\s*<\/article>/)?.[1]

  assert.ok(body, 'article body is rendered')
  const images = [...body.matchAll(/<img\b([^>]*)>/gi)]
  assert.ok(images.length >= 10, `expected the image-heavy article, saw ${images.length} images`)
  for (const image of images) {
    assert.match(image[1], /\bloading="lazy"/i)
    assert.match(image[1], /\bdecoding="async"/i)
  }
})

test('standalone generated routes infer a meaningful non-empty page h1', () => {
  // Leaving titleless HTML pages with an empty h1 makes their main landmark unnamed.
  const routes = [
    ['2048/index.html', '2048'],
    ['snake/index.html', 'snake'],
    ['国际象棋/index.html', '国际象棋'],
    ['image_transformer/index.html', 'image transformer']
  ]

  for (const [route, expectedTitle] of routes) {
    const output = built(route)
    const main = output.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1]
    const h1s = [...(main || '').matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    assert.equal(h1s.length, 1, route)
    assert.equal(h1s[0][1].replace(/<[^>]+>/g, '').trim(), expectedTitle, route)
  }
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
