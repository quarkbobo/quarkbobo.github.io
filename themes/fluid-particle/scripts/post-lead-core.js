'use strict'

const INVISIBLE_PREFIX = /^[\uFEFF\u200B-\u200D\u2060]+/
const INVISIBLE_ALL = /[\uFEFF\u200B-\u200D\u2060]/g
const INDENT = /^(?:\t| {4})/
const STRUCTURAL_BLOCK = /^(?:#{1,6}(?:\s|$)|>|[-+*](?:\s|$)|\d+[.)](?:\s|$)|!\[|```|~~~|<)/

function withoutInvisiblePrefix (line) {
  return line.replace(INVISIBLE_PREFIX, '')
}

function bodyLines (source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  if (withoutInvisiblePrefix(lines[0] || '').trim() !== '---') return lines

  for (let index = 1; index < lines.length; index++) {
    if (lines[index].trim() === '---') return lines.slice(index + 1)
  }
  return []
}

function readableInlineText (source) {
  return source
    .replace(INVISIBLE_ALL, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractPostLead (source) {
  if (typeof source !== 'string' || source.length === 0) return ''

  const lines = bodyLines(source)
  let firstIndex = 0
  while (firstIndex < lines.length && withoutInvisiblePrefix(lines[firstIndex]).trim() === '') firstIndex++
  if (firstIndex >= lines.length) return ''

  const firstLine = withoutInvisiblePrefix(lines[firstIndex])
  if (!INDENT.test(firstLine)) return ''

  const firstContent = firstLine.replace(INDENT, '').trim()
  if (!firstContent || STRUCTURAL_BLOCK.test(firstContent)) return ''

  const paragraph = [firstContent]
  for (let index = firstIndex + 1; index < lines.length; index++) {
    const line = withoutInvisiblePrefix(lines[index])
    if (line.trim() === '') break
    paragraph.push(line.replace(INDENT, '').trim())
  }

  return readableInlineText(paragraph.join(' '))
}

module.exports = Object.freeze({ extractPostLead })
