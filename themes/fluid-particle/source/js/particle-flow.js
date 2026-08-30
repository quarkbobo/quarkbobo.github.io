(function (root, factory) {
  const api = factory(root)

  if (typeof module === 'object' && module.exports) {
    module.exports = api
  } else {
    root.FluidParticleRenderer = api
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict'

  const MAX_DELTA_MS = 50
  const METRIC_WINDOW = 120
  const LONG_FRAME_MS = 24
  const DESKTOP_COUNTS = [120, 210, 320]
  const MOBILE_COUNTS = [70, 110, 160]
  const LAYER_RATIOS = [0.84, 0.13, 0.03]
  const LAYER_SCALE = [3.4, 3.4, 6.2, 6.2, 8.5, 8.5]
  const LAYER_ALPHA = [0.24, 0.2, 0.62, 0.54, 0.82, 0.76]
  const STROKE_COLORS = ['rgba(103, 234, 255, 0.72)', 'rgba(149, 104, 255, 0.68)']
  const STREAK_CYCLE_MS = 7200
  const STREAK_BURST_START_MS = 4500
  const STREAK_BURST_DURATION_MS = 1200
  const STREAK_ROTATE_MS = 180
  const STREAK_TRAIL_LIMIT = 2
  const GLINT_GROUP_PHASE_STEP = 0.3819660112501051
  const GLINT_FORMATION_GAP = 0.46
  const EMPTY_LAYER_COUNTS = Object.freeze({ dust: 0, glint: 0, streak: 0 })
  let spriteCache = null
  let mountedLifecycle = null
  let activeSnapshot = emptySnapshot
  const metricsApi = Object.freeze({
    snapshot: function () { return activeSnapshot() }
  })

  function round (value, places) {
    const scale = Math.pow(10, places)
    return Math.round(value * scale) / scale
  }

  function emptySnapshot () {
    return Object.freeze({
      fps: 0,
      averageFrameMs: 0,
      longFramePercent: 0,
      particleCount: 0,
      layerCounts: EMPTY_LAYER_COUNTS,
      dpr: 1,
      qualityLevel: 0
    })
  }

  if (root && !Object.prototype.hasOwnProperty.call(root, '__fluidParticleMetrics')) {
    Object.defineProperty(root, '__fluidParticleMetrics', {
      configurable: false,
      enumerable: false,
      get: function () { return metricsApi }
    })
  }

  function markFallback (canvas) {
    const scene = canvas && canvas.parentElement
    if (scene && scene.classList && typeof scene.classList.add === 'function') {
      scene.classList.add('particle-fallback')
    }
  }

  function noopLifecycle (canvas) {
    markFallback(canvas)
    const snapshot = emptySnapshot
    activeSnapshot = snapshot
    return {
      start: function () {},
      stop: function () {},
      destroy: function () {},
      snapshot
    }
  }

  function createSprite (document, solid, transparent) {
    const sprite = document.createElement('canvas')
    sprite.width = 40
    sprite.height = 40
    const context = sprite.getContext('2d')
    if (!context) return null
    const gradient = context.createRadialGradient(20, 20, 0, 20, 20, 20)
    gradient.addColorStop(0, solid)
    gradient.addColorStop(0.16, solid)
    gradient.addColorStop(1, transparent)
    context.fillStyle = gradient
    context.fillRect(0, 0, 40, 40)
    return sprite
  }

  function getSprites (document) {
    if (spriteCache) return spriteCache
    const cyan = createSprite(document, 'rgba(103, 234, 255, 0.96)', 'rgba(103, 234, 255, 0)')
    const violet = createSprite(document, 'rgba(149, 104, 255, 0.94)', 'rgba(149, 104, 255, 0)')
    if (!cyan || !violet) return null
    spriteCache = [cyan, violet]
    return spriteCache
  }

  function validCore (core) {
    return core &&
      typeof core.createRng === 'function' &&
      typeof core.createParticle === 'function' &&
      typeof core.positionParticle === 'function' &&
      typeof core.advancePhase === 'function' &&
      typeof core.edgeFade === 'function' &&
      typeof core.nextQuality === 'function'
  }

  function layerCountsFor (total) {
    const exact = LAYER_RATIOS.map(function (ratio) { return total * ratio })
    const counts = exact.map(Math.floor)
    const remainderOrder = [0, 1, 2].sort(function (left, right) {
      return (exact[right] - counts[right]) - (exact[left] - counts[left]) || left - right
    })
    let remaining = total - counts[0] - counts[1] - counts[2]
    let cursor = 0
    while (remaining > 0) {
      counts[remainderOrder[cursor++]]++
      remaining--
    }
    return Object.freeze({ dust: counts[0], glint: counts[1], streak: counts[2] })
  }

  function groupGlints (segment, firstGroupIndex) {
    const glints = segment.filter(function (particle) { return particle.layer === 'glint' })
    let cursor = 0
    let groupIndex = firstGroupIndex

    while (cursor < glints.length) {
      const remaining = glints.length - cursor
      let groupSize = Math.min(remaining, 2 + groupIndex % 3)
      if (remaining - groupSize === 1) groupSize += groupSize < 4 ? 1 : -1
      const centerPhase = (0.083 + groupIndex * GLINT_GROUP_PHASE_STEP) % 1
      const lifetime = glints[cursor].lifetime
      const jitter = glints[cursor].jitter
      const wave = glints[cursor].wave
      const band = groupIndex % 3
      const formationPositions = [0]

      for (let member = 1; member < groupSize; member++) {
        const previousSize = Math.max(1.2, glints[cursor + member - 1].size * LAYER_SCALE[2])
        const memberSize = Math.max(1.2, glints[cursor + member].size * LAYER_SCALE[2])
        formationPositions.push(
          formationPositions[member - 1] + (previousSize + memberSize) * GLINT_FORMATION_GAP
        )
      }
      const formationCenter = (formationPositions[0] + formationPositions[groupSize - 1]) / 2

      for (let member = 0; member < groupSize; member++) {
        const particle = glints[cursor + member]
        particle.band = band
        particle.phase = centerPhase
        particle.lifetime = lifetime
        particle.jitter = jitter
        particle.wave = wave
        particle.formationOffset = formationPositions[member] - formationCenter
      }
      cursor += groupSize
      groupIndex++
    }
    return groupIndex
  }

  function createQuotaParticles (core, rng, checkpoints, quotas) {
    const particles = []
    let previousTotal = 0
    let previousQuota = EMPTY_LAYER_COUNTS
    let candidateIndex = 0
    let glintGroupIndex = 0

    for (let checkpointIndex = 0; checkpointIndex < checkpoints.length; checkpointIndex++) {
      const targetTotal = checkpoints[checkpointIndex]
      const targetQuota = quotas[checkpointIndex]
      const needed = {
        dust: targetQuota.dust - previousQuota.dust,
        glint: targetQuota.glint - previousQuota.glint,
        streak: targetQuota.streak - previousQuota.streak
      }
      const accepted = { dust: 0, glint: 0, streak: 0 }
      const segment = []
      const segmentSize = targetTotal - previousTotal

      while (segment.length < segmentSize) {
        const candidate = core.createParticle(candidateIndex++, rng)
        if (accepted[candidate.layer] < needed[candidate.layer]) {
          accepted[candidate.layer]++
          segment.push(candidate)
        }
      }

      glintGroupIndex = groupGlints(segment, glintGroupIndex)

      for (let index = segment.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(rng() * (index + 1))
        const held = segment[index]
        segment[index] = segment[swapIndex]
        segment[swapIndex] = held
      }
      for (let index = 0; index < segment.length; index++) {
        segment[index].index = particles.length
        particles.push(segment[index])
      }

      previousTotal = targetTotal
      previousQuota = targetQuota
    }
    return particles
  }

  function mount (canvas, options) {
    if (mountedLifecycle) return mountedLifecycle
    const config = options || {}
    const document = root && root.document
    const core = root && root.FluidParticleCore
    if (!canvas || !document || !validCore(core) ||
      typeof canvas.getContext !== 'function' ||
      typeof root.requestAnimationFrame !== 'function' ||
      typeof root.cancelAnimationFrame !== 'function') {
      return noopLifecycle(canvas)
    }

    let context
    try {
      context = canvas.getContext('2d', { alpha: true })
    } catch (error) {
      return noopLifecycle(canvas)
    }
    if (!context) return noopLifecycle(canvas)

    let sprites
    try {
      sprites = getSprites(document)
    } catch (error) {
      return noopLifecycle(canvas)
    }
    if (!sprites) return noopLifecycle(canvas)

    const reducedMotionQuery = typeof root.matchMedia === 'function'
      ? root.matchMedia('(prefers-reduced-motion: reduce)')
      : null
    let reducedMotion = Boolean(reducedMotionQuery && reducedMotionQuery.matches)
    function mobileViewport () {
      const coarsePointer = typeof root.matchMedia === 'function' &&
        root.matchMedia('(pointer: coarse)').matches
      return coarsePointer || (Number.isFinite(root.innerWidth) && root.innerWidth < 768)
    }

    const desktopQualityLayerCounts = DESKTOP_COUNTS.map(layerCountsFor)
    const mobileQualityLayerCounts = MOBILE_COUNTS.map(layerCountsFor)
    const desktopReducedCount = 36
    const mobileReducedCount = 24
    const desktopReducedLayerCounts = layerCountsFor(desktopReducedCount)
    const mobileReducedLayerCounts = layerCountsFor(mobileReducedCount)
    const allocationCheckpoints = [mobileReducedCount, desktopReducedCount]
      .concat(MOBILE_COUNTS, DESKTOP_COUNTS)
      .sort(function (left, right) { return left - right })
    const allocationQuotas = allocationCheckpoints.map(layerCountsFor)
    let isMobile = mobileViewport()
    let counts = isMobile ? MOBILE_COUNTS : DESKTOP_COUNTS
    let qualityLayerCounts = isMobile ? mobileQualityLayerCounts : desktopQualityLayerCounts
    let reducedCount = isMobile ? mobileReducedCount : desktopReducedCount
    let reducedLayerCounts = isMobile ? mobileReducedLayerCounts : desktopReducedLayerCounts
    const buckets = [[], [], [], [], [], []]
    const pointer = { x: 0, y: 0 }
    const pointerTarget = { x: 0, y: 0 }
    const viewport = { width: 1, height: 1 }
    const positionOutput = { x: 0, y: 0 }
    const trailOutput = { x: 0, y: 0 }
    const frameSamples = new Float64Array(METRIC_WINDOW)
    const longSamples = new Uint8Array(METRIC_WINDOW)
    const metrics = {
      frameCount: 0,
      frameCursor: 0,
      frameSum: 0,
      longCount: 0,
      particleCount: 0,
      layerCounts: EMPTY_LAYER_COUNTS,
      dpr: 1,
      qualityLevel: 2
    }

    let initialized = false
    let destroyed = false
    let requestedRunning = true
    let animationFrameId = 0
    let resizeFrameId = 0
    let idleId = 0
    let idleUsesTimeout = false
    let lastTimestamp = 0
    let sceneClockMs = 0
    let trailWindowStart = 0
    let trailWindowCount = 0
    let qualityState = { level: 2, frameTimes: [] }
    let pointerListenerAttached = false
    let pointerClientX = 0
    let pointerClientY = 0
    let pointerUpdatePending = false
    let motionQueryListenerMode = ''
    const motionToggle = config.motionToggle
    const motionScene = canvas.parentElement

    function snapshot () {
      const averageFrameMs = metrics.frameCount ? metrics.frameSum / metrics.frameCount : 0
      return Object.freeze({
        fps: averageFrameMs ? round(1000 / averageFrameMs, 1) : 0,
        averageFrameMs: round(averageFrameMs, 2),
        longFramePercent: metrics.frameCount ? round(metrics.longCount / metrics.frameCount * 100, 1) : 0,
        particleCount: metrics.particleCount,
        layerCounts: metrics.layerCounts,
        dpr: metrics.dpr,
        qualityLevel: metrics.qualityLevel
      })
    }
    activeSnapshot = snapshot

    function recordFrame (deltaMs) {
      const cursor = metrics.frameCursor
      if (metrics.frameCount === METRIC_WINDOW) {
        metrics.frameSum -= frameSamples[cursor]
        metrics.longCount -= longSamples[cursor]
      } else {
        metrics.frameCount++
      }
      frameSamples[cursor] = deltaMs
      longSamples[cursor] = deltaMs > LONG_FRAME_MS ? 1 : 0
      metrics.frameSum += deltaMs
      metrics.longCount += longSamples[cursor]
      metrics.frameCursor = (cursor + 1) % METRIC_WINDOW
    }

    function syncPointerListener () {
      const shouldListen = !isMobile
      if (shouldListen === pointerListenerAttached) return
      pointer.x = 0
      pointer.y = 0
      pointerTarget.x = 0
      pointerTarget.y = 0
      pointerUpdatePending = false
      if (shouldListen) root.addEventListener('pointermove', onPointerMove, { passive: true })
      else root.removeEventListener('pointermove', onPointerMove)
      pointerListenerAttached = shouldListen
    }

    function syncParticleBudget () {
      if (!initialized) return
      if (reducedMotion) {
        metrics.qualityLevel = 0
        metrics.particleCount = reducedCount
        metrics.layerCounts = reducedLayerCounts
      } else {
        metrics.qualityLevel = qualityState.level
        metrics.particleCount = counts[qualityState.level]
        metrics.layerCounts = qualityLayerCounts[qualityState.level]
      }
    }

    function syncViewportPolicy () {
      const nextMobile = mobileViewport()
      if (nextMobile === isMobile) return
      isMobile = nextMobile
      counts = isMobile ? MOBILE_COUNTS : DESKTOP_COUNTS
      qualityLayerCounts = isMobile ? mobileQualityLayerCounts : desktopQualityLayerCounts
      reducedCount = isMobile ? mobileReducedCount : desktopReducedCount
      reducedLayerCounts = isMobile ? mobileReducedLayerCounts : desktopReducedLayerCounts
      syncPointerListener()
      syncParticleBudget()
    }

    function resizeNow () {
      resizeFrameId = 0
      if (destroyed) return
      syncViewportPolicy()
      const width = Math.max(1, canvas.clientWidth || 1)
      const height = Math.max(1, canvas.clientHeight || 1)
      const cap = isMobile || metrics.qualityLevel === 0 ? 1.25 : 1.5
      const dpr = Math.min(Number.isFinite(root.devicePixelRatio) ? root.devicePixelRatio : 1, cap)
      viewport.width = width
      viewport.height = height
      metrics.dpr = dpr
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (initialized && (reducedMotion || !requestedRunning)) drawParticles(0)
    }

    function queueResize () {
      if (!resizeFrameId && !destroyed) resizeFrameId = root.requestAnimationFrame(resizeNow)
    }

    function drawBucket (bucketIndex, deltaSeconds) {
      const bucket = buckets[bucketIndex]
      const length = bucket.length
      const sprite = sprites[bucketIndex % 2]
      const activeCount = metrics.particleCount
      const scale = LAYER_SCALE[bucketIndex]
      const baseAlpha = LAYER_ALPHA[bucketIndex]
      const isStreak = bucketIndex >= 4
      let trailSegments = 0

      if (isStreak && trailWindowCount) {
        context.beginPath()
        context.strokeStyle = STROKE_COLORS[bucketIndex % 2]
        context.lineWidth = bucketIndex === 4 ? 1.15 : 1.05
      }

      for (let index = 0; index < length; index++) {
        const particle = bucket[index]
        if (particle.index >= activeCount) continue
        if (deltaSeconds) particle.phase = core.advancePhase(particle.phase, deltaSeconds, particle.lifetime)
        const position = core.positionParticle(particle, particle.phase, viewport, pointer, positionOutput)
        if (particle.layer === 'glint' && particle.formationOffset) {
          position.x += particle.formationOffset * Math.SQRT1_2
          position.y += particle.formationOffset * Math.SQRT1_2
        }
        const fade = core.edgeFade(particle.phase)
        if (fade <= 0.001) continue
        const pulse = particle.layer === 'dust'
          ? 1
          : 0.82 + Math.sin(particle.phase * Math.PI * 2 + particle.wave) * 0.18
        const size = Math.max(1.2, particle.size * scale)

        const streakOffset = isStreak && metrics.layerCounts.streak
          ? (particle.streakSlot - trailWindowStart + metrics.layerCounts.streak) % metrics.layerCounts.streak
          : STREAK_TRAIL_LIMIT
        if (isStreak && streakOffset < trailWindowCount && particle.phase > 0.055) {
          const trail = core.positionParticle(particle, particle.phase - 0.035, viewport, pointer, trailOutput)
          context.moveTo(trail.x, trail.y)
          context.lineTo(position.x, position.y)
          trailSegments++
        }
        context.globalAlpha = fade * baseAlpha * pulse
        context.drawImage(sprite, position.x - size / 2, position.y - size / 2, size, size)
      }

      if (trailSegments) {
        context.globalAlpha = baseAlpha * 0.7
        context.stroke()
      }
    }

    function drawParticles (deltaSeconds) {
      context.clearRect(0, 0, viewport.width, viewport.height)
      context.globalCompositeOperation = 'lighter'
      drawBucket(0, deltaSeconds)
      drawBucket(1, deltaSeconds)
      drawBucket(2, deltaSeconds)
      drawBucket(3, deltaSeconds)
      drawBucket(4, deltaSeconds)
      drawBucket(5, deltaSeconds)
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
    }

    function updateTrailGate (deltaMs) {
      sceneClockMs = (sceneClockMs + deltaMs) % STREAK_CYCLE_MS
      const burstElapsed = sceneClockMs - STREAK_BURST_START_MS
      const streakCount = metrics.layerCounts.streak
      if (burstElapsed >= 0 && burstElapsed < STREAK_BURST_DURATION_MS && streakCount) {
        const rotation = Math.floor(burstElapsed / STREAK_ROTATE_MS)
        trailWindowStart = rotation * STREAK_TRAIL_LIMIT % streakCount
        trailWindowCount = Math.min(STREAK_TRAIL_LIMIT, streakCount)
      } else {
        trailWindowStart = 0
        trailWindowCount = 0
      }
    }

    function scheduleFrame () {
      if (!animationFrameId && initialized && requestedRunning && !destroyed &&
        !reducedMotion && !document.hidden) {
        animationFrameId = root.requestAnimationFrame(renderFrame)
      }
    }

    function renderFrame (timestamp) {
      animationFrameId = 0
      if (destroyed || !requestedRunning || reducedMotion || document.hidden) return
      const rawDeltaMs = lastTimestamp ? Math.max(0, timestamp - lastTimestamp) : 0
      const motionDeltaMs = Math.min(rawDeltaMs, MAX_DELTA_MS)
      lastTimestamp = timestamp

      if (rawDeltaMs) {
        recordFrame(rawDeltaMs)
        const previousQualityLevel = metrics.qualityLevel
        qualityState = core.nextQuality(qualityState, rawDeltaMs)
        metrics.qualityLevel = qualityState.level
        metrics.particleCount = counts[qualityState.level]
        metrics.layerCounts = qualityLayerCounts[qualityState.level]
        if (previousQualityLevel !== qualityState.level &&
          (previousQualityLevel === 0 || qualityState.level === 0)) resizeNow()
      }

      updateTrailGate(motionDeltaMs)
      syncPointerTarget()
      const easing = motionDeltaMs ? Math.min(1, motionDeltaMs / 180) : 0
      pointer.x += (pointerTarget.x - pointer.x) * easing
      pointer.y += (pointerTarget.y - pointer.y) * easing
      drawParticles(motionDeltaMs / 1000)
      scheduleFrame()
    }

    function initialize () {
      idleId = 0
      if (destroyed) return
      const rng = core.createRng(Number.isInteger(config.seed) ? config.seed : 0x51A7E11)
      const particles = createQuotaParticles(core, rng, allocationCheckpoints, allocationQuotas)
      let streakSlot = 0
      for (let index = 0; index < particles.length; index++) {
        const particle = particles[index]
        const layerOffset = particle.layer === 'dust' ? 0 : particle.layer === 'glint' ? 2 : 4
        const colorOffset = (particle.index + particle.band) & 1
        if (particle.layer === 'streak') particle.streakSlot = streakSlot++
        buckets[layerOffset + colorOffset].push(particle)
      }
      initialized = true
      syncParticleBudget()
      resizeNow()

      if (!reducedMotion) scheduleFrame()
    }

    function scheduleIdle () {
      if (typeof root.requestIdleCallback === 'function') {
        idleUsesTimeout = false
        idleId = root.requestIdleCallback(initialize, { timeout: 240 })
      } else {
        idleUsesTimeout = true
        idleId = root.setTimeout(initialize, 32)
      }
    }

    function onPointerMove (event) {
      pointerClientX = Number.isFinite(event.clientX) ? event.clientX : 0
      pointerClientY = Number.isFinite(event.clientY) ? event.clientY : 0
      pointerUpdatePending = true
    }

    function syncPointerTarget () {
      if (!pointerUpdatePending) return
      pointerUpdatePending = false
      const bounds = canvas.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      pointerTarget.x = ((pointerClientX - bounds.left) / bounds.width - 0.5) * 16
      pointerTarget.y = ((pointerClientY - bounds.top) / bounds.height - 0.5) * 16
    }

    function onVisibilityChange () {
      lastTimestamp = 0
      if (document.hidden) {
        if (animationFrameId) root.cancelAnimationFrame(animationFrameId)
        animationFrameId = 0
      } else {
        scheduleFrame()
      }
    }

    function onReducedMotionChange (event) {
      if (destroyed) return
      const nextReducedMotion = Boolean(event && typeof event.matches === 'boolean'
        ? event.matches
        : reducedMotionQuery && reducedMotionQuery.matches)
      if (nextReducedMotion === reducedMotion) return
      reducedMotion = nextReducedMotion
      lastTimestamp = 0
      if (animationFrameId) root.cancelAnimationFrame(animationFrameId)
      animationFrameId = 0
      if (!initialized) return

      syncParticleBudget()
      if (resizeFrameId) root.cancelAnimationFrame(resizeFrameId)
      resizeFrameId = 0
      resizeNow()
      if (!reducedMotion) scheduleFrame()
    }

    function syncMotionControl (paused) {
      if (!motionToggle) return
      motionToggle.setAttribute('aria-pressed', String(paused))
      motionToggle.textContent = paused ? '继续背景动态' : '暂停背景动态'
      if (motionScene && motionScene.classList && typeof motionScene.classList.toggle === 'function') {
        motionScene.classList.toggle('motion-paused', paused)
      }
    }

    function start () {
      if (destroyed) return
      requestedRunning = true
      lastTimestamp = 0
      syncMotionControl(false)
      scheduleFrame()
    }

    function stop () {
      if (destroyed) return
      requestedRunning = false
      lastTimestamp = 0
      if (animationFrameId) root.cancelAnimationFrame(animationFrameId)
      animationFrameId = 0
      syncMotionControl(true)
    }

    function onMotionToggle () {
      if (requestedRunning) stop()
      else start()
    }

    function destroy () {
      if (destroyed) return
      stop()
      destroyed = true
      if (resizeFrameId) root.cancelAnimationFrame(resizeFrameId)
      resizeFrameId = 0
      if (idleId) {
        if (idleUsesTimeout) root.clearTimeout(idleId)
        else if (typeof root.cancelIdleCallback === 'function') root.cancelIdleCallback(idleId)
      }
      idleId = 0
      root.removeEventListener('resize', queueResize)
      if (pointerListenerAttached) root.removeEventListener('pointermove', onPointerMove)
      pointerListenerAttached = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (motionQueryListenerMode === 'event') {
        reducedMotionQuery.removeEventListener('change', onReducedMotionChange)
      } else if (motionQueryListenerMode === 'legacy') {
        reducedMotionQuery.removeListener(onReducedMotionChange)
      }
      motionQueryListenerMode = ''
      if (motionToggle && typeof motionToggle.removeEventListener === 'function') {
        motionToggle.removeEventListener('click', onMotionToggle)
      }
      metrics.particleCount = 0
      metrics.layerCounts = EMPTY_LAYER_COUNTS
      if (mountedLifecycle === lifecycle) mountedLifecycle = null
    }

    root.addEventListener('resize', queueResize)
    syncPointerListener()
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (reducedMotionQuery && typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', onReducedMotionChange)
      motionQueryListenerMode = 'event'
    } else if (reducedMotionQuery && typeof reducedMotionQuery.addListener === 'function') {
      reducedMotionQuery.addListener(onReducedMotionChange)
      motionQueryListenerMode = 'legacy'
    }
    if (motionToggle && typeof motionToggle.addEventListener === 'function') {
      syncMotionControl(false)
      motionToggle.addEventListener('click', onMotionToggle)
    }
    scheduleIdle()

    const lifecycle = { start, stop, destroy, snapshot }
    mountedLifecycle = lifecycle
    return lifecycle
  }

  const api = { mount }
  if (root && root.document && typeof root.document.getElementById === 'function') {
    const canvas = root.document.getElementById('particle-flow')
    const motionToggle = root.document.getElementById('motion-toggle')
    if (canvas) mount(canvas, { motionToggle })
  }
  return api
})
