// Independent browser acceptance checks for the standalone proposal pages.
// Run with Node 22+: node docs/layout-proposals/verify.cjs
// This file only writes evidence/verification*; production files are read-only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { launch } = require('../../tools/verify-planet-explorer.cjs')
const { serve } = require('./serve.cjs')

const proposalRoot = __dirname
const pages = ['index.html', 'home-a.html', 'home-b.html', 'article.html', 'article-toc.html', 'archive.html', 'games.html']
const evidenceRoot = path.join(proposalRoot, 'evidence')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outputRoot = path.join(evidenceRoot, `verification-${runId}`)
const report = {
  generatedAt: new Date().toISOString(),
  criteria: {
    overflow: 'Exact viewport; document/body scrollWidth <= clientWidth; rendered interactive/title boxes and text may not be horizontally clipped.',
    targets: 'Every rendered a/button/summary outside article-body inline text has height >=44 CSS px. Article-body inline and heading-permalink links are recorded but excluded from major target sizing.',
    focus: 'Real keyboard Tab reaches a focus-visible element with a visible outline or changed box shadow/background/border.',
    fontZoom: 'html.style.fontSize=200%; computed root font size must be at least twice its normal value. No browser page scaling.',
    navigation: 'Every local href returns HTTP success and every fragment resolves in its destination HTML; external game href attributes equal the harvested source exactly.',
    toc: 'Mobile native details starts closed, keyboard opens it and activates a real fragment; desktop right sidebar uses sticky positioning.',
    animation: 'Reduced-motion media is emulated; no running or pending Web Animations remain.',
    retryPolicy: 'No automatic retries; every assertion failure is retained in this run and past run directories remain intact.'
  },
  cases: [], sensitivity: {}, failures: [], sourceHashes: {}
}

function log (message) {
  const line = `${new Date().toISOString()} ${message}\n`
  process.stdout.write(line)
  fs.appendFileSync(path.join(outputRoot, 'verification.log'), line)
}

function check (result, label, condition, detail) {
  const item = { label, passed: Boolean(condition), ...(detail === undefined ? {} : { detail }) }
  result.checks.push(item)
  if (!item.passed) {
    result.passed = false
    report.failures.push({ case: result.name, ...item })
    log(`FAIL ${result.name}: ${label} ${detail === undefined ? '' : JSON.stringify(detail)}`)
  }
}

// Deliberately shared, unchanged by the sensitivity experiment below.
function assertNoHorizontalOverflow (geometry, expectedWidth) {
  assert.equal(geometry.innerWidth, expectedWidth, 'exact viewport width')
  assert.ok(geometry.pageWidth <= geometry.clientWidth && geometry.bodyWidth <= geometry.clientWidth,
    `horizontal overflow: viewport=${geometry.clientWidth}, document=${geometry.pageWidth}, body=${geometry.bodyWidth}`)
  assert.deepEqual(geometry.clipped, [], 'interactive/title containers or text are horizontally clipped')
}

const geometryScript = `(() => {
  const visible = el => {
    if (!el.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})) return false;
    const r=el.getBoundingClientRect();return r.width>0 && r.height>0;
  };
  const describe=el => el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+'.'+[...el.classList].join('.')+' '+el.textContent.trim().replace(/\\s+/g,' ').slice(0,90);
  const clipped=[];
  for (const el of document.querySelectorAll('a,button,summary,h1,h2,h3,h4,[data-entry]')) {
    if (!visible(el)) continue;
    const r=el.getBoundingClientRect(), reasons=[];
    if (r.left < -1 || r.right > document.documentElement.clientWidth+1) reasons.push('box outside horizontal viewport');
    if (el.clientWidth>0 && el.scrollWidth>el.clientWidth+1) reasons.push('content wider than own container');
    let left=0,right=document.documentElement.clientWidth;
    for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/hidden|clip|scroll|auto/.test(s.overflowX)){const b=p.getBoundingClientRect();left=Math.max(left,b.left);right=Math.min(right,b.right);}}
    if(r.left<left-1 || r.right>right+1)reasons.push('box clipped by ancestor');
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      if(!walker.currentNode.textContent.trim())continue;
      const range=document.createRange();range.selectNodeContents(walker.currentNode);
      for(const b of range.getClientRects())if(b.width>0 && (b.left<left-1 || b.right>right+1)){reasons.push('text clipped or outside horizontal viewport');break;}
    }
    if(reasons.length)clipped.push({element:describe(el),reasons:[...new Set(reasons)],rect:{left:r.left,right:r.right,width:r.width},clientWidth:el.clientWidth,scrollWidth:el.scrollWidth});
  }
  const at=selector=>{const el=document.querySelector(selector);return el?Math.round(el.getBoundingClientRect().top+scrollY):null;};
  const links=[...document.querySelectorAll('a[href]')].map(a=>{const r=a.getBoundingClientRect();return {text:a.textContent.trim(),href:a.getAttribute('href'),absoluteHref:a.href,rendered:visible(a),inViewport:visible(a)&&r.bottom>0&&r.top<innerHeight,major:!a.closest('.article-body'),height:r.height,width:r.width,target:a.target};});
  const targets=[...document.querySelectorAll('a[href],button,summary')].filter(el=>visible(el)&&!(el.tagName==='A'&&el.closest('.article-body'))).map(el=>({element:describe(el),height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width}));
  return {innerWidth,clientWidth:document.documentElement.clientWidth,pageWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,pageHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),rootFontSize:parseFloat(getComputedStyle(document.documentElement).fontSize),latestY:at('#latest-posts'),bodyY:at('.article-body'),entryCount:document.querySelectorAll('[data-entry]').length,visibleLinkCount:links.filter(a=>a.rendered).length,viewportLinkCount:links.filter(a=>a.inViewport).length,links,targets,clipped};
})()`

async function navigate (browser, url, zoom = false) {
  await browser.send('Page.navigate', { url })
  await browser.until(`location.href===${JSON.stringify(url)} && document.readyState==='complete'`, 'destination loaded', 12000)
  await browser.evaluate('document.fonts.ready')
  const normalFontSize = await browser.evaluate('parseFloat(getComputedStyle(document.documentElement).fontSize)')
  if (zoom) await browser.evaluate("document.documentElement.style.fontSize='200%'")
  await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  return normalFontSize
}

async function capture (browser, result, label, fullPage = false) {
  if (label !== 'focus') await browser.evaluate("window.scrollTo({top:0,left:0,behavior:'instant'})")
  let options = { format: 'png', captureBeyondViewport: fullPage }
  if (fullPage) {
    const metrics = await browser.send('Page.getLayoutMetrics')
    const size = metrics.cssContentSize || metrics.contentSize
    options.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 }
  }
  const shot = await browser.send('Page.captureScreenshot', options)
  const filename = `${result.name}-${label}.png`
  const bytes = Buffer.from(shot.data, 'base64')
  fs.writeFileSync(path.join(outputRoot, filename), bytes)
  result.screenshots.push({ filename, sha256: createHash('sha256').update(bytes).digest('hex') })
}

async function key (browser, value) {
  const keyCodes = { Tab: 9, Enter: 13, Escape: 27 }
  // Enter needs a character event for native summary/link activation in CDP.
  // See evidence/verification-key-diagnostic.json: omitting text produces no
  // trusted keypress/click even though keydown and keyup are delivered.
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value, windowsVirtualKeyCode: keyCodes[value], ...(value === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value, windowsVirtualKeyCode: keyCodes[value] })
}

async function checkFocus (browser, result) {
  await browser.evaluate(`(() => {
    document.activeElement?.blur();window.scrollTo(0,0);
    window.__layoutUnfocused=new Map([...document.querySelectorAll('a,button,summary')].map(el=>{const s=getComputedStyle(el);return[el,{outline:s.outline,boxShadow:s.boxShadow,backgroundColor:s.backgroundColor,borderColor:s.borderColor}]}));
  })()`)
  const records = []
  for (let index = 0; index < 8; index++) {
    await key(browser, 'Tab')
    const record = await browser.evaluate(`(() => {
      const el=document.activeElement,s=getComputedStyle(el),b=window.__layoutUnfocused.get(el),r=el.getBoundingClientRect();
      const outline=parseFloat(s.outlineWidth)>=1 && s.outlineStyle!=='none' && s.outlineColor!=='transparent' && s.outlineColor!=='rgba(0, 0, 0, 0)';
      const changed=Boolean(b)&&((s.boxShadow!=='none'&&s.boxShadow!==b.boxShadow)||s.backgroundColor!==b.backgroundColor||s.borderColor!==b.borderColor);
      return {tag:el.tagName,id:el.id,text:el.textContent.trim().replace(/\\s+/g,' ').slice(0,80),focusVisible:el.matches(':focus-visible'),visible:el.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})&&r.width>0&&r.height>0,inViewport:r.top<innerHeight&&r.bottom>0,indicator:outline||changed,outline:s.outline,boxShadow:s.boxShadow};
    })()`)
    records.push(record)
  }
  result.focus = records
  check(result, 'keyboard Tab gives each sampled control a visible focus indicator', records.every(r => r.tag !== 'BODY' && r.focusVisible && r.visible && r.inViewport && r.indicator), records)
}

async function checkNavigation (browser, result, localOrigin) {
  const links = result.metrics.links
  const unique = [...new Set(links.map(link => link.absoluteHref))]
  result.navigation = []
  for (const href of unique) {
    const url = new URL(href)
    if (url.origin !== localOrigin) {
      result.navigation.push({ href, type: 'external', scheme: url.protocol })
      check(result, `external href uses a supported scheme: ${href}`, ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol))
      continue
    }
    const response = await fetch(url)
    const record = { href, type: 'local', status: response.status, hashFound: null }
    if (response.ok && url.hash) {
      const html = await response.text()
      const id = decodeURIComponent(url.hash.slice(1))
      record.hashFound = await browser.evaluate(`Boolean(new DOMParser().parseFromString(${JSON.stringify(html)},'text/html').getElementById(${JSON.stringify(id)}))`)
    }
    result.navigation.push(record)
    check(result, `local href resolves: ${url.pathname}${url.hash}`, response.ok && record.hashFound !== false, record)
  }
}

async function checkToc (browser, result, options, content) {
  const info = await browser.evaluate(`(() => {
    const visible=el=>el.checkVisibility({checkVisibilityCSS:true,checkOpacity:true})&&el.getBoundingClientRect().width>0;
    const details=[...document.querySelectorAll('details')].find(d=>d.querySelector('a[href^="#"]'));
    const sidebar=[...document.querySelectorAll('aside,nav,[data-toc],.toc-panel,.toc-sidebar')].find(el=>visible(el)&&el.querySelector('a[href="#void"]')&&getComputedStyle(el).position==='sticky');
    const body=document.querySelector('.article-body')?.getBoundingClientRect();
    const box=sidebar?.getBoundingClientRect();
    return {details:details?{visible:visible(details),open:details.open,id:details.id,hrefs:[...details.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href'))}:null,sidebar:sidebar?{position:getComputedStyle(sidebar).position,top:getComputedStyle(sidebar).top,left:box.left,right:box.right,width:box.width}:null,body:body?{left:body.left,right:body.right}:null};
  })()`)
  result.toc = info
  const expected = content.articles.withToc.tocEntries.map(item => item.href)
  if (options.width <= 390) check(result, 'phone view exposes the native collapsible TOC', Boolean(info.details?.visible), info)
  if (options.width === 1440 && !options.zoom) check(result, 'desktop view exposes the sticky sidebar TOC', Boolean(info.sidebar), info)
  if (info.details?.visible) {
    check(result, 'mobile TOC uses native details initially closed', info.details.open === false, info.details)
    check(result, 'mobile TOC contains all real source fragments', JSON.stringify(info.details.hrefs) === JSON.stringify(expected), { expected, actual: info.details.hrefs })
    await browser.evaluate('document.activeElement?.blur();document.body.focus();window.scrollTo(0,0)')
    let reached = false
    for (let index = 0; index < 150; index++) {
      await key(browser, 'Tab')
      reached = await browser.evaluate(`document.activeElement?.tagName==='SUMMARY' && Boolean(document.activeElement.parentElement.querySelector('a[href="#void"]'))`)
      if (reached) break
    }
    check(result, 'keyboard Tab reaches the mobile TOC summary', reached)
    if (reached) {
      await key(browser, 'Enter')
      const opened = await browser.evaluate('document.activeElement.parentElement.open')
      check(result, 'Enter opens the native TOC', opened)
      await key(browser, 'Tab')
      const focusedHref = await browser.evaluate("document.activeElement.getAttribute('href')")
      check(result, 'next Tab reaches the first actual TOC link', focusedHref === expected[0], focusedHref)
      if (focusedHref === expected[0]) {
        await key(browser, 'Enter')
        await browser.until(`location.hash===${JSON.stringify(expected[0])}`, 'keyboard TOC fragment navigation')
        const target = await browser.evaluate(`(() => { const el=document.getElementById(${JSON.stringify(expected[0].slice(1))});const r=el?.getBoundingClientRect();return {hash:location.hash,found:Boolean(el),visible:Boolean(r)&&r.top<innerHeight&&r.bottom>0};})()`)
        check(result, 'keyboard TOC activation scrolls to its real heading', target.found && target.visible, target)
        const geometry = await browser.evaluate(geometryScript)
        try { assertNoHorizontalOverflow(geometry, options.width); check(result, 'opened mobile TOC has no horizontal overflow', true) } catch (error) { check(result, 'opened mobile TOC has no horizontal overflow', false, { error: error.message, geometry }) }
        check(result, 'opened TOC targets retain 44px height', geometry.targets.every(target => target.height >= 43.99), geometry.targets.filter(target => target.height < 43.99))
        await capture(browser, result, 'toc-open')
      }
    }
  } else {
    check(result, 'desktop TOC is sticky to the right of the reading column', Boolean(info.sidebar && info.body && info.sidebar.left >= info.body.right - 1 && info.sidebar.top !== 'auto'), info)
    const actual = await browser.evaluate(`(() => {const el=[...document.querySelectorAll('aside,nav,[data-toc],.toc-panel,.toc-sidebar')].find(el=>el.checkVisibility({checkVisibilityCSS:true})&&el.querySelector('a[href="#void"]')&&getComputedStyle(el).position==='sticky');return el?[...el.querySelectorAll('a[href^="#"]')].map(a=>a.getAttribute('href')):[];})()`)
    check(result, 'desktop TOC contains all real source fragments', JSON.stringify(actual) === JSON.stringify(expected), { expected, actual })
    if (info.sidebar) {
      result.toc.scrolled = await browser.evaluate(`(() => {window.scrollTo(0,Math.min(500,document.documentElement.scrollHeight-innerHeight));const el=[...document.querySelectorAll('aside,nav,[data-toc],.toc-panel,.toc-sidebar')].find(el=>el.checkVisibility({checkVisibilityCSS:true})&&getComputedStyle(el).position==='sticky'&&el.querySelector('a[href="#void"]'));const r=el?.getBoundingClientRect();return {scrollY,top:r?.top,left:r?.left,position:el?getComputedStyle(el).position:null};})()`)
    }
  }
}

async function checkContent (browser, result, page, content) {
  if (page.startsWith('home-')) {
    const detail = await browser.evaluate(`(() => ({text:document.body.innerText,canvases:document.querySelectorAll('canvas').length,originalLinks:[...document.querySelectorAll('a[href]')].filter(a=>/原站|原网站|3D/.test(a.textContent)).map(a=>({text:a.textContent,href:a.getAttribute('href')})),captions:[...document.querySelectorAll('figcaption,.planet-caption,[data-planet-caption]')].map(el=>el.innerText)}))()`)
    check(result, 'homepage presents every real post title', content.posts.every(post => detail.text.includes(post.title)))
    check(result, 'planet is explicitly captioned as a static original-site image', detail.captions.some(text => /静帧|静态|截图/.test(text)), detail.captions)
    check(result, 'planet has a real original-site experience link', detail.originalLinks.some(link => link.href.startsWith(content.originalOrigin) || link.href.startsWith('/original/')), detail.originalLinks)
    check(result, 'static proposal does not claim a live canvas-rendered planet', detail.canvases === 0, detail.canvases)
    check(result, 'latest-posts measurement is available', Number.isFinite(result.metrics.latestY))
  }
  if (page === 'article.html' || page === 'article-toc.html') {
    const source = page === 'article.html' ? content.articles.v4 : content.articles.withToc
    const integrity = await browser.evaluate(`(() => {const normalize=s=>s.replace(/\\s+/g,' ').trim();const source=new DOMParser().parseFromString(${JSON.stringify(source.bodyHtml)},'text/html');const body=document.querySelector('.article-body');return {title:document.querySelector('h1')?.textContent.trim(),actual:normalize(body?.textContent||''),expected:normalize(source.body.textContent),headingIds:[...(body?.querySelectorAll('h2,h3,h4')||[])].map(el=>el.id)};})()`)
    result.contentIntegrity = integrity
    check(result, 'article title and complete real body are preserved', integrity.title === source.title && integrity.actual === integrity.expected, integrity)
    if (page === 'article.html') check(result, 'V4 article does not invent a TOC', await browser.evaluate(`document.querySelectorAll('.toc, [data-toc], details').length===0`))
    else check(result, 'real article heading fragment IDs are preserved', JSON.stringify(integrity.headingIds) === JSON.stringify(source.headings.map(heading => heading.id)), integrity.headingIds)
    check(result, 'article body position is measurable', Number.isFinite(result.metrics.bodyY))
  }
  if (page === 'games.html') {
    const actual = await browser.evaluate(`Array.from(document.querySelectorAll('a[href]'),a=>({title:a.textContent.trim(),href:a.getAttribute('href')}))`)
    const gameEntries = content.games.links.map(game => ({ expected: game, matches: actual.filter(link => link.href === game.href) }))
    result.gameLinks = gameEntries
    check(result, 'all four original game href attributes are preserved exactly', gameEntries.every(game => game.matches.length === 1 && game.matches[0].title.includes(game.expected.title)), gameEntries)
    check(result, 'games use the measured count of four entries', result.metrics.entryCount === content.games.links.length, { expected: content.games.links.length, actual: result.metrics.entryCount })
  }
  if (page === 'archive.html') {
    const text = await browser.evaluate('document.body.innerText')
    check(result, 'archive includes every true source entry', content.archive.every(entry => text.includes(entry.title)))
  }
}

async function runPage (browser, browserState, options, page, baseUrl, content) {
  const name = `${page.replace('.html', '')}-${options.width}x${options.height}${options.zoom ? '-font200' : ''}${options.reducedMotion ? '-reduced' : ''}`
  const result = { name, page, viewport: { width: options.width, height: options.height }, textZoom: options.zoom ? 200 : 100, reducedMotion: Boolean(options.reducedMotion), passed: true, checks: [], screenshots: [], consoleErrors: [] }
  report.cases.push(result)
  browserState.consoleErrors.length = 0
  try {
    const normalFontSize = await navigate(browser, new URL(page, baseUrl).href, options.zoom)
    result.metrics = await browser.evaluate(geometryScript)
    try { assertNoHorizontalOverflow(result.metrics, options.width); check(result, 'no horizontal overflow or clipped interactive/title containers', true) } catch (error) { check(result, 'no horizontal overflow or clipped interactive/title containers', false, { error: error.message, geometry: result.metrics.clipped, pageWidth: result.metrics.pageWidth, bodyWidth: result.metrics.bodyWidth }) }
    check(result, 'all rendered major targets are at least 44 CSS px high', result.metrics.targets.every(target => target.height >= 43.99), result.metrics.targets.filter(target => target.height < 43.99))
    if (options.zoom) check(result, 'text-size emulation doubles computed root font size', result.metrics.rootFontSize >= normalFontSize * 2 - 0.01, { normalFontSize, actual: result.metrics.rootFontSize })
    if (options.width === 1440 || options.width === 390) {
      await capture(browser, result, 'viewport')
      await capture(browser, result, 'full', true)
    }
    await checkFocus(browser, result)
    if (options.width === 390 || options.width === 1440) await capture(browser, result, 'focus')
    await checkNavigation(browser, result, new URL(baseUrl).origin)
    await checkContent(browser, result, page, content)
    if (page === 'article-toc.html') {
      await navigate(browser, new URL(page, baseUrl).href, options.zoom)
      await checkToc(browser, result, options, content)
    }
    if (options.reducedMotion) {
      const motion = await browser.evaluate(`({matches:matchMedia('(prefers-reduced-motion: reduce)').matches,animations:document.getAnimations().filter(a=>a.playState==='running'||a.pending).map(a=>({playState:a.playState,pending:a.pending}))})`)
      check(result, 'reduced-motion request is active and leaves no running animations', motion.matches && motion.animations.length === 0, motion)
    }
    result.consoleErrors = [...browserState.consoleErrors]
    check(result, 'browser console has no errors', result.consoleErrors.length === 0, result.consoleErrors)
  } catch (error) {
    check(result, 'case completed without infrastructure exceptions', false, error.stack || String(error))
    try { await capture(browser, result, 'failure') } catch (captureError) { result.captureError = captureError.message }
  }
  if (!result.passed && !result.screenshots.some(item => item.filename.endsWith('-failure.png'))) {
    try { await capture(browser, result, 'failure') } catch (captureError) { result.captureError = captureError.message }
  }
  log(`${result.passed ? 'PASS' : 'FAIL'} ${name}: ${result.checks.filter(check => check.passed).length}/${result.checks.length} checks; pageHeight=${result.metrics?.pageHeight}; latestY=${result.metrics?.latestY}; bodyY=${result.metrics?.bodyY}; entries=${result.metrics?.entryCount}`)
  // One write per file avoids repeatedly truncating a file that Windows
  // indexing/preview may hold. The complete report is written once at the end.
  fs.writeFileSync(path.join(outputRoot, `verification-case-${name}.json`), JSON.stringify(result, null, 2) + '\n')
}

async function sensitivity () {
  const tempRoot = fs.mkdtempSync(path.join(evidenceRoot, 'verification-sensitivity-'))
  const realEvidence = path.resolve(evidenceRoot)
  assert.equal(path.dirname(path.resolve(tempRoot)), realEvidence)
  assert.ok(path.basename(tempRoot).startsWith('verification-sensitivity-'))
  const result = { tempRoot, assertion: assertNoHorizontalOverflow.toString(), originalHash: null, cases: [], passed: false }
  report.sensitivity = result
  const original = fs.readFileSync(path.join(proposalRoot, 'home-a.html'))
  result.originalHash = createHash('sha256').update(original).digest('hex')
  for (const name of fs.readdirSync(proposalRoot)) {
    const item = path.join(proposalRoot, name)
    if (name !== 'evidence' && (name === 'assets' || /\.(html|css|js|json)$/.test(name))) fs.cpSync(item, path.join(tempRoot, name), { recursive: true })
  }
  const copiedHome = path.join(tempRoot, 'home-a.html')
  const mutant = original.toString('utf8').replace(/<\/body>/i, '<div id="verification-injected-overflow" style="width:200vw;height:48px;background:#e73552;color:white">Intentional overflow sensitivity fixture</div></body>')
  assert.notEqual(mutant, original.toString('utf8'), 'fixture injection matched closing body tag')
  fs.writeFileSync(copiedHome, mutant)
  const { server, url } = await serve(0, tempRoot)
  const state = { consoleErrors: [] }
  let browser
  try {
    browser = await launch({ width: 390, height: 844, reducedMotion: true }, state)
    for (const phase of ['red-injected', 'green-restored']) {
      if (phase === 'green-restored') fs.writeFileSync(copiedHome, original)
      await navigate(browser, new URL('home-a.html', url).href)
      const geometry = await browser.evaluate(geometryScript)
      let accepted = true, error = null
      try { assertNoHorizontalOverflow(geometry, 390) } catch (failure) { accepted = false; error = failure.message }
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' })
      const filename = `sensitivity-${phase}.png`
      fs.writeFileSync(path.join(outputRoot, filename), Buffer.from(shot.data, 'base64'))
      result.cases.push({ phase, accepted, expectedAccepted: phase === 'green-restored', error, geometry, screenshot: filename })
      log(`SENSITIVITY ${phase}: assertion ${accepted ? 'PASS' : 'FAIL'}; document=${geometry.pageWidth}, viewport=${geometry.clientWidth}${error ? '; ' + error : ''}`)
    }
    result.actualHomeUnchanged = createHash('sha256').update(fs.readFileSync(path.join(proposalRoot, 'home-a.html'))).digest('hex') === result.originalHash
    result.passed = result.cases.length === 2 && result.cases.every(item => item.accepted === item.expectedAccepted) && result.actualHomeUnchanged
    if (!result.passed) report.failures.push({ case: 'sensitivity', detail: result })
  } finally {
    fs.writeFileSync(copiedHome, original)
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    // Only the explicitly validated isolated fixture folder is removed.
    assert.equal(path.dirname(path.resolve(tempRoot)), realEvidence)
    assert.ok(path.basename(tempRoot).startsWith('verification-sensitivity-'))
    fs.rmSync(tempRoot, { recursive: true, force: true })
    result.tempRemoved = !fs.existsSync(tempRoot)
  }
}

async function main () {
  fs.mkdirSync(outputRoot, { recursive: true })
  const content = JSON.parse(fs.readFileSync(path.join(proposalRoot, 'content.json'), 'utf8'))
  for (const page of pages) assert.ok(fs.existsSync(path.join(proposalRoot, page)), `required proposal exists: ${page}`)
  for (const filename of fs.readdirSync(proposalRoot).filter(name => /\.(html|css|js|cjs|json)$/.test(name))) {
    report.sourceHashes[filename] = createHash('sha256').update(fs.readFileSync(path.join(proposalRoot, filename))).digest('hex')
  }
  const { server, url } = await serve()
  const startAt = process.argv.find(argument => argument.startsWith('--start-at='))?.slice('--start-at='.length)
  let started = !startAt
  report.scope = startAt ? { type: 'partial', startAt, fullMatrixCases: 56 } : { type: 'full', fullMatrixCases: 56 }
  log(`START ${url}; independent browser assertions; no automatic retries`)
  try {
    const configurations = [
      { width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 844 }, { width: 768, height: 1000 }, { width: 820, height: 900 },
      { width: 1440, height: 1000, zoom: true }, { width: 390, height: 844, zoom: true },
      { width: 1440, height: 1000, reducedMotion: true }
    ]
    for (const options of configurations) {
      const selected = pages.filter(page => {
        const name = `${page.replace('.html', '')}-${options.width}x${options.height}${options.zoom ? '-font200' : ''}${options.reducedMotion ? '-reduced' : ''}`
        if (name === startAt) started = true
        return started
      })
      if (!selected.length) continue
      const state = { consoleErrors: [] }
      const browser = await launch(options, state)
      try { for (const page of selected) await runPage(browser, state, options, page, url, content) } finally { await browser.close() }
    }
    await sensitivity()
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    report.completedAt = new Date().toISOString()
    report.passed = report.cases.length === 56 && report.failures.length === 0 && report.sensitivity.passed === true
    report.summary = { cases: report.cases.length, passed: report.cases.filter(item => item.passed).length, failures: report.failures.length, screenshots: report.cases.reduce((sum, item) => sum + item.screenshots.length, 0) + (report.sensitivity.cases?.length || 0) }
    fs.writeFileSync(path.join(outputRoot, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
    fs.writeFileSync(path.join(evidenceRoot, 'verification-latest.json'), JSON.stringify({ runId, directory: outputRoot, passed: report.passed, summary: report.summary }, null, 2) + '\n')
    log(`COMPLETE ${report.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(report.summary)}; evidence=${outputRoot}`)
  }
  if (!report.passed) process.exitCode = 1
}

module.exports = { assertNoHorizontalOverflow, geometryScript }
if (require.main === module) main().catch(error => {
  if (fs.existsSync(outputRoot)) {
    report.failures.push({ case: 'runner', detail: error.stack || String(error) })
    fs.writeFileSync(path.join(outputRoot, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
    log(`FATAL ${error.stack || String(error)}`)
  } else process.stderr.write((error.stack || String(error)) + '\n')
  process.exitCode = 1
})
