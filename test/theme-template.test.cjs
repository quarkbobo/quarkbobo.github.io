const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ejs = require('ejs')
const { DomUtils, parseDocument } = require('htmlparser2')
const parse5 = require('parse5')

const themeRoot = path.resolve(__dirname, '..', 'themes', 'fluid-particle')
const hexoToc = require(path.resolve(__dirname, '..', 'node_modules', 'hexo', 'dist', 'plugins', 'helper', 'toc.js'))
const template = relative => fs.readFileSync(path.join(themeRoot, 'layout', relative), 'utf8')
const stripHtml = html => String(html).replace(/<[^>]+>/g, '')

function renderPostFull (content, tocHelper = () => '', theme = {}) {
  return ejs.render(template(path.join('_partial', 'post-full.ejs')), {
    config: { language: 'zh-CN', title: 'Fixture site' },
    theme,
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

const renderedImages = output => DomUtils.findAll(
  element => element.name === 'img',
  parseDocument(output).children
)

const decodeHtmlAttribute = value => String(value)
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')

const parsedElements = root => {
  const elements = []
  const visit = node => {
    if (node.tagName) elements.push(node)
    for (const child of node.childNodes || []) visit(child)
  }
  visit(root)
  return elements
}

const parsedAttribute = (element, name) => element.attrs
  ?.find(attribute => attribute.name === name)?.value
const parsedHasClass = (element, className) => String(parsedAttribute(element, 'class') || '')
  .split(/\s+/)
  .includes(className)
const parsedText = element => {
  let value = ''
  const visit = node => {
    if (node.nodeName === '#text') value += node.value
    for (const child of node.childNodes || []) visit(child)
  }
  visit(element)
  return value
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

test('article images receive cached intrinsic dimensions only from their true source', () => {
  // Matching data-src, guessing unknown images, or replacing authored values would corrupt the rendered image contract.
  const cachedSource = 'https://example.test/cached.png?alpha=1&beta=2'
  const output = renderPostFull([
    `<img data-case="cached" data-src="https://example.test/placeholder.png" src="https://example.test/cached.png?alpha=1&amp;beta=2">`,
    `<img data-case="authored" src="${cachedSource}" width="901" height="701" loading="eager" decoding="sync">`,
    `<img data-case="partial" src="${cachedSource}" width="333">`,
    `<img data-case="data-only" data-src="${cachedSource}">`,
    `<img data-case="unknown" data-src="${cachedSource}" src="https://example.test/unknown.png">`,
    `<img data-case="quoted-noise-hit" alt='preview src="https://example.test/unknown.png" width="9" height="9"' src="https://example.test/cached.png?alpha=1&amp;beta=2">`,
    `<img data-case="quoted-noise-miss" alt='preview src="${cachedSource}"' src="https://example.test/unknown.png">`,
    `<img data-case="quoted-greater-than" alt="2 > 1" src="${cachedSource}">`
  ].join('\n'), () => '', {
    image_dimensions: {
      [cachedSource]: { width: 640, height: 480 }
    }
  })
  const images = new Map(renderedImages(output).map(image => [image.attribs['data-case'], image.attribs]))
  const imageTags = new Map(
    [...output.matchAll(/<img\b[^>]*\bdata-case="([^"]+)"[^>]*>/gi)].map(match => [match[1], match[0]])
  )
  const attributeCount = (imageCase, attribute) => [
    ...imageTags.get(imageCase).matchAll(new RegExp(`(?:^|\\s)${attribute}\\s*=`, 'gi'))
  ].length

  assert.deepEqual(
    { width: images.get('cached').width, height: images.get('cached').height },
    { width: '640', height: '480' }
  )
  assert.deepEqual(
    {
      width: images.get('authored').width,
      height: images.get('authored').height,
      loading: images.get('authored').loading,
      decoding: images.get('authored').decoding
    },
    { width: '901', height: '701', loading: 'eager', decoding: 'sync' }
  )
  assert.deepEqual(
    { width: images.get('partial').width, height: images.get('partial').height },
    { width: '333', height: undefined }
  )
  for (const imageCase of ['data-only', 'unknown']) {
    assert.equal(images.get(imageCase).width, undefined, `${imageCase} width`)
    assert.equal(images.get(imageCase).height, undefined, `${imageCase} height`)
  }
  assert.deepEqual(
    { width: images.get('quoted-noise-hit').width, height: images.get('quoted-noise-hit').height },
    { width: '640', height: '480' }
  )
  assert.equal(images.get('quoted-noise-miss').width, undefined, 'quoted-noise-miss width')
  assert.equal(images.get('quoted-noise-miss').height, undefined, 'quoted-noise-miss height')
  assert.deepEqual(
    {
      alt: images.get('quoted-greater-than').alt,
      width: images.get('quoted-greater-than').width,
      height: images.get('quoted-greater-than').height
    },
    { alt: '2 > 1', width: '640', height: '480' }
  )
  assert.deepEqual(
    Object.fromEntries(['cached', 'authored', 'partial', 'data-only', 'unknown'].map(imageCase => [
      imageCase,
      {
        width: attributeCount(imageCase, 'width'),
        height: attributeCount(imageCase, 'height')
      }
    ])),
    {
      cached: { width: 1, height: 1 },
      authored: { width: 1, height: 1 },
      partial: { width: 1, height: 0 },
      'data-only': { width: 0, height: 0 },
      unknown: { width: 0, height: 0 }
    }
  )
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

test('article outline keeps inline code text without exposing headings from raw blocks', () => {
  // Treating inline code like a block-level raw container leaks its protection token into the real Hexo outline.
  const protectedFragments = [
    '<script>const literal = "<h2>Script fake heading</h2>";</script>',
    '<pre><h2>Pre fake heading</h2></pre>'
  ]
  const inlineCode = '<code data-command="test">npm test</code>'
  const output = renderPostFull(
    [...protectedFragments, `<h2>Use ${inlineCode}</h2>`].join('\n'),
    hexoToc
  )
  const outline = output.match(/<details\b[^>]*class="article-toc-disclosure"[^>]*>([\s\S]*?)<\/details>/i)?.[1]

  assert.ok(outline, 'the real Hexo toc renders an outline')
  assert.match(outline, /<span class="toc-text">Use npm test<\/span>/)
  assert.doesNotMatch(outline, /FLUIDRAWTEXTTOKEN/)
  assert.doesNotMatch(outline, /(?:Script|Pre) fake heading/)
  for (const fragment of protectedFragments) assert.equal(output.includes(fragment), true, fragment)
  assert.equal(output.includes(inlineCode), true, 'the authored inline code remains byte-for-byte intact')
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

test('authored heading ids cannot inject attributes and still match every generated anchor', () => {
  // Re-serializing a single-quoted id inside double quotes lets an embedded quote create an event attribute.
  const expectedIds = [
    'safe" onmouseover="alert(1)',
    "safe' onclick='alert(2)"
  ]
  const output = renderPostFull([
    '<h2 id=\'safe" onmouseover="alert(1)\'>Single quoted<a class="header-anchor" href="#old-single">#</a></h2>',
    '<h2 id="safe\' onclick=\'alert(2)">Double quoted<a class="header-anchor" href="#old-double">#</a></h2>'
  ].join('\n'), hexoToc)
  const document = parseDocument(output)
  const headings = DomUtils.findAll(element => element.name === 'h2', document.children)
  const permalinks = DomUtils.findAll(element => element.name === 'a' &&
    String(element.attribs?.class || '').split(/\s+/).includes('header-anchor'), document.children)
  const tocLinks = DomUtils.findAll(element => element.name === 'a' &&
    String(element.attribs?.class || '').split(/\s+/).includes('toc-link'), document.children)
  const eventAttributes = [...headings, ...permalinks, ...tocLinks]
    .flatMap(element => Object.keys(element.attribs || {}).filter(attribute => /^on/i.test(attribute)))

  assert.deepEqual(headings.map(heading => heading.attribs.id), expectedIds)
  assert.deepEqual(permalinks.map(link => link.attribs.href.slice(1)), expectedIds)
  assert.deepEqual(
    [...new Set(tocLinks.map(link => decodeURIComponent(link.attribs.href.slice(1))))],
    expectedIds
  )
  assert.deepEqual(eventAttributes, [])
})

test('quoted greater-than signs in headings and permalinks stay attribute data in a real HTML parser', () => {
  // Stopping an opening tag at a quoted > promotes the rest of an id or href into live elements and event handlers.
  const expectedIds = [
    'safe><img src=x onerror=alert(1)>',
    "double><svg onload=alert(2)> 'quoted'",
    'article-section-3'
  ]
  const output = renderPostFull([
    '<h2 id=\'safe><img src=x onerror=alert(1)>\' data-note="2 > 1" data-mixed=\'say "yes" > now\'>Single quoted body<a class="header-anchor" href="#old-single">#</a></h2>',
    '<h3 id="double><svg onload=alert(2)> \'quoted\'" data-note=\'3 > 2 and "mixed"\'>Double quoted body<a class=\'header-anchor\' href="#old-double">#</a></h3>',
    '<h3 data-note="still > data">Permalink body<a class="header-anchor" data-note=\'mixed "quote" > marker\' href=\'safe><img src=x onerror=alert(7)>\'>#</a></h3>'
  ].join('\n'), hexoToc)
  const document = parse5.parse(output)
  const elements = parsedElements(document)
  const articleBody = elements.find(element => element.tagName === 'div' && parsedHasClass(element, 'article-body'))
  const bodyElements = parsedElements(articleBody).slice(1)
  const headings = bodyElements.filter(element => /^h[1-6]$/.test(element.tagName))
  const permalinks = bodyElements.filter(element => element.tagName === 'a' && parsedHasClass(element, 'header-anchor'))
  const tocLinks = elements.filter(element => element.tagName === 'a' && parsedHasClass(element, 'toc-link'))
  const eventAttributes = elements.flatMap(element => (element.attrs || [])
    .map(attribute => attribute.name)
    .filter(attribute => /^on/i.test(attribute)))

  assert.deepEqual(bodyElements.map(element => element.tagName), ['h2', 'a', 'h3', 'a', 'h3', 'a'])
  assert.equal(elements.some(element => element.tagName === 'img' || element.tagName === 'svg'), false)
  assert.deepEqual(eventAttributes, [])
  assert.deepEqual(headings.map(heading => parsedAttribute(heading, 'id')), expectedIds)
  assert.deepEqual(headings.map(heading => parsedText(heading)), [
    'Single quoted body#',
    'Double quoted body#',
    'Permalink body#'
  ])
  assert.deepEqual(headings.map(heading => parsedAttribute(heading, 'data-note')), [
    '2 > 1',
    '3 > 2 and "mixed"',
    'still > data'
  ])
  assert.deepEqual(permalinks.map(link => parsedAttribute(link, 'href')), expectedIds.map(id => `#${id}`))
  assert.deepEqual(permalinks.map(link => parsedAttribute(link, 'data-note')), [undefined, undefined, 'mixed "quote" > marker'])
  assert.deepEqual(
    [...new Set(tocLinks.map(link => decodeURIComponent(parsedAttribute(link, 'href').slice(1))))],
    expectedIds
  )
})

test('direct heading wrapper ids cross quoted data and malformed openings remain untouched', () => {
  // Treating the first > as the wrapper boundary loses legal attributes or steals an id from malformed markup.
  const malformedHeading = '<h2 id=\'unterminated>Unclosed heading</h2>'
  const malformedWrapper = '<span id=\'unterminated title="a>b">Unclosed wrapper</span>'
  const output = renderPostFull([
    '<h2 data-case="valid"><span title="a>b" data-note=\'say "yes" > now\' id="wrapper>target">Wrapped body</span><a class="header-anchor" href="#old">#</a></h2>',
    `<h2 data-case="malformed">${malformedWrapper}</h2>`
  ].join('\n'))
  const malformedHeadingOutput = renderPostFull(malformedHeading)
  const document = parse5.parse(output)
  const elements = parsedElements(document)
  const validHeading = elements.find(element => element.tagName === 'h2' && parsedAttribute(element, 'data-case') === 'valid')
  const validWrapper = parsedElements(validHeading).find(element => element.tagName === 'span')
  const validPermalink = parsedElements(validHeading)
    .find(element => element.tagName === 'a' && parsedHasClass(element, 'header-anchor'))

  assert.equal(parsedAttribute(validHeading, 'id'), 'wrapper>target')
  assert.equal(parsedAttribute(validWrapper, 'id'), undefined)
  assert.equal(parsedAttribute(validWrapper, 'title'), 'a>b')
  assert.equal(parsedAttribute(validWrapper, 'data-note'), 'say "yes" > now')
  assert.equal(parsedAttribute(validPermalink, 'href'), '#wrapper>target')
  assert.equal(output.includes(malformedWrapper), true)
  assert.equal(malformedHeadingOutput.includes(malformedHeading), true)
})

test('normalizers ignore heading and image strings inside outer quoted attributes', () => {
  // Searching for target substrings without global tag context promotes inert title text into live attack elements.
  const inertValues = [
    "<h2 id='safe'>Heading</h2><img src=x onerror=alert(8)>",
    '<img src=x><img src=y onerror=alert(9)>'
  ]
  const inertComment = '<!-- <h2 id="comment-heading">Comment heading</h2><img src=z onerror=alert(10)> -->'
  const output = renderPostFull([
    ...inertValues.map((value, index) => (
      `<div data-case="outer-${index + 1}" title="${value}">Outer ${index + 1}</div>`
    )),
    inertComment
  ].join('\n'))
  const document = parse5.parse(output)
  const elements = parsedElements(document)
  const articleBody = elements.find(element => element.tagName === 'div' && parsedHasClass(element, 'article-body'))
  const bodyElements = parsedElements(articleBody).slice(1)
  const outerElements = bodyElements.filter(element => /^outer-/.test(parsedAttribute(element, 'data-case') || ''))
  const eventAttributes = bodyElements.flatMap(element => (element.attrs || [])
    .map(attribute => attribute.name)
    .filter(attribute => /^on/i.test(attribute)))

  assert.deepEqual(bodyElements.map(element => element.tagName), ['div', 'div'])
  assert.deepEqual(outerElements.map(element => parsedAttribute(element, 'title')), inertValues)
  assert.deepEqual(outerElements.map(element => parsedText(element)), ['Outer 1', 'Outer 2'])
  assert.deepEqual(eventAttributes, [])
  assert.equal(output.includes(inertComment), true)
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
    post_lead: () => 'Summary',
    strip_html: stripHtml,
    url_for: value => `/${value}`
  })

  assert.match(output, /class="post-card__categories"[^>]*aria-label="分类"/)
  assert.match(output, /href="\/categories\/技术教程\/"[^>]*>技术教程<\/a>/)
  assert.match(output, /href="\/categories\/随笔\/"[^>]*>随笔<\/a>/)
})

test('post cards render the complete marked lead and leave visual truncation to CSS', () => {
  const lead = '这是一段有意写得很长的首页引导文字，用来确认模板不会再按照固定字符数量截断，而是完整输出并交给卡片宽度和可见行数处理。'.repeat(3)
  const output = ejs.render(template(path.join('_partial', 'post-card.ejs')), {
    post: {
      title: 'Long lead post',
      path: 'long-lead/index.html',
      date: new Date('2026-09-03T00:00:00Z'),
      raw: `\t${lead}`,
      content: '<p>不应作为摘要的完整文章</p>',
      categories: []
    },
    dateFormatter: { format: () => '2026年9月3日' },
    date_xml: value => value.toISOString(),
    post_lead: () => lead,
    strip_html: stripHtml,
    url_for: value => `/${value}`
  })
  const css = fs.readFileSync(path.join(themeRoot, 'source', 'css', 'main.css'), 'utf8')

  assert.match(output, new RegExp(`<p class="post-card__summary">${lead}</p>`))
  assert.doesNotMatch(output, /\.\.\.|…/)
  assert.match(css, /\.post-card__summary\s*\{[^}]*display:\s*-webkit-box;/s)
  assert.match(css, /\.post-card__summary\s*\{[^}]*-webkit-line-clamp:\s*\d+;/s)
  assert.match(css, /\.post-card__summary\s*\{[^}]*overflow:\s*hidden;/s)
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

test('home excludes the catalogue post while passing every other folder post to cards', () => {
  const renderedPaths = []
  const posts = [
    { title: '博客目录', path: 'index.html', source: '_posts/博客目录.md' },
    { title: '一级文章', path: '新文件夹/one/index.html', source: '_posts/新文件夹/one.md' },
    { title: '深层文章', path: '另一个文件夹/深层/two/index.html', source: '_posts/另一个文件夹/深层/two.md' }
  ]

  ejs.render(template(path.join('_partial', 'home.ejs')), {
    posts,
    catalogue: { content: '' },
    config: { language: 'zh-CN', title: 'Fixture site' },
    theme: { hero: { eyebrow: '', title: '蓝色空间号', description: '技术笔记、游戏合集、日常Vlog' } },
    partial: (name, locals) => {
      if (name === '_partial/post-card') renderedPaths.push(locals.post.path)
      return ''
    },
    url_for: value => value
  })

  assert.deepEqual(renderedPaths, [
    '新文件夹/one/index.html',
    '另一个文件夹/深层/two/index.html'
  ])
})

test('post cards expose publication data and an initially hidden NEW ribbon', () => {
  const output = ejs.render(template(path.join('_partial', 'post-card.ejs')), {
    post: {
      title: 'New post',
      path: 'new/index.html',
      date: new Date('2026-09-03T00:00:00Z'),
      raw: '\t引导文字',
      categories: []
    },
    dateFormatter: { format: () => '2026年9月3日' },
    date_xml: value => value.toISOString(),
    post_lead: () => '引导文字',
    url_for: value => `/${value}`
  })

  assert.match(output, /<article class="post-card"[^>]*data-latest-card[^>]*data-published-at="2026-09-03T00:00:00.000Z"/)
  assert.match(output, /class="post-card__ribbon"[^>]*aria-hidden="true"[^>]*>NEW<\/span>/)
})

test('approved home copy, navigation, footer, title layout, and ribbon styling are declared', () => {
  const config = fs.readFileSync(path.join(themeRoot, '_config.yml'), 'utf8')
  const footer = template(path.join('_partial', 'footer.ejs'))
  const css = fs.readFileSync(path.join(themeRoot, 'source', 'css', 'main.css'), 'utf8')

  assert.match(config, /title:\s*蓝色空间号/)
  assert.match(config, /description:\s*技术笔记、游戏合集、日常Vlog/)
  assert.doesNotMatch(config, /^\s+(?:分类|标签):/m)
  assert.match(footer, /不要回答！不要回答！不要回答！/)
  assert.match(css, /\.home-hero h1\s*\{[^}]*white-space:\s*nowrap;/s)
  assert.match(css, /\.post-card__ribbon\s*\{[^}]*linear-gradient\([^)]*#[0-9a-f]{6}/is)
  assert.match(css, /\.post-card__ribbon\s*\{[^}]*rotate\(45deg\)/s)
  assert.match(css, /\.post-card\.is-new\s+\.post-card__ribbon\s*\{[^}]*display:\s*flex;/s)
})
