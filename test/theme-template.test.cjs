const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ejs = require('ejs')

const themeRoot = path.resolve(__dirname, '..', 'themes', 'fluid-particle')
const template = relative => fs.readFileSync(path.join(themeRoot, 'layout', relative), 'utf8')
const stripHtml = html => String(html).replace(/<[^>]+>/g, '')

function renderPostFull (content) {
  return ejs.render(template(path.join('_partial', 'post-full.ejs')), {
    config: { language: 'zh-CN', title: 'Fixture site' },
    post: {
      path: 'fixture/index.html',
      title: 'Fixture article',
      content
    },
    strip_html: stripHtml,
    toc: () => '',
    date_xml: value => String(value)
  })
}

test('article heading and image normalization leaves raw-text containers byte-for-byte intact', () => {
  // Removing the raw-text boundary would rewrite HTML-looking strings in executable or preformatted content.
  const protectedFragments = [
    '<script>const sample = "<h3>Script heading</h3><img src=\\"script.png\\">";</script>',
    '<style>.sample::before { content: "<h3>Style heading</h3><img src=style.png>"; }</style>',
    '<textarea><h3>Textarea heading</h3><img src="textarea.png"></textarea>',
    '<pre><h3>Pre heading</h3><img src="pre.png"></pre>',
    '<code><h3>Code heading</h3><img src="code.png"></code>'
  ]
  const authoredHeading = '<h3 data-real="true">Real heading<a class="header-anchor" href="#old">#</a></h3>'
  const authoredImage = '<img data-real="true" src="real.png">'
  const output = renderPostFull([...protectedFragments, authoredHeading, authoredImage].join('\n'))

  for (const fragment of protectedFragments) {
    assert.equal(output.includes(fragment), true, fragment.slice(0, fragment.indexOf('>') + 1))
  }
  assert.match(output, /<h2\b[^>]*data-real="true"[^>]*id="article-section-1"[^>]*>/i)
  assert.match(output, /<img\b[^>]*data-real="true"[^>]*loading="lazy"[^>]*decoding="async"[^>]*>/i)
})

test('glyph-only heading permalinks expose the heading name to assistive technology', () => {
  // A bare # link is not understandable when announced outside its visual heading context.
  const output = renderPostFull('<h2>Named section<a class="header-anchor" href="#old">#</a></h2>')
  const permalink = output.match(/<a\b([^>]*)class="[^"]*\bheader-anchor\b[^"]*"([^>]*)>#<\/a>/i)

  assert.ok(permalink, 'the authored permalink remains present')
  assert.match(`${permalink[1]} ${permalink[2]}`, /aria-label="章节链接：Named section"/)
})

test('post cards render real category links when the post has categories', () => {
  // Dropping category data would make categorized posts indistinguishable on the homepage.
  const output = ejs.render(template(path.join('_partial', 'post-card.ejs')), {
    post: {
      title: 'Categorized post',
      path: 'categorized/index.html',
      date: new Date('2026-08-30T00:00:00Z'),
      excerpt: 'Summary',
      categories: {
        toArray: () => [
          { name: '技术教程', path: 'categories/技术教程/' },
          { name: '随笔', path: 'categories/随笔/' }
        ]
      }
    },
    dateFormatter: { format: () => '2026年8月30日' },
    date_xml: value => value.toISOString(),
    strip_html: stripHtml,
    url_for: value => `/${value}`
  })

  assert.match(output, /class="post-card__categories"[^>]*aria-label="分类"/)
  assert.match(output, /href="\/categories\/技术教程\/"[^>]*>技术教程<\/a>/)
  assert.match(output, /href="\/categories\/随笔\/"[^>]*>随笔<\/a>/)
})

test('the homepage empty state includes a usable return-home link', () => {
  // Plain empty-state text offers no recovery action when the collection is empty.
  const output = ejs.render(template(path.join('_partial', 'home.ejs')), {
    posts: [],
    catalogue: { content: '' },
    config: { language: 'zh-CN', title: 'Fixture site' },
    theme: {
      hero: {
        eyebrow: 'Fixture eyebrow',
        title: 'Fixture title',
        description: 'Fixture description'
      }
    },
    partial: () => '',
    url_for: value => value
  })
  const emptyState = output.match(/<p\b[^>]*class="empty-state"[^>]*>([\s\S]*?)<\/p>/i)?.[1]

  assert.ok(emptyState, 'the empty state is rendered')
  assert.match(emptyState, /档案中还没有记录/)
  assert.match(emptyState, /<a\b[^>]*href="\/"[^>]*>返回首页<\/a>/)
})
