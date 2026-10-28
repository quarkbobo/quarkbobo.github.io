'use strict';

// Read-only extraction from the existing generated site. This script writes only
// docs/layout-proposals/content.json and never reads source/files/.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cheerio = require('cheerio');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const originalOrigin = 'https://quarkbobo.github.io';
const sources = new Map();
const read = relativePath => {
  if (relativePath.startsWith('source/files/')) throw new Error('User files are excluded');
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(root + path.sep)) throw new Error('Source outside workspace');
  const bytes = fs.readFileSync(file);
  sources.set(relativePath, { path: relativePath, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  return bytes.toString('utf8');
};
const sourcePostPaths = [
  'source/_posts/关于我/zzyc_V4_for_U.md',
  'source/_posts/游戏相关/Image-Transformer.md',
  'source/_posts/游戏相关/game-concat.md',
  'source/_posts/个人博客/zzyc-questions-Sep-free.md',
  'source/_posts/个人博客/My-First-Blog.md',
  'source/_posts/个人博客/Hello-World.md',
  'source/_posts/博客目录.md',
];
const postSources = sourcePostPaths.map(source => {
  const raw = read(source);
  const frontmatter = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const metadata = frontmatter ? yaml.load(frontmatter[1]) : {};
  return { source, title: metadata.title, rawLinkCount: (raw.match(/<a\s/gi) || []).length };
});
const sourceFor = title => postSources.find(post => post.title === title)?.source || null;
const loadPage = relativePath => cheerio.load(read(relativePath));
const home = loadPage('public/index.html');
const archivePage = loadPage('public/archives/index.html');
const originalUrl = href => new URL(href, originalOrigin).href;
const link = (node, $, baseUrl = originalOrigin) => ({ title: $(node).text().trim(), href: $(node).attr('href') || '', originalUrl: new URL($(node).attr('href') || '/', baseUrl).href });

const posts = home('[data-latest-card]').toArray().map(node => {
  const card = home(node);
  const title = card.find('h3 a').text().trim();
  const href = card.find('h3 a').attr('href');
  return {
    id: decodeURIComponent(href).replace(/^\/+|\/+$/g, '').split('/').pop(),
    title,
    href,
    originalUrl: originalUrl(href),
    date: card.find('time').attr('datetime'),
    dateLabel: card.find('time').text().trim(),
    categories: card.find('.post-card__categories a').toArray().map(node => ({ name: home(node).text().trim(), href: home(node).attr('href'), originalUrl: originalUrl(home(node).attr('href')) })),
    // Use the complete text node; no line clamp or derived summary is applied.
    summary: card.find('.post-card__summary').text(),
    summaryHtml: card.find('.post-card__summary').html() || '',
    source: sourceFor(title),
    generatedSource: 'public/index.html',
  };
});
const archive = archivePage('.archive-list li').toArray().map(node => {
  const row = archivePage(node);
  const title = row.find('a').text().trim();
  return {
    ...link(row.find('a').first(), archivePage),
    date: row.find('time').attr('datetime'),
    dateLabel: row.find('time').text().trim(),
    source: sourceFor(title),
    generatedSource: 'public/archives/index.html',
  };
});
const catalogue = home('.catalogue-content h3').toArray().map(node => ({
  title: home(node).find('span').first().text().trim(),
  id: home(node).attr('id') || home(node).find('[id]').first().attr('id'),
  links: home(node).next('ul').find('a').toArray().map(node => link(node, home)),
  source: 'source/_posts/博客目录.md',
  generatedSource: 'public/index.html',
}));

function article(postId) {
  const post = posts.find(post => post.id === postId);
  if (!post) throw new Error(`No homepage article ${postId}`);
  const generatedSource = 'public/' + decodeURIComponent(post.href).replace(/^\/+/, '').replace(/\/?$/, '/') + 'index.html';
  const $ = loadPage(generatedSource);
  const body = $('.article-body');
  const title = $('.article-header h1').text().trim();
  const toc = $('.article-toc > .toc').first();
  return {
    ...post,
    title,
    date: $('.article-header time').attr('datetime'),
    dateLabel: $('.article-header time').text().trim(),
    generatedSource,
    // Cheerio serializes the existing DOM; text and attributes are not edited.
    bodyHtml: body.html() || '',
    bodyText: body.text(),
    hasToc: toc.length > 0,
    tocHtml: toc.length ? $.html(toc) : '',
    tocEntries: toc.find('a').toArray().map(node => ({ title: $(node).text(), href: $(node).attr('href'), depth: $(node).parents('ol').length })),
    headings: body.find('h1,h2,h3,h4,h5,h6').toArray().map(node => ({ tag: node.tagName, id: $(node).attr('id'), title: $(node).find('span').first().text() || $(node).clone().find('a.header-anchor').remove().end().text() })),
    links: body.find('a').toArray().map(node => ({ ...link(node, $, post.originalUrl), target: $(node).attr('target') || null, rel: $(node).attr('rel') || null })),
    images: body.find('img').toArray().map(node => ({ src: $(node).attr('src'), alt: $(node).attr('alt') || '', width: $(node).attr('width') || null, height: $(node).attr('height') || null })),
  };
}
const v4 = article('zzyc_V4_for_U');
const withToc = article('My-First-Blog');
const games = article('game-concat');
const theme = yaml.load(read('themes/fluid-particle/_config.yml'));
const config = yaml.load(read('_config.yml'));
const content = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  originalOrigin,
  site: {
    title: config.title,
    brand: home('.site-brand').text().trim(),
    hero: { ...theme.hero },
    navigation: home('.site-nav a').toArray().map(node => link(node, home)),
    footerText: home('.site-footer').text().trim(),
  },
  posts,
  catalogue,
  archive,
  games,
  articles: { v4, withToc },
  corrections: [
    { subject: 'Game entry count', proposedCount: 5, measuredCount: games.links.length, evidence: ['source/_posts/游戏相关/game-concat.md', games.generatedSource], explanation: 'The source and generated article both contain four anchors. 贪吃蛇CTF is one link label, not two entries. Keep four real destinations.' },
  ],
  urlNotes: [
    'href is the exact generated HTML attribute. originalUrl resolves it against the verified deployed GitHub Pages origin, not the configured custom domain.',
    'Homepage article links can map to local article prototypes only when that prototype exists. Retain originalUrl as a separate original-site destination.',
    'Catalogue href attributes are relative to the original homepage. Resolve these using originalUrl or map by destination; do not resolve them relative to docs/layout-proposals/.',
    'Category links use real category paths and must remain reachable through originalUrl if no category prototype is provided.',
    'The current six homepage cards have no category chips: categories arrays are empty. The three genuine catalogue groups come from the authored homepage catalogue, not Hexo category metadata.',
    'Only the V4 card currently has an excerpt. Empty summary strings are the actual generated site output; do not invent text for the other five cards.',
    'The selected V4 and My First Blog body HTML contains no images. Their complete bodies can be copied without external image requests.',
    'Article heading permalink hrefs and toc hrefs refer to existing fragment IDs. Preserve these IDs; native details can wrap tocHtml on mobile.',
    'All four game href attributes are absolute original destinations. Preserve their names and href values exactly.',
    'No source/files content is read or included. The existing August question post appears only as its already-public homepage card metadata and full original card summary.',
  ],
  sources: Array.from(sources.values()),
};
if (posts.length !== 6) throw new Error(`Expected six homepage articles, got ${posts.length}`);
if (archive.length !== 7) throw new Error(`Expected seven archive entries, got ${archive.length}`);
if (v4.hasToc || !withToc.hasToc) throw new Error('Selected article outline assumptions changed');
if (posts.some(post => !post.source || !post.href || !post.title)) throw new Error('Article provenance incomplete');
if (archive.some(post => !post.source)) throw new Error('Archive provenance incomplete');
fs.writeFileSync(path.join(__dirname, 'content.json'), JSON.stringify(content, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ output: 'docs/layout-proposals/content.json', homePosts: posts.length, archiveEntries: archive.length, catalogueGroups: catalogue.length, games: games.links.length, v4: { bodyCharacters: v4.bodyText.length, hasToc: v4.hasToc }, withToc: { title: withToc.title, bodyCharacters: withToc.bodyText.length, headings: withToc.headings.length, tocEntries: withToc.tocEntries.length }, sources: sources.size }, null, 2));
