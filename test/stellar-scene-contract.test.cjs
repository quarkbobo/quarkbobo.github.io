const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const hash = relative => crypto.createHash('sha256').update(read(relative).replace(/\r\n/g, '\n')).digest('hex').toUpperCase()
const sceneTemplate = () => read('themes/fluid-particle/layout/_partial/space-scene.ejs')
const sceneCss = () => read('themes/fluid-particle/source/css/space-scene.css')

test('realistic planet has one static fallback and one surface canvas with no stellar effects', () => {
  const template = sceneTemplate()
  const css = sceneCss()
  assert.equal((template.match(/id="planet-surface"/g) || []).length, 1)
  assert.equal((template.match(/class="planet-static-surface"/g) || []).length, 1)
  assert.equal((template.match(/class="saturn-ring saturn-ring--back"/g) || []).length, 1)
  assert.equal((template.match(/class="saturn-ring saturn-ring--front"/g) || []).length, 1)
  assert.doesNotMatch(template, /saturn-prominence|saturn-flares|<svg\b/i)
  assert.doesNotMatch(`${template}\n${css}`, /https?:\/\/|data:image|url\(/i)
  assert.ok(template.indexOf('saturn-ring--back') >= 0)
  assert.ok(template.indexOf('saturn-ring--back') < template.indexOf('<div class="saturn">'))
  assert.ok(template.indexOf('planet-static-surface') < template.indexOf('id="planet-surface"'))
  assert.ok(template.indexOf('id="planet-surface"') < template.indexOf('saturn-light'))
  assert.ok(template.indexOf('saturn-light') < template.indexOf('saturn-ring--front'))
})

test('dust ring and Canvas surface share the one minus-ten-degree equator', () => {
  const css = sceneCss()
  assert.match(css, /\.saturn-system\s*\{[^}]*--saturn-equator-angle:\s*-10deg;/s)
  assert.match(css, /\.saturn-system\s*\{[^}]*transform:\s*translate\(var\(--planet-desktop-shift-x\),\s*-50%\);/s)
  assert.doesNotMatch(css.match(/\.saturn-system\s*\{([^}]*)\}/s)?.[1] || '', /rotate\(/)
  assert.match(css, /\.saturn-ring\s*\{[^}]*transform:\s*rotate\(var\(--saturn-equator-angle\)\);/s)
  assert.match(css, /#planet-surface\s*\{[^}]*--planet-equator-angle:\s*var\(--saturn-equator-angle\);/s)
  assert.doesNotMatch(css, /@keyframes\s+saturn-|saturn-(?:prominence|flare|gas|magnetic)/)
})

test('ring dimensions and restrained edge encode the approved dust geometry', () => {
  const css = sceneCss()
  const ringRule = css.match(/\.saturn-ring\s*\{([^}]*)\}/s)?.[1] || ''
  assert.match(css, /\.saturn\s*\{[^}]*width:\s*62%;[^}]*aspect-ratio:\s*43\s*\/\s*38;/s)
  assert.match(css, /\.saturn-ring\s*\{[^}]*left:\s*-9%;[^}]*width:\s*118%;[^}]*height:\s*23%;/s)
  assert.match(css, /--ring-inner-stop:\s*90\.5%;/)
  assert.equal((ringRule.match(/rgba\(104,\s*217,\s*244,\s*0\.2[0-9]\)/g) || []).length, 1)
  assert.doesNotMatch(ringRule, /\b(?:border|box-shadow|filter)\s*:/)
  assert.doesNotMatch(css, /drop-shadow\([^)]*(?:149,\s*104,\s*255|234,\s*251,\s*255)/)
})

test('static planet, fixed light, and dust ring contain no warm mineral fallback colors', () => {
  const css = sceneCss()
  const staticRule = css.match(/\.planet-static-surface\s*\{([^}]*)\}/s)?.[1] || ''
  const ringRule = css.match(/\.saturn-ring\s*\{([^}]*)\}/s)?.[1] || ''
  assert.doesNotMatch(css, /(?:240,\s*211,\s*177|180,\s*95,\s*104)/)
  assert.doesNotMatch(staticRule, /transparent\s+0\s+\d+%/)
  assert.match(css, /rgba\(146,\s*166,\s*232,\s*0\.18\)/)
  assert.match(ringRule, /rgba\(105,\s*94,\s*164,\s*0\.1\)/)
  assert.equal((ringRule.match(/rgba\(104,\s*217,\s*244,\s*0\.24\)/g) || []).length, 1)
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
