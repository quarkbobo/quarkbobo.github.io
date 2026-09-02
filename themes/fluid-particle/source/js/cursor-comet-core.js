(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidCursorCometCore = api
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict'

  const MIN_DISTANCE = 4
  const MAX_LENGTH = 72
  const MIN_WIDTH = 1
  const MAX_WIDTH = 2.5
  const MAX_SPEED = 8

  function finitePoint (point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.time)
  }

  function writeSegment (previous, current, output) {
    if (!finitePoint(previous) || !finitePoint(current) || !output) return false
    const dx = current.x - previous.x
    const dy = current.y - previous.y
    const distance = Math.hypot(dx, dy)
    if (distance < MIN_DISTANCE) return false
    const length = Math.min(distance, MAX_LENGTH)
    const angle = Math.atan2(dy, dx)
    const elapsed = Math.max(1, current.time - previous.time)
    const speed = Math.min(MAX_SPEED, distance / elapsed)
    output.x = current.x - Math.cos(angle) * length
    output.y = current.y - Math.sin(angle) * length
    output.length = length
    output.angle = angle
    output.width = MIN_WIDTH + speed / MAX_SPEED * (MAX_WIDTH - MIN_WIDTH)
    return true
  }

  function nextPoolIndex (index, size) {
    return Number.isInteger(size) && size > 0 ? (index + 1) % size : 0
  }

  return Object.freeze({
    MIN_DISTANCE,
    MAX_LENGTH,
    MIN_WIDTH,
    MAX_WIDTH,
    MAX_SPEED,
    writeSegment,
    nextPoolIndex
  })
})
