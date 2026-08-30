const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ejs = require('ejs')

const themeRoot = path.resolve(__dirname, '..', 'themes', 'fluid-particle')
const template = relative => fs.readFileSync(path.join(themeRoot, 'layout', relative), 'utf8')
const stripHtml = html => String(html).replace(/<[^>]+>/g, '')

function renderPostFull (content, tocHelper = () => '') {
  return ejs.render(template(path.join('_partial', 'post-full.ejs')), {
    config: { language: 'zh-CN', title: 'Fixture site' },
    post: {
      path: 'fixture/index.html',
      title: 'Fixture article',
      content
    },
    strip_html: stripHtml,
    toc: tocHelper,
    date_xml: value => String(value)
  })
}

const decodeHtmlAttribute = value => String(value)
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')

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

test('raw-text protection remains active while the article outline is derived', () => {
  // Restoring raw containers before toc() lets literal heading examples become fake navigation entries.
  const protectedFragments = [
    '<script>const literal = "<h2>Script fake heading</h2>";</script>',
    '<style>.sample::before { content: "<h2>Style fake heading</h2>"; }</style>',
    '<textarea><h2>Textarea fake heading</h2></textarea>',
    '<pre><h2>Pre fake heading</h2></pre>',
    '<code><h2>Code fake heading</h2></code>'
  ]
  const equivalentToc = html => {
    const labels = [...String(html).matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
      .map(match => stripHtml(match[1]).trim())
    return `<ol class="toc">${labels.map(label => `<li>${label}</li>`).join('')}</ol>`
  }
  const output = renderPostFull(
    [...protectedFragments, '<h2>Real outline heading</h2>'].join('\n'),
    equivalentToc
  )
  const outline = output.match(/<details\b[^>]*class="article-toc-disclosure"[^>]*>([\s\S]*?)<\/details>/i)?.[1]

  assert.ok(outline, 'the equivalent toc renders an outline')
  assert.match(outline, /Real outline heading/)
  assert.doesNotMatch(outline, /(?:Script|Style|Textarea|Pre|Code) fake heading/)
  for (const fragment of protectedFragments) assert.equal(output.includes(fragment), true, fragment)
})

test('glyph permalinks decode heading entities once and expose distinct browser-readable names', () => {
  // Escaping already-encoded heading HTML turns &amp; into a literal "&amp;" instead of the visible ampersand.
  const output = renderPostFull([
    '<h2>API / R&amp;D<a class="header-anchor" href="#old-api">#</a></h2>',
    '<h2>Ops &#x2F; QA &amp; &quot;Ship&quot;<a class="header-anchor" href="#old-ops">#</a></h2>'
  ].join(''))
  const htmlValues = [...output.matchAll(/<a\b([^>]*)class="[^"]*\bheader-anchor\b[^"]*"([^>]*)>#<\/a>/gi)]
    .map(permalink => `${permalink[1]} ${permalink[2]}`.match(/\baria-label="([^"]+)"/i)?.[1])

  assert.deepEqual(htmlValues, [
    '章节链接：API / R&amp;D',
    '章节链接：Ops / QA &amp; &quot;Ship&quot;'
  ])
  assert.deepEqual(htmlValues.map(decodeHtmlAttribute), [
    '章节链接：API / R&D',
    '章节链接：Ops / QA & "Ship"'
  ])
  assert.notEqual(htmlValues[0], htmlValues[1], 'different headings keep different accessible context')
  assert.doesNotMatch(output, /&amp;amp;/)
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
