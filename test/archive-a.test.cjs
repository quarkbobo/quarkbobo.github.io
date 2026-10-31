const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cheerio=require('cheerio');
const read=p=>cheerio.load(fs.readFileSync(path.join(__dirname,'../public',p),'utf8'));
test('selected A shows two recent entries and keeps every authored catalogue destination',()=>{
 const $=read('index.html');assert.equal($('[data-latest-card]').length,2);
 assert.equal($('.catalogue-topic').length,3);
 const links=$('.catalogue-topic ul a').toArray().map(a=>$(a).attr('href'));
 assert.equal(links.length,6);for(const slug of['Hello-World','My-First-Blog','zzyc-questions-Sep-free','zzyc_V4_for_U','Image-Transformer','game-concat'])assert.ok(links.some(h=>h.includes(slug)),slug);
 assert.equal($('.site-nav [aria-current="page"]').text().trim(),'首页');
 assert.equal($('#planet-webgl').length,1);assert.equal($('#planet-enter')[0].name,'button');
});
test('archive A groups all original entries into real years',()=>{
 const $=read('archives/index.html');assert.equal($('.archive-list li a').length,7);
 assert.deepEqual($('.archive-year h2').toArray().map(e=>$(e).text()),['2026','2025']);
 assert.equal($('.site-nav [aria-current="page"]').text().trim(),'归档');
});
test('game index keeps local destinations and includes all original Milky Frog games safely',()=>{
 const $=read('游戏相关/game-concat/index.html');assert.equal($('body').attr('data-page-kind'),'games');
 const expectedPairs=[
  ['贪吃蛇CTF','https://quarkbobo.github.io/snake'],
  ['2048','https://quarkbobo.github.io/2048'],
  ['中国象棋','https://quarkbobo.github.io/中国象棋'],
  ['国际象棋','https://quarkbobo.github.io/国际象棋'],
  ['俄罗斯奶块 · 作者：EIAAN','https://milkcubebycyanchan1eiann.netlify.app/'],
  ['合成大奶蛙 · 作者：十二月的狼头','https://yhsome.github.io/BigNaiWa/v1/'],
  ['合成小奶蛙 · 作者：十二月的狼头','https://yhsome.github.io/SmallNaiWa/'],
  ['旅行奶蛙','https://www.bilibili.com/toy/TravelMilkyFrog/index.html'],
  ['奶国物语 · 作者：雀石不诗人','https://e.233ly.com/bn1yRe'],
  ['奶了个蛙','https://junjunya2020.github.io/nailegewa'],
  ['奶了个蛙2 · 作者：河南农大表白墙','https://nai-le-ge-wa-wemcta8qgu2.qoder.zone/'],
  ['奶蛙2048 · 作者：十二月的狼头','https://yhsome.github.io/Nai2048/'],
  ['奶蛙2048超级版','https://game.0z.hk/game/2048/'],
  ['奶蛙爱洗澡 · 作者：kingtrain','https://milkfrog-bath.pages.dev/'],
  ['奶蛙打砖块 · 作者：nnn','https://niuniu513-ask.github.io/milky-breakout/?v=1deb2eb'],
  ['奶蛙的奶块雨 · 作者：光影集','https://naiwa-milk-rain.pages.dev/'],
  ['奶蛙的小窝','https://naiwaxiaowu.pages.dev/'],
  ['奶蛙放屁 · 作者：二奶','https://naiwa-fart.pages.dev/'],
  ['奶蛙飞机大战 · 作者：丶基控Q','https://naiwafly.dpdns.org/'],
  ['奶蛙工厂','https://66970010-boop.github.io/frog-miner'],
  ['奶蛙街舞 · 作者：念因','https://nailong-dance.pages.dev'],
  ['奶蛙快跑','https://e.233ly.com/1ABrH3'],
  ['奶蛙雷霆小队 · 作者：雀石不诗人','https://e.233ly.com/v65Ihd'],
  ['奶蛙奶茶铺','https://naiwanaichadian.pages.dev/'],
  ['奶蛙挠痒 · 作者：Elio','https://naiwa.bocchi.website/'],
  ['奶蛙神跑','https://naiwa.me'],
  ['奶蛙贪吃蛙','https://milkyfrogs.toolsbox.vip/'],
  ['奶蛙踢馆 · 作者：胆子肥嘟嘟','https://night-market-rumble-54328.app.workbuddy.host/'],
  ['奶蛙跳一跳 · 作者：光影集','https://naiba-jump.pages.dev/'],
  ['奶蛙推奶块 · 作者：EIAAN','https://sparkly-macaron-5c86c7.netlify.app/'],
  ['奶蛙五子棋','https://wudibaolongzhanshi1234.github.io/1335689.giyhub.io/'],
  ['奶蛙消消乐','https://chenckx0614.github.io/naiwaxxl/'],
  ['奶蛙颜色大挑战','https://milkyfrog.toolsbox.vip/'],
  ['奶蛙一跳 · 作者：Sn','https://naiwa-jump.pages.dev/'],
  ['奶蛙羽毛球','https://www.bilibili.com/toy/naiwa-badminton/index.html'],
  ['奶蛙jump','https://naiwai-jump.github.io/'],
  ['勇者奶蛙传 · 作者：雀石不诗人','https://e.233ly.com/yDkGpm'],
  ['召唤神龙 · 作者：鱼戏荷','https://naiwa.games/'],
  ['抓奶蛙 · 作者：龙井茉莉','https://www.bilibili.com/toy/zhua-nai-wa/index.html']
 ];
 const links=$('.article-body a').toArray();assert.equal(links.length,39);
 assert.deepEqual(links.map(a=>[$(a).text(),$(a).attr('href')]),expectedPairs);
 for(const a of links.slice(4)){
  assert.equal($(a).attr('target'),'_blank');
  assert.deepEqual(new Set($(a).attr('rel').split(/\s+/)),new Set(['noopener','noreferrer']));
 }
});
