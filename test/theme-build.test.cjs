const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const projectRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(projectRoot, 'source')
const root = path.join(projectRoot, 'public')
const html = relative => fs.readFileSync(path.join(root, relative), 'utf8')

function completeHtmlDocuments (directory = sourceRoot) {
  const documents = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      documents.push(...completeHtmlDocuments(absolute))
      continue
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.html') continue
    const source = fs.readFileSync(absolute)
    if (!/^\s*<!doctype\s+html\b[\s\S]*?<html\b/i.test(source.toString('utf8'))) continue
    documents.push({
      route: path.relative(sourceRoot, absolute),
      source
    })
  }
  return documents.sort((a, b) => a.route.localeCompare(b.route, 'zh-CN'))
}

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

test('every internal primary navigation link resolves to generated output', () => {
  const output = html('index.html')
  const navigation = output.match(/<nav\b[^>]*aria-label="主要导航"[^>]*>([\s\S]*?)<\/nav>/)
  assert.ok(navigation, 'primary navigation is present')

  const hrefs = [...navigation[1].matchAll(/<a\b[^>]*href="([^"]+)"/g)]
    .map(match => match[1])
    .filter(href => href.startsWith('/'))

  assert.ok(hrefs.length, 'primary navigation has internal links')

  for (const href of hrefs) {
    const pathname = decodeURIComponent(new URL(href, 'https://example.test').pathname)
    const relative = pathname.replace(/^\/+/, '')
    const target = pathname.endsWith('/')
      ? path.join(root, relative, 'index.html')
      : path.join(root, relative)

    assert.ok(fs.existsSync(target), `${href} -> ${path.relative(root, target)}`)
  }
})

test('complete standalone HTML documents are copied byte-for-byte with one document root', () => {
  const documents = completeHtmlDocuments()
  const expectedRoutes = [
    path.join('COCKY ZHOU', 'index.html'),
    path.join('image_transformer', 'index.html'),
    path.join('snake', 'index.html'),
    path.join('中国象棋', 'index.html'),
    path.join('国际象棋', 'index.html')
  ].sort((a, b) => a.localeCompare(b, 'zh-CN'))

  assert.deepEqual(documents.map(document => document.route), expectedRoutes)
  for (const document of documents) {
    const generated = fs.readFileSync(path.join(root, document.route))
    assert.equal(generated.equals(document.source), true, `${document.route} was altered during generation`)
    const output = generated.toString('utf8')
    assert.equal([...output.matchAll(/<html\b/gi)].length, 1, `${document.route} has multiple document roots`)
    assert.equal([...output.matchAll(/<\/html\s*>/gi)].length, 1, `${document.route} has multiple closing roots`)
  }
})

test('COCKY ZHOU generated inline scripts remain syntactically valid', () => {
  const document = completeHtmlDocuments().find(document => document.route === path.join('COCKY ZHOU', 'index.html'))
  assert.ok(document, 'the COCKY ZHOU standalone document is present')
  const output = fs.readFileSync(path.join(root, document.route), 'utf8')
  const scripts = [...output.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim())

  assert.ok(scripts.length, 'COCKY ZHOU contains an inline application script')
  scripts.forEach((script, index) => {
    assert.doesNotThrow(
      () => new vm.Script(script, { filename: `COCKY-ZHOU-inline-${index + 1}.js` }),
      `COCKY ZHOU inline script ${index + 1} was rewritten into invalid JavaScript`
    )
  })
})

test('existing fragment pages and standalone applications keep their generated routes', () => {
  const routes = ['2048/index.html', ...completeHtmlDocuments().map(document => document.route)]
  for (const route of routes) {
    assert.ok(fs.existsSync(path.join(root, route)), route)
  }
})
