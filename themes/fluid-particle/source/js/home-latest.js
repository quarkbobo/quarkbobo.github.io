(function (root, factory) {
  const api = factory(root, root.document, root.FluidHomeLatestCore)
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidHomeLatest = api
})(typeof window !== 'undefined' ? window : globalThis, function (window, document, core) {
  'use strict'

  const stateRank = Object.freeze({ new: 0, ordinary: 1, future: 2, invalid: 3 })

  function mount (grid, nowMs) {
    const cards = Array.from(grid.querySelectorAll('[data-latest-card]'))
    const evaluatedAt = Number.isFinite(nowMs) ? nowMs : Date.now()
    const entries = cards.map((card, index) => {
      const state = core.publicationState(card.dataset.publishedAt, evaluatedAt)
      card.classList.toggle('is-new', state === 'new')
      return { card, index, state }
    })

    entries.sort((left, right) => stateRank[left.state] - stateRank[right.state] || left.index - right.index)
    for (const entry of entries) grid.appendChild(entry.card)

    return Object.freeze({
      cardCount: entries.length,
      newCount: entries.filter(entry => entry.state === 'new').length
    })
  }

  const api = Object.freeze({ mount })
  if (document && core) {
    const grid = document.querySelector('[data-latest-grid]')
    if (grid) mount(grid)
  }
  return api
})
