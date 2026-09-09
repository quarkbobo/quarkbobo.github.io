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
test('game index layout preserves the four original destinations',()=>{
 const $=read('游戏相关/game-concat/index.html');assert.equal($('body').attr('data-page-kind'),'games');
 assert.deepEqual($('.article-body a').toArray().map(e=>[$(e).text(),$(e).attr('href')]),[['贪吃蛇CTF','https://quarkbobo.github.io/snake'],['2048','https://quarkbobo.github.io/2048'],['中国象棋','https://quarkbobo.github.io/中国象棋'],['国际象棋','https://quarkbobo.github.io/国际象棋']]);
});
