(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidHomeLatestCore = api
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict'

  const NEW_WINDOW_MS = 72 * 60 * 60 * 1000

  function publicationTime (publishedAt) {
    if (publishedAt instanceof Date) return publishedAt.getTime()
    if (typeof publishedAt === 'number') return publishedAt
    if (typeof publishedAt === 'string' && publishedAt.trim()) return Date.parse(publishedAt)
    return Number.NaN
  }

  function publicationState (publishedAt, nowMs) {
    const publishedMs = publicationTime(publishedAt)
    if (!Number.isFinite(publishedMs) || !Number.isFinite(nowMs)) return 'invalid'
    const age = nowMs - publishedMs
    if (age < 0) return 'future'
    if (age <= NEW_WINDOW_MS) return 'new'
    return 'ordinary'
  }

  return Object.freeze({ NEW_WINDOW_MS, publicationState })
})
