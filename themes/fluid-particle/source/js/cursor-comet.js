(function (root, factory) {
  const api = factory(root, root.document, root.FluidCursorCometCore)
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidCursorComet = api
})(typeof window !== 'undefined' ? window : globalThis, function (window, document, core) {
  'use strict'

  let singleton = null

  function mount (overlay, options) {
    if (singleton) return singleton

    const scene = options && options.scene
    const segments = Array.from(overlay.querySelectorAll('.cursor-comet__segment'))
    const mobileQuery = window.matchMedia('(max-width: 760px)')
    const coarseQuery = window.matchMedia('(pointer: coarse)')
    const fineQuery = window.matchMedia('(pointer: fine)')
    const hoverQuery = window.matchMedia('(hover: hover)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mediaQueries = [mobileQuery, coarseQuery, fineQuery, hoverQuery, motionQuery]
    const previous = { x: 0, y: 0, time: 0 }
    const pending = { x: 0, y: 0, time: 0 }
    const output = { x: 0, y: 0, length: 0, angle: 0, width: 0 }
    const animationHandlers = []
    let seeded = false
    let pendingReady = false
    let poolIndex = 0
    let rafId = 0
    let enabled = false
    let listenerAttached = false
    let destroyed = false

    function activeSegmentCount () {
      let count = 0
      for (const segment of segments) {
        if (segment.dataset.active === 'true') count++
      }
      return count
    }

    function snapshot () {
      return Object.freeze({
        enabled,
        listenerAttached,
        activeSegments: activeSegmentCount(),
        poolIndex
      })
    }

    function clear () {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
        rafId = 0
      }
      seeded = false
      pendingReady = false
      previous.x = 0
      previous.y = 0
      previous.time = 0
      pending.x = 0
      pending.y = 0
      pending.time = 0
      for (const segment of segments) segment.dataset.active = 'false'
    }

    function drawPending () {
      rafId = 0
      if (!enabled || !pendingReady) return
      pendingReady = false
      if (core.writeSegment(previous, pending, output)) {
        const segment = segments[poolIndex]
        segment.style.setProperty('--comet-x', `${output.x}px`)
        segment.style.setProperty('--comet-y', `${output.y}px`)
        segment.style.setProperty('--comet-length', `${output.length}px`)
        segment.style.setProperty('--comet-angle', `${output.angle}rad`)
        segment.style.setProperty('--comet-width', `${output.width}px`)
        segment.dataset.phase = segment.dataset.phase === '0' ? '1' : '0'
        segment.dataset.active = 'true'
        poolIndex = core.nextPoolIndex(poolIndex, segments.length)
        previous.x = pending.x
        previous.y = pending.y
        previous.time = pending.time
      }
    }

    function handlePointerMove (event) {
      if (event.pointerType !== 'mouse') return
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || !Number.isFinite(event.timeStamp)) return
      if (!seeded) {
        previous.x = event.clientX
        previous.y = event.clientY
        previous.time = event.timeStamp
        seeded = true
        return
      }
      pending.x = event.clientX
      pending.y = event.clientY
      pending.time = event.timeStamp
      pendingReady = true
      if (!rafId) rafId = window.requestAnimationFrame(drawPending)
    }

    function attachPointerListener () {
      if (listenerAttached) return
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      listenerAttached = true
    }

    function detachPointerListener () {
      if (!listenerAttached) return
      window.removeEventListener('pointermove', handlePointerMove)
      listenerAttached = false
    }

    function syncPolicy () {
      if (destroyed) return
      const nextEnabled = !mobileQuery.matches && fineQuery.matches && !coarseQuery.matches && hoverQuery.matches &&
        !motionQuery.matches && !document.hidden &&
        !scene.classList.contains('motion-paused') &&
        !scene.classList.contains('particle-fallback')
      if (nextEnabled) {
        enabled = true
        attachPointerListener()
      } else {
        enabled = false
        detachPointerListener()
        clear()
      }
    }

    function handlePointerOut (event) {
      if (event.pointerType !== 'mouse') return
      if (event.relatedTarget === null) clear()
    }

    function handleBlur () {
      clear()
    }

    function destroy () {
      if (destroyed) return
      destroyed = true
      enabled = false
      detachPointerListener()
      clear()
      poolIndex = 0
      for (const query of mediaQueries) query.removeEventListener('change', syncPolicy)
      document.removeEventListener('visibilitychange', syncPolicy)
      window.removeEventListener('pointerout', handlePointerOut)
      window.removeEventListener('blur', handleBlur)
      observer.disconnect()
      for (let index = 0; index < segments.length; index++) {
        segments[index].removeEventListener('animationend', animationHandlers[index])
      }
    }

    for (const segment of segments) {
      const handler = () => { segment.dataset.active = 'false' }
      animationHandlers.push(handler)
      segment.addEventListener('animationend', handler)
    }
    for (const query of mediaQueries) query.addEventListener('change', syncPolicy)
    document.addEventListener('visibilitychange', syncPolicy)
    window.addEventListener('pointerout', handlePointerOut)
    window.addEventListener('blur', handleBlur)
    const observer = new MutationObserver(syncPolicy)
    observer.observe(scene, { attributes: true, attributeFilter: ['class'] })

    singleton = Object.freeze({ clear, destroy, snapshot })
    syncPolicy()
    return singleton
  }

  const api = Object.freeze({ mount })
  if (document && core) {
    const overlay = document.getElementById('cursor-comet')
    const scene = document.getElementById('space-scene')
    if (overlay && scene) mount(overlay, { scene })
  }
  return api
})
