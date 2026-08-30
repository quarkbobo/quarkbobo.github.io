const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const hash = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex').toUpperCase()
const sceneTemplate = () => read('themes/fluid-particle/layout/_partial/space-scene.ejs')
const sceneCss = () => read('themes/fluid-particle/source/css/space-scene.css')

test('ringed star exposes five distinct double-stroked prominence events and clipped surface flares', () => {
  const template = sceneTemplate()
  const groups = [...template.matchAll(/<g\b[^>]*class="[^"]*\bsaturn-prominence\b[^"]*"[^>]*>([\s\S]*?)<\/g>/g)]
  assert.equal(groups.length, 5)
  assert.equal(new Set([...template.matchAll(/saturn-prominence--([\w-]+)/g)].map(match => match[1])).size, 5)
  for (const group of groups) {
    assert.match(group[1], /class="prominence-glow"/)
    assert.match(group[1], /class="prominence-core"/)
  }
  assert.match(template, /<svg\b[^>]*class="saturn-prominences"[^>]*aria-hidden="true"/)
  assert.match(template, /<div class="saturn-flares"><\/div>/)
  assert.ok(template.indexOf('saturn-ring--back') < template.indexOf('saturn-prominences'))
  assert.ok(template.indexOf('saturn-prominences') < template.indexOf('<div class="saturn">'))
  assert.ok(template.indexOf('saturn-light') < template.indexOf('saturn-ring--front'))
})

test('ring and surface share one equatorial angle and animated SVG groups use local transform geometry', () => {
  const css = sceneCss()
  assert.match(css, /\.saturn-system\s*\{[^}]*--saturn-equator-angle:\s*-10deg;/s)
  assert.match(css, /\.saturn-ring\s*\{[^}]*transform:\s*rotate\(var\(--saturn-equator-angle\)\);/s)
  assert.match(css, /\.saturn-bands\s*\{[^}]*transform:\s*rotate\(var\(--saturn-equator-angle\)\)/s)
  assert.match(css, /\.saturn-prominence\s*\{[^}]*transform-box:\s*fill-box;[^}]*transform-origin:\s*var\(--prominence-origin\);/s)
})

test('stellar motion uses one-way compositor animations and supplies fallback controls', () => {
  const css = sceneCss()
  const animationNames = [
    'saturn-gas-rotation',
    'saturn-magnetic-rotation',
    'saturn-flare-transit',
    'saturn-prominence-breathe'
  ]

  for (const name of animationNames) {
    const keyframes = css.match(new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'))?.[1]
    assert.ok(keyframes, `${name} keyframes exist`)
    assert.doesNotMatch(keyframes, /\b(background-position|filter|box-shadow)\s*:/)
    assert.match(keyframes, /\b(transform|opacity)\s*:/)
  }

  for (const [target, animation] of [
    ['.saturn-bands::before', 'saturn-gas-rotation'],
    ['.saturn-bands::after', 'saturn-magnetic-rotation']
  ]) {
    const selector = target.replace(/[:.]/g, '\\$&')
    const rules = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g'))].map(match => match[1])
    const animationRule = rules.find(rule => rule.includes(`animation: ${animation}`))
    assert.ok(animationRule, `${target} animation rule exists`)
    assert.match(animationRule, new RegExp(`animation:\\s*${animation}\\s+\\d+(?:\\.\\d+)?s\\s+linear\\s+infinite;`))
    assert.doesNotMatch(animationRule, /\balternate\b/)
  }

  const pausedTargets = [
    '.saturn-bands::before',
    '.saturn-bands::after',
    '.saturn-flares',
    '.saturn-prominence'
  ]
  for (const state of ['.motion-paused', '.particle-fallback']) {
    for (const target of pausedTargets) {
      const selector = `${state} ${target}`
      assert.match(css, new RegExp(selector.replace(/[:.]/g, '\\$&')))
    }
  }
  assert.match(css, /\.motion-paused[\s\S]*?\.particle-fallback[\s\S]*?animation-play-state:\s*paused;/)
  assert.doesNotMatch(css, /saturn-(?:gas|magnetic|flare|prominence)[\s\S]{0,100}\balternate\b/)
  assert.match(read('themes/fluid-particle/source/css/main.css'), /\.home-hero:has\(\.particle-fallback\) \.motion-toggle\s*\{\s*display:\s*none;\s*\}/)
})

test('particle renderer and Canvas visual contract stay unchanged', () => {
  assert.equal(hash('themes/fluid-particle/source/js/particle-core.js'), 'A16D193E8874DF1248532458B3114AC0393B746431EF2559C5A2A2035B5F11E0')
  assert.equal(hash('themes/fluid-particle/source/js/particle-flow.js'), '45982BE65E5F465C730DEA7E3E1FCC8FCBC93F6B9C238B346C11F028FD116D2A')
  const css = sceneCss()
  assert.match(css, /#particle-flow\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*1;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*opacity:\s*0\.88;/s)
  assert.match(css, /\.particle-fallback #particle-flow\s*\{[^}]*display:\s*none;/s)
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?#particle-flow\s*\{[^}]*opacity:\s*0\.68;/)
  assert.doesNotMatch(css.match(/\.space-scene\s*\{([^}]*)\}/)?.[1] || '', /\btransform\s*:/)
  assert.equal((sceneTemplate().match(/<canvas id="particle-flow"><\/canvas>/g) || []).length, 1)
})
