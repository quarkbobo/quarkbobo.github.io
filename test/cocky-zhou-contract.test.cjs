const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM, VirtualConsole } = require('jsdom')

const root = path.resolve(__dirname, '..')
const sourcePath = path.join(root, 'source', 'COCKY ZHOU', 'index.html')
const source = fs.readFileSync(sourcePath, 'utf8')

const apiItems = [
  { name: 'guide.md', size: 640, type: 'file' },
  { name: 'notes.txt', size: 80, type: 'file' },
  { name: 'sheet.xlsx', size: 2048, type: 'file' },
  { name: '<img src=x onerror=alert(1)>.txt', size: 12, type: 'file' },
  { name: 'backup', size: 0, type: 'dir' }
]

const backupItems = [
  { name: 'history.txt', size: 160, type: 'file' },
  { name: 'old-sheet.xlsx', size: 4096, type: 'file' }
]

function canvasContext () {
  const gradient = { addColorStop () {} }
  return new Proxy({}, {
    get (target, property) {
      if (property === 'createLinearGradient') return () => gradient
      if (!(property in target)) target[property] = () => {}
      return target[property]
    },
    set (target, property, value) {
      target[property] = value
      return true
    }
  })
}

async function renderPage ({ reducedMotion = false, finePointer = true } = {}) {
  const opened = []
  const frameCallbacks = new Map()
  let nextFrame = 1
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', error => {
    if (!/navigation \(except hash changes\)/i.test(error.message)) throw error
  })

  const dom = new JSDOM(source, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://quarkbobo.github.io/COCKY%20ZHOU/',
    virtualConsole,
    beforeParse (window) {
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true })
      window.fetch = async url => ({
        ok: true,
        status: 200,
        async json () {
          return String(url).includes('/source/files/backup?') ? backupItems : apiItems
        },
        async text () { return '' }
      })
      window.open = (...args) => opened.push(args)
      window.matchMedia = query => ({
        matches: query.includes('prefers-reduced-motion') ? reducedMotion : finePointer,
        media: query,
        addEventListener () {},
        removeEventListener () {}
      })
      window.requestAnimationFrame = callback => {
        const id = nextFrame++
        frameCallbacks.set(id, callback)
        return id
      }
      window.cancelAnimationFrame = id => frameCallbacks.delete(id)
      window.HTMLCanvasElement.prototype.getContext = () => canvasContext()
    }
  })

  await new Promise(resolve => setTimeout(resolve, 30))
  return { dom, document: dom.window.document, opened, frameCallbacks }
}

test('the rendered file center uses the deep-space data-bay shell', async () => {
  const page = await renderPage()
  const { document } = page

  assert.equal(document.documentElement.lang, 'zh-CN')
  assert.equal(document.querySelector('a.home-link')?.getAttribute('href'), '/')
  assert.match(document.querySelector('a.home-link')?.textContent || '', /蓝色空间号/)
  assert.ok(document.querySelector('main#file-center'))
  assert.equal(document.querySelector('#q')?.getAttribute('aria-label'), '搜索文件名')
  assert.equal(document.querySelector('#starfield')?.getAttribute('aria-hidden'), 'true')

  const rootStyle = page.dom.window.getComputedStyle(document.documentElement)
  assert.equal(rootStyle.getPropertyValue('--space').trim().toUpperCase(), '#02040B')
  assert.equal(rootStyle.getPropertyValue('--bay').trim().toUpperCase(), '#08162A')
  assert.equal(rootStyle.getPropertyValue('--signal').trim().toUpperCase(), '#38BDF8')
  assert.equal(rootStyle.getPropertyValue('--nebula').trim().toUpperCase(), '#8B5CF6')
  assert.equal(rootStyle.getPropertyValue('--ink').trim().toUpperCase(), '#E8F2FF')
  assert.equal(rootStyle.getPropertyValue('--mist').trim().toUpperCase(), '#91A8C4')

  page.dom.window.close()
})

test('files support filtering and direct opening without an in-page preview', async () => {
  const page = await renderPage()
  const { document } = page

  assert.equal(document.querySelectorAll('.file-item').length, 6)
  assert.equal(document.querySelector('#fileCount').textContent, '共 6 个文件')
  assert.equal(document.querySelector('#list img'), null, 'escaped file names cannot inject markup')
  assert.equal(document.querySelector('#articleSection'), null)
  assert.equal(document.querySelector('.btn-preview'), null)
  assert.equal(document.querySelector('script[src*="marked"]'), null)

  const textFilter = document.querySelector('[data-filter=".txt"]')
  textFilter.click()
  assert.equal(textFilter.getAttribute('aria-pressed'), 'true')
  assert.equal(document.querySelector('[data-filter="all"]').getAttribute('aria-pressed'), 'false')
  assert.equal(document.querySelectorAll('.file-item').length, 3)

  document.querySelector('[data-filter="all"]').click()
  const search = document.querySelector('#q')
  search.value = 'backup'
  search.dispatchEvent(new page.dom.window.Event('input', { bubbles: true }))
  assert.deepEqual(
    [...document.querySelectorAll('.file-name')].map(element => element.textContent),
    ['backup/history.txt', 'backup/old-sheet.xlsx']
  )

  search.value = ''
  search.dispatchEvent(new page.dom.window.Event('input', { bubbles: true }))
  const markdownRow = [...document.querySelectorAll('.file-item')]
    .find(row => row.querySelector('.file-name').textContent === 'guide.md')
  assert.deepEqual([...markdownRow.querySelectorAll('.btn')].map(button => button.textContent), ['打开', '下载'])
  markdownRow.querySelector('[data-open]').click()
  assert.deepEqual(page.opened, [['/files/guide.md', '_blank', 'noopener']])

  const backupRow = [...document.querySelectorAll('.file-item')]
    .find(row => row.querySelector('.file-name').textContent === 'backup/history.txt')
  backupRow.querySelector('[data-open]').click()
  assert.deepEqual(page.opened[1], ['/files/backup/history.txt', '_blank', 'noopener'])

  page.dom.window.close()
})

test('the particle field exposes a static reduced-motion state and accessible controls', async () => {
  const page = await renderPage({ reducedMotion: true })
  const { document } = page
  const snapshot = page.dom.window.__fileStarfieldMetrics?.snapshot()

  assert.deepEqual(
    JSON.parse(JSON.stringify(snapshot)),
    { initialized: true, reducedMotion: true, animating: false }
  )
  assert.equal(page.frameCallbacks.size, 0)
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i)
  assert.match(source, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/i)
  assert.match(source, /:focus-visible/i)
  assert.equal(page.dom.window.getComputedStyle(document.querySelector('.tab-btn')).minHeight, '44px')

  page.dom.window.close()
})
