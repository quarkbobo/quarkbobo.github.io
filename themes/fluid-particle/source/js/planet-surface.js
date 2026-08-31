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
      typeof core.computeBackingSize === 'function' &&
      typeof core.createQualityState === 'function'
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
      valid = Boolean(canvas && scene && document && validCore(core) &&
        typeof canvas.getContext === 'function' &&
        typeof root.requestAnimationFrame === 'function' &&
        typeof root.cancelAnimationFrame === 'function')
      if (valid) context = canvas.getContext('2d', { alpha: true })
      valid = Boolean(valid && context)
    } catch (error) {
      valid = false
    }

    if (!valid) return createFallback(canvas, scene)

    if (canvas.style) canvas.style.display = ''
    removeClass(scene, 'planet-fallback')

    let initialized = false
    let fallback = false
    let destroyed = false
    let idleId = 0
    let idleUsesTimeout = false
    let backing = { width: 0, height: 0, effectiveDpr: 1 }
    let qualityState
    try {
      qualityState = core.createQualityState(2)
    } catch (error) {
      return createFallback(canvas, scene)
    }
    let basePhase = 0
    let drawCount = 0
    let drawMs = 0
    let lifecycle

    function snapshot () {
      return Object.freeze({
        averageDrawMs: drawMs,
        p95DrawMs: drawMs,
        maxDrawMs: drawMs,
        over8msPercent: drawMs > 8 ? 100 : 0,
        redrawFps: 0,
        qualityLevel: qualityState.level,
        canvasWidth: backing.width,
        canvasHeight: backing.height,
        effectiveDpr: backing.effectiveDpr,
        initialized,
        running: false,
        fallback,
        visible: !canvas.style || canvas.style.display !== 'none',
        pageVisible: !document.hidden,
        basePhase,
        drawCount
      })
    }

    function mark () {
      return drawCount
    }

    function measureSince (marker) {
      const start = Number.isInteger(marker) ? marker : -1
      const measured = drawCount - start
      if (start < 0 || measured < 0 || !initialized || fallback) return emptyMeasurement()
      return Object.freeze({
        complete: true,
        drawCount: measured,
        averageDrawMs: measured ? drawMs : 0,
        p95DrawMs: measured ? drawMs : 0,
        maxDrawMs: measured ? drawMs : 0,
        over8msPercent: measured && drawMs > 8 ? 100 : 0
      })
    }

    function fail () {
      if (destroyed) return
      initialized = false
      fallback = true
      removeClass(scene, 'planet-ready')
      addClass(scene, 'planet-fallback')
      if (canvas.style) canvas.style.display = 'none'
      updateActiveMetrics(lifecycle, snapshot, mark, measureSince)
    }

    function initialize () {
      idleId = 0
      if (destroyed) return
      try {
        const sourceCanvas = document.createElement('canvas')
        sourceCanvas.width = config.textureWidth || core.TEXTURE_WIDTH
        sourceCanvas.height = config.textureHeight || core.TEXTURE_HEIGHT
        const sourceContext = sourceCanvas.getContext('2d', { alpha: false })
        if (!sourceContext) throw new Error('planet source context unavailable')
        const sourceImage = sourceContext.createImageData(sourceCanvas.width, sourceCanvas.height)
        core.fillTexturePixels(sourceImage.data, sourceCanvas.width, sourceCanvas.height,
          Number.isInteger(config.seed) ? config.seed : 0x706C616E)
        sourceContext.putImageData(sourceImage, 0, 0)

        const mobile = root.matchMedia('(max-width: 760px)').matches
        backing = core.computeBackingSize({
          cssWidth: canvas.clientWidth,
          aspectRatio: 43 / 38,
          devicePixelRatio: root.devicePixelRatio,
          mobile,
          level: qualityState.level
        })
        canvas.width = backing.width
        canvas.height = backing.height
        const angleValue = root.getComputedStyle(canvas).getPropertyValue('--planet-equator-angle').trim()
        const equatorRadians = Number.parseFloat(angleValue) * Math.PI / 180
        const projection = core.createSphereMap({
          width: canvas.width,
          height: canvas.height,
          sourceWidth: sourceCanvas.width,
          sourceHeight: sourceCanvas.height,
          equatorRadians
        })
        const outputImage = context.createImageData(canvas.width, canvas.height)
        const now = root.performance && typeof root.performance.now === 'function' ? root.performance.now() : 0
        core.renderProjectedFrame(sourceImage.data, sourceCanvas.width, projection, basePhase, outputImage.data)
        context.putImageData(outputImage, 0, 0)
        drawMs = Math.max(0, (root.performance && typeof root.performance.now === 'function' ? root.performance.now() : now) - now)
        initialized = true
        drawCount = 1
        fallback = false
        if (canvas.style) canvas.style.display = ''
        removeClass(scene, 'planet-fallback')
        addClass(scene, 'planet-ready')
        updateActiveMetrics(lifecycle, snapshot, mark, measureSince)
      } catch (error) {
        fail()
      }
    }

    function destroy () {
      if (destroyed) return
      destroyed = true
      if (idleId) {
        if (idleUsesTimeout) root.clearTimeout(idleId)
        else if (typeof root.cancelIdleCallback === 'function') root.cancelIdleCallback(idleId)
      }
      idleId = 0
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
      if (typeof root.requestIdleCallback === 'function') {
        idleUsesTimeout = false
        idleId = root.requestIdleCallback(initialize, { timeout: 300 })
      } else {
        idleUsesTimeout = true
        idleId = root.setTimeout(initialize, 32)
      }
    } catch (error) {
      fail()
    }
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
