(function (root, factory) {
  const api = factory(root)
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.FluidPlanetSurface = api
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict'

  let mountedLifecycle = null
  let activeSnapshot = emptySnapshot
  let activeMark = function () { return 0 }
  let activeMeasure = emptyMeasurement
  const metricsApi = Object.freeze({
    snapshot: function () { return activeSnapshot() },
    mark: function () { return activeMark() },
    measureSince: function (marker) { return activeMeasure(marker) }
  })

  function emptySnapshot () {
    return Object.freeze({
      averageDrawMs: 0,
      p95DrawMs: 0,
      maxDrawMs: 0,
      over8msPercent: 0,
      redrawFps: 0,
      qualityLevel: 2,
      canvasWidth: 0,
      canvasHeight: 0,
      effectiveDpr: 1,
      initialized: false,
      running: false,
      fallback: false,
      visible: true,
      pageVisible: true,
      basePhase: 0,
      drawCount: 0
    })
  }

  function emptyMeasurement () {
    return Object.freeze({
      complete: false,
      drawCount: 0,
      averageDrawMs: 0,
      p95DrawMs: 0,
      maxDrawMs: 0,
      over8msPercent: 0
    })
  }

  if (root && !Object.prototype.hasOwnProperty.call(root, '__planetSurfaceMetrics')) {
    Object.defineProperty(root, '__planetSurfaceMetrics', {
      configurable: false,
      enumerable: false,
      get: function () { return metricsApi }
    })
  }

  function validCore (core) {
    return core && typeof core.fillTexturePixels === 'function' &&
      typeof core.createSphereMap === 'function' &&
      typeof core.renderProjectedFrame === 'function' &&
      typeof core.applyLocalizedGasDisplacement === 'function' &&
      typeof core.computeBackingSize === 'function' &&
      typeof core.createQualityState === 'function' &&
      typeof core.advanceBasePhase === 'function' &&
      typeof core.recordDrawCost === 'function' &&
      typeof core.resetQualitySamples === 'function'
  }

  function updateActiveMetrics (lifecycle, snapshot, mark, measure) {
    if (mountedLifecycle !== lifecycle) return
    activeSnapshot = snapshot
    activeMark = mark
    activeMeasure = measure
  }

  function addClass (scene, token) {
    if (scene && scene.classList && typeof scene.classList.add === 'function') scene.classList.add(token)
  }

  function removeClass (scene, token) {
    if (scene && scene.classList && typeof scene.classList.remove === 'function') scene.classList.remove(token)
  }

  function mount (canvas, options) {
    if (mountedLifecycle) return mountedLifecycle
    const config = options || {}
    const scene = config.scene || (canvas && typeof canvas.closest === 'function' && canvas.closest('#space-scene'))
    const document = root && root.document
    const core = root && root.FluidPlanetCore
    let context
    let valid = false
    try {
      valid = Boolean(canvas && scene && document && validCore(core) && typeof root.MutationObserver === 'function' &&
        typeof canvas.getContext === 'function' && typeof root.requestAnimationFrame === 'function' &&
        typeof root.cancelAnimationFrame === 'function' && typeof root.matchMedia === 'function')
      if (valid) context = canvas.getContext('2d', { alpha: true })
      valid = Boolean(valid && context)
    } catch (error) { valid = false }
    if (!valid) return createFallback(canvas, scene)

    let motionQuery
    let mobileQuery
    let coarseQuery
    let noHoverQuery
    try {
      motionQuery = root.matchMedia('(prefers-reduced-motion: reduce)')
      mobileQuery = root.matchMedia('(max-width: 760px)')
      coarseQuery = root.matchMedia('(pointer: coarse)')
      noHoverQuery = root.matchMedia('(hover: none)')
    } catch (error) {
      return createFallback(canvas, scene)
    }
    let initialized = false
    let fallback = false
    let destroyed = false
    let manualPaused = scene.classList.contains('motion-paused')
    let particleFailed = scene.classList.contains('particle-fallback')
    let reducedMotion = Boolean(motionQuery && motionQuery.matches)
    let pageHidden = Boolean(document.hidden)
    let offscreen = false
    let idleId = 0
    let idleUsesTimeout = false
    let animationFrameId = 0
    let lastTimestamp = 0
    let hasTimestamp = false
    let elapsedSinceDraw = 0
    let lastAnimatedDrawTimestamp = 0
    let hasAnimatedDrawTimestamp = false
    let resizeDirty = false
    let activeFps = 0
    let backing = { width: 0, height: 0, effectiveDpr: 1, fps: 0 }
    let qualityState = null
    let sourceImage = null
    let sourceWidth = 0
    let projection = null
    let outputImage = null
    let basePhase = 0
    let drawSerial = 0
    let redrawCount = 0
    let redrawCursor = 0
    let transactionDue = false
    let drawHistory = null
    let measureScratch = null
    let redrawIntervals = null
    let mutationObserver = null
    let intersectionObserver = null
    let resizeObserver = null
    let resizeFallback = false
    let motionUsesLegacy = false
    let mobileUsesLegacy = false
    let coarseUsesLegacy = false
    let noHoverUsesLegacy = false
    let inputAttached = false
    let boundsDirty = false
    const cachedBounds = { left: 0, top: 0, width: 0, height: 0 }
    const interaction = { hoverX: 0, hoverY: 0, hoverEnergy: 0, impactX: 0, impactY: 0, impactEnergy: 0 }
    let hoverClientX = 0
    let hoverClientY = 0
    let impactClientX = 0
    let impactClientY = 0
    let pointerPrimary = false
    let pointerButton = -1
    let hasHoverCoordinates = false
    let pointerMovePending = false
    let impactPending = false
    let hoverInside = false
    let lifecycle

    if (canvas.style) canvas.style.display = ''
    removeClass(scene, 'planet-ready')
    removeClass(scene, 'planet-fallback')

    function canAnimate () {
      return initialized && !destroyed && !fallback && !manualPaused && !particleFailed && !reducedMotion && !pageHidden && !offscreen
    }

    function cancelAnimation () {
      if (animationFrameId) root.cancelAnimationFrame(animationFrameId)
      animationFrameId = 0
      lastTimestamp = 0
      hasTimestamp = false
      elapsedSinceDraw = 0
      hasAnimatedDrawTimestamp = false
      redrawCount = 0
      redrawCursor = 0
    }

    function removeMediaListener (query, handler, legacy) {
      if (!query) return
      if (legacy) query.removeListener(handler)
      else query.removeEventListener('change', handler)
    }

    function clearHover () {
      interaction.hoverX = 0
      interaction.hoverY = 0
      interaction.hoverEnergy = 0
      hoverClientX = 0
      hoverClientY = 0
      hasHoverCoordinates = false
      pointerMovePending = false
      hoverInside = false
    }

    function clearInteraction () {
      clearHover()
      interaction.impactX = 0
      interaction.impactY = 0
      interaction.impactEnergy = 0
      impactClientX = 0
      impactClientY = 0
      pointerPrimary = false
      pointerButton = -1
      impactPending = false
    }

    function removeInputListeners () {
      if (!inputAttached) return
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerdown', onPointerDown)
      root.removeEventListener('pointerout', onPointerOut)
      root.removeEventListener('blur', onBlur)
      root.removeEventListener('scroll', queueBoundsRefresh)
      inputAttached = false
    }

    function cleanupOwned () {
      boundsDirty = false
      cancelAnimation()
      if (idleId) {
        if (idleUsesTimeout) root.clearTimeout(idleId)
        else if (typeof root.cancelIdleCallback === 'function') root.cancelIdleCallback(idleId)
      }
      idleId = 0
      if (mutationObserver) mutationObserver.disconnect()
      if (intersectionObserver) intersectionObserver.disconnect()
      if (resizeObserver) resizeObserver.disconnect()
      mutationObserver = null
      intersectionObserver = null
      resizeObserver = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
      removeInputListeners()
      removeMediaListener(motionQuery, onMotionChange, motionUsesLegacy)
      removeMediaListener(mobileQuery, onMobileChange, mobileUsesLegacy)
      removeMediaListener(coarseQuery, onCoarseChange, coarseUsesLegacy)
      removeMediaListener(noHoverQuery, onNoHoverChange, noHoverUsesLegacy)
      if (resizeFallback) root.removeEventListener('resize', onResize)
      resizeFallback = false
    }

    function fail () {
      if (fallback || destroyed) return
      clearInteraction()
      initialized = false
      fallback = true
      cleanupOwned()
      removeClass(scene, 'planet-ready')
      addClass(scene, 'planet-fallback')
      if (canvas.style) canvas.style.display = 'none'
    }

    function syncAnimation () {
      if (!canAnimate()) {
        cancelAnimation()
        return
      }
      if (!animationFrameId) animationFrameId = root.requestAnimationFrame(renderFrame)
    }

    function recordCompletedDraw (cost, timestamp, animated) {
      drawHistory[drawSerial % 1024] = cost
      drawSerial++
      if (animated) {
        if (hasAnimatedDrawTimestamp) {
          redrawIntervals[redrawCursor] = Math.max(0, timestamp - lastAnimatedDrawTimestamp)
          redrawCursor = (redrawCursor + 1) % 120
          if (redrawCount < 120) redrawCount++
        }
        lastAnimatedDrawTimestamp = timestamp
        hasAnimatedDrawTimestamp = true
      }
      const previousLevel = qualityState.level
      core.recordDrawCost(qualityState, cost)
      if (qualityState.level !== previousLevel) queueResize()
    }

    function drawCurrentFrame (measure, timestamp, animated) {
      let started = 0
      if (measure) started = root.performance && typeof root.performance.now === 'function' ? root.performance.now() : 0
      core.renderProjectedFrame(sourceImage.data, sourceWidth, projection, basePhase, outputImage.data)
      if (interaction.hoverEnergy > 0 || interaction.impactEnergy > 0) {
        core.applyLocalizedGasDisplacement(sourceImage.data, sourceWidth, sourceImage.height, projection, basePhase, interaction, outputImage.data)
      }
      context.putImageData(outputImage, 0, 0)
      if (measure) recordCompletedDraw(Math.max(0, (root.performance && typeof root.performance.now === 'function' ? root.performance.now() : started) - started), timestamp, animated)
    }

    function rebuildProjection (timestamp, force) {
      if (destroyed || fallback || !sourceImage || !qualityState) return
      if (!force && !canAnimate()) return false
      try {
        resizeDirty = false
        const nextBacking = core.computeBackingSize({
          cssWidth: canvas.clientWidth,
          aspectRatio: 43 / 38,
          devicePixelRatio: root.devicePixelRatio,
          mobile: Boolean(mobileQuery.matches),
          level: qualityState.level
        })
        activeFps = nextBacking.fps
        transactionDue = !force && elapsedSinceDraw + 0.000001 >= 1000 / activeFps
        if (transactionDue) {
          const phaseElapsed = elapsedSinceDraw
          elapsedSinceDraw = 0
          basePhase = core.advanceBasePhase(basePhase, phaseElapsed)
        }
        if (nextBacking.width === backing.width && nextBacking.height === backing.height) {
          backing = nextBacking
          return false
        }
        removeClass(scene, 'planet-ready')
        backing = nextBacking
        canvas.width = backing.width
        canvas.height = backing.height
        const angleValue = root.getComputedStyle(canvas).getPropertyValue('--planet-equator-angle').trim()
        projection = core.createSphereMap({
          width: canvas.width,
          height: canvas.height,
          sourceWidth,
          sourceHeight: sourceImage.height,
          equatorRadians: Number.parseFloat(angleValue) * Math.PI / 180
        })
        outputImage = context.createImageData(canvas.width, canvas.height)
        drawCurrentFrame(true, timestamp || 0, transactionDue)
        if (drawSerial > 1) core.resetQualitySamples(qualityState)
        addClass(scene, 'planet-ready')
        return true
      } catch (error) { fail(); return false }
    }

    function queueResize () {
      if (destroyed || fallback) return
      resizeDirty = true
      syncAnimation()
    }

    function queueBoundsRefresh () {
      if (destroyed || fallback) return
      boundsDirty = true
      if ((!initialized || canAnimate()) && !animationFrameId) animationFrameId = root.requestAnimationFrame(renderFrame)
    }

    function onResize () {
      queueResize()
      queueBoundsRefresh()
    }

    function refreshCachedBounds () {
      boundsDirty = false
      const nextBounds = canvas.getBoundingClientRect()
      cachedBounds.left = nextBounds.left
      cachedBounds.top = nextBounds.top
      cachedBounds.width = nextBounds.width
      cachedBounds.height = nextBounds.height
      if (hasHoverCoordinates) pointerMovePending = true
    }

    function updateInteraction (elapsed) {
      if (!hoverInside && interaction.hoverEnergy > 0) interaction.hoverEnergy = Math.max(0, interaction.hoverEnergy - elapsed / 240)
      if (interaction.impactEnergy > 0) interaction.impactEnergy = Math.max(0, interaction.impactEnergy - elapsed / 720)
      if (!pointerMovePending && !impactPending) return

      let x = 0
      let y = 0
      let inside = false
      if (pointerMovePending) {
        if (cachedBounds.width > 0 && cachedBounds.height > 0) {
          x = (hoverClientX - cachedBounds.left) / cachedBounds.width * 2 - 1
          y = (hoverClientY - cachedBounds.top) / cachedBounds.height * 2 - 1
          inside = x * x + y * y <= 1
        }
        hoverInside = inside
        if (inside) {
          interaction.hoverX = x
          interaction.hoverY = y
          interaction.hoverEnergy = 1
        }
        pointerMovePending = false
      }
      if (impactPending) {
        x = 0
        y = 0
        inside = false
        if (cachedBounds.width > 0 && cachedBounds.height > 0) {
          x = (impactClientX - cachedBounds.left) / cachedBounds.width * 2 - 1
          y = (impactClientY - cachedBounds.top) / cachedBounds.height * 2 - 1
          inside = x * x + y * y <= 1
        }
        if (inside && pointerPrimary && pointerButton === 0) {
          interaction.impactX = x
          interaction.impactY = y
          interaction.impactEnergy = 1
        }
        impactPending = false
      }
    }

    function onPointerMove (event) {
      if (event.pointerType !== 'mouse') return
      if (manualPaused || particleFailed || pageHidden || offscreen) return
      hoverClientX = event.clientX
      hoverClientY = event.clientY
      hasHoverCoordinates = true
      pointerMovePending = true
    }

    function onPointerDown (event) {
      if (event.pointerType !== 'mouse') return
      if (manualPaused || particleFailed || pageHidden || offscreen) return
      impactClientX = event.clientX
      impactClientY = event.clientY
      pointerPrimary = Boolean(event.isPrimary)
      pointerButton = event.button
      impactPending = true
    }

    function onPointerOut (event) {
      if (event.relatedTarget == null) clearHover()
    }

    function onBlur () {
      clearHover()
    }

    function inputAllowed () {
      return !mobileQuery.matches && !coarseQuery.matches && !noHoverQuery.matches && !reducedMotion && !destroyed && !fallback
    }

    function syncInputPolicy () {
      if (!inputAllowed()) {
        clearInteraction()
        removeInputListeners()
        return
      }
      if (!inputAttached) {
        root.addEventListener('pointermove', onPointerMove, { passive: true })
        root.addEventListener('pointerdown', onPointerDown, { passive: true })
        root.addEventListener('pointerout', onPointerOut)
        root.addEventListener('blur', onBlur)
        root.addEventListener('scroll', queueBoundsRefresh, { passive: true })
        inputAttached = true
        queueBoundsRefresh()
      }
    }

    function renderFrame (timestamp) {
      animationFrameId = 0
      if (boundsDirty) {
        try { refreshCachedBounds() } catch (error) { fail(); return }
      }
      if (!canAnimate()) return
      if (!hasTimestamp) {
        lastTimestamp = timestamp
        hasTimestamp = true
        updateInteraction(0)
        if (resizeDirty) {
          rebuildProjection(timestamp, false)
        }
        if (fallback) return
        syncAnimation()
        return
      }
      const elapsed = Math.max(0, timestamp - lastTimestamp)
      lastTimestamp = timestamp
      updateInteraction(elapsed)
      elapsedSinceDraw += elapsed
      transactionDue = false
      let rebuilt = false
      if (resizeDirty) {
        rebuilt = rebuildProjection(timestamp, false)
      } else if (elapsedSinceDraw + 0.000001 >= 1000 / activeFps) {
        transactionDue = true
        const phaseElapsed = elapsedSinceDraw
        elapsedSinceDraw = 0
        try {
          basePhase = core.advanceBasePhase(basePhase, phaseElapsed)
        } catch (error) { fail(); return }
      }
      if (fallback) return
      if (transactionDue && !rebuilt) {
        try { drawCurrentFrame(true, timestamp, true) } catch (error) { fail(); return }
      }
      syncAnimation()
    }

    function onMutation () {
      const wasManualPaused = manualPaused
      const wasParticleFailed = particleFailed
      manualPaused = scene.classList.contains('motion-paused')
      particleFailed = scene.classList.contains('particle-fallback')
      if ((!wasManualPaused && manualPaused) || (!wasParticleFailed && particleFailed)) clearInteraction()
      syncAnimation()
    }

    function onIntersection (entries) {
      const wasOffscreen = offscreen
      offscreen = !(entries && entries[0] && entries[0].isIntersecting)
      if (!wasOffscreen && offscreen) clearInteraction()
      syncAnimation()
    }

    function onVisibilityChange () {
      const wasPageHidden = pageHidden
      pageHidden = Boolean(document.hidden)
      if (!wasPageHidden && pageHidden) clearInteraction()
      syncAnimation()
    }

    function onMotionChange (event) {
      reducedMotion = Boolean(event && event.matches)
      syncInputPolicy()
      if (reducedMotion) {
        cancelAnimation()
        if (initialized && !fallback) {
          try { drawCurrentFrame(true, 0, false) } catch (error) { fail() }
        }
      }
      syncAnimation()
    }

    function onMobileChange () {
      syncInputPolicy()
      queueResize()
    }

    function onCoarseChange () { syncInputPolicy() }

    function onNoHoverChange () { syncInputPolicy() }

    function addMediaListener (query, handler, setLegacy) {
      if (query && typeof query.addEventListener === 'function') query.addEventListener('change', handler)
      else if (query && typeof query.addListener === 'function') {
        query.addListener(handler)
        setLegacy()
      }
    }

    function initialize () {
      idleId = 0
      if (destroyed || fallback) return
      try {
        qualityState = core.createQualityState(2)
        drawHistory = new Float64Array(1024)
        measureScratch = new Float64Array(1024)
        redrawIntervals = new Float64Array(120)
        const sourceCanvas = document.createElement('canvas')
        sourceCanvas.width = config.textureWidth || core.TEXTURE_WIDTH
        sourceCanvas.height = config.textureHeight || core.TEXTURE_HEIGHT
        sourceWidth = sourceCanvas.width
        const sourceContext = sourceCanvas.getContext('2d', { alpha: false })
        if (!sourceContext) throw new Error('planet source context unavailable')
        sourceImage = sourceContext.createImageData(sourceCanvas.width, sourceCanvas.height)
        core.fillTexturePixels(sourceImage.data, sourceCanvas.width, sourceCanvas.height, Number.isInteger(config.seed) ? config.seed : 0x706C616E)
        sourceContext.putImageData(sourceImage, 0, 0)
        fallback = false
        rebuildProjection(0, true)
        if (fallback) return
        initialized = true
        if (canvas.style) canvas.style.display = ''
        removeClass(scene, 'planet-fallback')
        addClass(scene, 'planet-ready')
        syncAnimation()
      } catch (error) { fail() }
    }

    function mark () { return drawSerial }

    function measureSince (marker) {
      const start = Number.isInteger(marker) ? marker : -1
      const count = drawSerial - start
      if (start < 0 || count < 0 || count > 1024 || !drawHistory || !measureScratch) return emptyMeasurement()
      let total = 0
      let maximum = 0
      let overEight = 0
      for (let index = 0; index < count; index++) {
        const cost = drawHistory[(start + index) % 1024]
        measureScratch[index] = cost
        total += cost
        if (cost > maximum) maximum = cost
        if (cost > 8) overEight++
      }
      measureScratch.subarray(0, count).sort()
      return Object.freeze({
        complete: true,
        drawCount: count,
        averageDrawMs: count ? total / count : 0,
        p95DrawMs: count ? measureScratch[Math.ceil(count * 0.95) - 1] : 0,
        maxDrawMs: maximum,
        over8msPercent: count ? overEight / count * 100 : 0
      })
    }

    function snapshot () {
      let intervalTotal = 0
      for (let index = 0; index < redrawCount; index++) intervalTotal += redrawIntervals[index]
      return Object.freeze({
        averageDrawMs: qualityState ? qualityState.averageDrawMs : 0,
        p95DrawMs: qualityState ? qualityState.p95DrawMs : 0,
        maxDrawMs: qualityState ? qualityState.maxDrawMs : 0,
        over8msPercent: qualityState ? qualityState.over8msPercent : 0,
        redrawFps: redrawCount && intervalTotal ? redrawCount * 1000 / intervalTotal : 0,
        qualityLevel: qualityState ? qualityState.level : 2,
        canvasWidth: backing.width,
        canvasHeight: backing.height,
        effectiveDpr: backing.effectiveDpr,
        initialized,
        running: canAnimate() && Boolean(animationFrameId),
        fallback,
        visible: !offscreen,
        pageVisible: !pageHidden,
        basePhase,
        drawCount: drawSerial
      })
    }

    function destroy () {
      if (destroyed) return
      destroyed = true
      clearInteraction()
      cleanupOwned()
      removeClass(scene, 'planet-ready')
      if (mountedLifecycle === lifecycle) {
        mountedLifecycle = null
        activeSnapshot = emptySnapshot
        activeMark = function () { return 0 }
        activeMeasure = emptyMeasurement
      }
    }

    lifecycle = Object.freeze({ destroy, snapshot })
    mountedLifecycle = lifecycle
    updateActiveMetrics(lifecycle, snapshot, mark, measureSince)
    try {
      mutationObserver = new root.MutationObserver(onMutation)
      mutationObserver.observe(scene, { attributes: true, attributeFilter: ['class'] })
      if (typeof root.IntersectionObserver === 'function') {
        intersectionObserver = new root.IntersectionObserver(onIntersection)
        intersectionObserver.observe(canvas)
      }
      if (typeof root.ResizeObserver === 'function') {
        resizeObserver = new root.ResizeObserver(onResize)
        resizeObserver.observe(canvas)
      } else {
        resizeFallback = true
        root.addEventListener('resize', onResize)
      }
      document.addEventListener('visibilitychange', onVisibilityChange)
      addMediaListener(motionQuery, onMotionChange, function () { motionUsesLegacy = true })
      addMediaListener(mobileQuery, onMobileChange, function () { mobileUsesLegacy = true })
      addMediaListener(coarseQuery, onCoarseChange, function () { coarseUsesLegacy = true })
      addMediaListener(noHoverQuery, onNoHoverChange, function () { noHoverUsesLegacy = true })
      syncInputPolicy()
      if (typeof root.requestIdleCallback === 'function') {
        idleUsesTimeout = false
        idleId = root.requestIdleCallback(initialize, { timeout: 300 })
      } else {
        idleUsesTimeout = true
        idleId = root.setTimeout(initialize, 32)
      }
    } catch (error) { fail() }
    return lifecycle
  }

  function createFallback (canvas, scene) {
    let destroyed = false
    const fallbackSnapshot = function () {
      return Object.freeze({
        averageDrawMs: 0,
        p95DrawMs: 0,
        maxDrawMs: 0,
        over8msPercent: 0,
        redrawFps: 0,
        qualityLevel: 2,
        canvasWidth: 0,
        canvasHeight: 0,
        effectiveDpr: 1,
        initialized: false,
        running: false,
        fallback: true,
        visible: true,
        pageVisible: true,
        basePhase: 0,
        drawCount: 0
      })
    }
    removeClass(scene, 'planet-ready')
    addClass(scene, 'planet-fallback')
    if (canvas && canvas.style) canvas.style.display = 'none'
    const lifecycle = Object.freeze({
      destroy: function () {
        if (destroyed) return
        destroyed = true
        if (mountedLifecycle === lifecycle) {
          mountedLifecycle = null
          activeSnapshot = emptySnapshot
          activeMark = function () { return 0 }
          activeMeasure = emptyMeasurement
        }
      },
      snapshot: fallbackSnapshot
    })
    mountedLifecycle = lifecycle
    updateActiveMetrics(lifecycle, fallbackSnapshot, function () { return 0 }, emptyMeasurement)
    return lifecycle
  }

  const api = Object.freeze({ mount })
  if (root && root.document && typeof root.document.getElementById === 'function') {
    const canvas = root.document.getElementById('planet-surface')
    if (canvas && typeof canvas.getContext === 'function') mount(canvas)
  }
  return api
})
