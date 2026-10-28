// Run after npm run build: node tools/verify-games.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { serve, launch } = require('./verify-planet-explorer.cjs')

const output = path.resolve(__dirname, '../.superpowers/games-qa')
const report = { consoleErrors: [], cases: [] }
fs.mkdirSync(output, { recursive: true })

async function press(browser, point) {
  if (browser.mobile) {
    await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
    await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else {
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
  }
}

async function click(browser, selector) {
  await browser.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}), r=e.getBoundingClientRect(); if(r.top<0 || r.bottom>innerHeight) e.scrollIntoView({block:'center',behavior:'instant'}); })()`)
  const point = await browser.evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
  await press(browser, point)
}

async function square(browser, x, y, chinese = false) {
  await browser.evaluate(`game.canvas.scrollIntoView({block:'center',behavior:'instant'})`)
  const point = await browser.evaluate(`(() => {
    const r=game.canvas.getBoundingClientRect();
    const px=game.padding+${x}*game.${chinese ? 'gridSize' : 'squareSize'}${chinese ? '' : '+game.squareSize/2'};
    const py=game.padding+${y}*game.${chinese ? 'gridSize' : 'squareSize'}${chinese ? '' : '+game.squareSize/2'};
    return {x:r.x+px*r.width/game.canvas.width,y:r.y+py*r.height/game.canvas.height};
  })()`)
  await press(browser, point)
}

async function key(browser, name) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name })
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name })
}

async function checkChess(browser, chinese, width) {
  const side = chinese ? 'red' : 'white'
  await browser.until(`typeof game !== 'undefined' && game && game.pieces.length===32`, 'board initialized')
  const start = await browser.evaluate('JSON.stringify(game.pieces)')
  await square(browser, 4, 6, chinese)
  await square(browser, 4, chinese ? 5 : 4, chinese)
  await browser.until('game.moveHistory.length === 2', 'computer replies to player', 7000)
  assert.equal(await browser.evaluate('game.currentTurn'), side)
  await click(browser, '#undoBtn')
  await browser.until('game.moveHistory.length === 0', 'undo processed')
  assert.equal(await browser.evaluate('JSON.stringify(game.pieces)'), start, 'undo restores the entire round')
  await square(browser, 4, 6, chinese)
  await square(browser, 4, chinese ? 5 : 4, chinese)
  await click(browser, '.btn-restart')
  await browser.evaluate('new Promise(resolve => setTimeout(resolve, 900))')
  assert.equal(await browser.evaluate('game.moveHistory.length'), 0, 'restart cancels pending AI')
  assert.equal(await browser.evaluate('JSON.stringify(game.pieces)'), start)
  await browser.evaluate(`const mode=document.querySelector('#gameMode'); mode.value='local'; mode.dispatchEvent(new Event('change'))`)
  await square(browser, 4, 6, chinese)
  await square(browser, 4, chinese ? 5 : 4, chinese)
  await browser.evaluate('new Promise(resolve => setTimeout(resolve, 600))')
  assert.equal(await browser.evaluate('game.moveHistory.length'), 1, 'local mode waits for the other player')
  await click(browser, '.btn-restart')
  report.cases.push(`${chinese ? 'xiangqi' : 'chess'} ${width}: human move, AI reply, full-round undo, restart cancellation, local mode`)
}

async function check2048(browser, width) {
  await browser.until(`document.querySelectorAll('.g2048-tile').length === 2`, '2048 initialized')
  await browser.evaluate(`board2048.scrollIntoView({block:'center',behavior:'instant'}); board2048.focus({preventScroll:true})`)
  await key(browser, 'ArrowLeft')
  await browser.until(`document.querySelector('#score2048').textContent === '4' && !game2048.busy`, 'merge commits after slide')
  const before = await browser.evaluate('JSON.stringify(game2048.grid)')
  await key(browser, 'ArrowUp')
  assert.equal(await browser.evaluate('JSON.stringify(game2048.grid)'), before, 'blocked move cannot spawn a tile')
  if (browser.mobile) {
    const p = await browser.evaluate(`(() => { const r=board2048.getBoundingClientRect(); return {x:r.x+r.width*.25,y:r.y+r.height*.5,dx:r.width*.5}; })()`)
    await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] })
    await browser.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + p.dx, y: p.y, id: 1 }] })
    await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } else await key(browser, 'ArrowRight')
  await browser.until('!game2048.busy && game2048.grid.flat().reduce((a,b)=>a+b,0) === 8', 'swipe or keyboard slides and spawns')
  await click(browser, '[data-direction="left"]')
  await browser.evaluate('new Promise(resolve => setTimeout(resolve, 400))')
  assert.equal(await browser.evaluate('game2048.grid.flat().reduce((a,b)=>a+b,0)'), 10, 'direction tap moves once, even with a compatibility click')
  await click(browser, '#reset2048')
  await browser.until('game2048.score === 0', 'restart processed')
  await browser.send('Page.reload')
  await browser.until(`document.readyState === 'complete' && document.querySelector('#best2048')?.textContent === '4'`, 'best score survives reload')
  await browser.evaluate(`board2048.scrollIntoView({block:'center',behavior:'instant'}); board2048.focus({preventScroll:true})`)
  await key(browser, 'ArrowLeft')
  await browser.evaluate(`document.querySelector('#reset2048').click()`)
  await browser.evaluate('new Promise(resolve => setTimeout(resolve, 250))')
  assert.equal(await browser.evaluate('game2048.score'), 0, 'restart cancels an in-flight merge')
  // Exercise the actual result controls from a near-win position.
  await browser.evaluate(`game2048.grid=[[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; render2048()`)
  await key(browser, 'ArrowLeft')
  await browser.until('!overlay2048.hidden', '2048 tile opens victory')
  assert.equal(await browser.evaluate('game2048.grid[0][0]'), 2048)
  await click(browser, '#continue2048')
  await browser.until('overlay2048.hidden', 'continue processed')
  await browser.evaluate(`game2048.grid=[[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]]; render2048(); checkEnd2048()`)
  assert.equal(await browser.evaluate('overlay2048.hidden'), false)
  assert.equal(await browser.evaluate(`document.querySelector('#continue2048').hidden`), true)
  await click(browser, '#retry2048')
  await browser.until('game2048.grid.flat().filter(Boolean).length === 2', 'retry processed')
  // A varied board displays representative tile colors in the saved visual fixture.
  await browser.evaluate(`game2048.grid=[[2,4,8,16],[32,64,128,256],[512,1024,0,0],[0,2,4,0]]; render2048()`)
  report.cases.push(`2048 ${width}: merge, blocked move, keyboard/touch, persistent best, restart, win/continue, game over/retry`)
}

async function main() {
  const { server, url } = await serve()
  let browser
  try {
    for (const width of [1280, 390, 320]) {
      if (process.argv[3] && Number(process.argv[3]) !== width) continue
      browser = await launch({ width, height: 900, reducedMotion: width === 320 }, report)
      browser.mobile = width < 768
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.pathname.startsWith('/2048/')) Math.random = () => 0;` })
      for (const [name, route] of [['chess', '国际象棋/'], ['xiangqi', '中国象棋/'], ['2048', '2048/']]) {
        if (process.argv[2] && process.argv[2] !== name) continue
        await browser.send('Page.navigate', { url: new URL(route, url).href })
        await browser.until(`document.readyState === 'complete' && decodeURIComponent(location.pathname).includes(${JSON.stringify(route)})`, 'game page loaded')
        if (name !== '2048') await checkChess(browser, name === 'xiangqi', width)
        else await check2048(browser, width)
        const bounds = await browser.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
        assert.equal(bounds.width, width)
        assert.ok(bounds.scroll <= width, `${name} ${width}: horizontal overflow ${bounds.scroll}`)
        await browser.evaluate(`document.activeElement.blur(); document.querySelector(${JSON.stringify(name === '2048' ? '.article-shell' : '.game-wrapper')}).scrollIntoView({block:'start',behavior:'instant'})`)
        const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        fs.writeFileSync(path.join(output, `${name}-${width}.png`), Buffer.from(screenshot.data, 'base64'))
      }
      await browser.close()
      browser = null
    }
    assert.deepEqual(report.consoleErrors, [])
    report.passed = true
    console.log(report.cases.join('\n'))
  } catch (error) {
    if (browser) {
      report.failure = await browser.evaluate(`({url:location.href,width:innerWidth,scroll:document.documentElement.scrollWidth,active:document.activeElement?.id,buttons:[...document.querySelectorAll('button')].filter(e=>e.checkVisibility()).map(e=>({id:e.id,rect:e.getBoundingClientRect().toJSON()}))})`)
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(path.join(output, 'failure.png'), Buffer.from(screenshot.data, 'base64'))
    }
    throw error
  } finally {
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
