import { constrainView, orbitPosition, entryPosition, entryFrame, returnFrame, openingTransform } from './planet-flight.mjs'

const hero = document.querySelector('.home-hero')
const viewport = document.getElementById('planet-viewport')
const canvas = document.getElementById('planet-webgl')
const dialog = document.getElementById('planet-explorer')
const enter = document.getElementById('planet-enter')

if (hero && viewport && canvas && dialog && enter) setup()

function setup () {
  const stage = document.getElementById('planet-stage')
  const close = document.getElementById('planet-close')
  const reset = document.getElementById('planet-reset')
  const pause = document.getElementById('planet-pause')
  const status = document.getElementById('planet-status')
  const motion = document.getElementById('motion-toggle')
  const links = [...dialog.querySelectorAll('[data-planet-node]')]
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const defaultView = { yaw: 0, pitch: 0.26, radius: 10 }
  let view = { ...defaultView }
  let THREE, renderer, scene, camera, exterior, interior, raycaster
  let phase = 'loading'
  let frame = 0
  let lastTime = 0
  let worldTime = 0
  let flightTime = 0
  let transitionStart = 0
  let hiddenAt = 0
  let sourceFrame = null
  let entryOrigin = [0, 1, 8]
  let bufferSize = { width: 0, height: 0, ratio: 0 }
  let transform = { x: 0, y: 0, scale: 1 }
  let flight = entryFrame(0)
  let departureView = null
  let savedPadding = ''
  let visible = true
  let localPaused = false
  let savedFocus, savedOverflow, inertState = []
  let drag = null
  const touches = new Map()
  let pinchDistance = 0
  let gestureMoved = false
  let contextLost = false
  let disposed = false
  const labels = []
  const pointer = { x: 0, y: 0 }
  // Keep the native modal outside the page region that becomes inert.
  document.body.append(dialog)
  canvas.setAttribute('aria-label', '蓝色空间号星球，点击进入内部空间')
  canvas.setAttribute('role', 'button')
  canvas.tabIndex = 0
  enter.setAttribute('aria-haspopup', 'dialog')
  const isPaused = () => reduced.matches || localPaused || motion?.getAttribute('aria-pressed') === 'true'
  const isTransitioning = () => phase === 'approach' || phase === 'departing'
  const exteriorFov = aspect => Math.max(42, THREE.MathUtils.radToDeg(2 * Math.atan(3.3 / (8 * aspect))))
  const interiorFov = aspect => Math.min(88, Math.max(42, 42 / aspect))

  function syncControls () {
    dialog.classList.toggle('planet-motion-paused', isPaused())
    pause.setAttribute('aria-pressed', String(isPaused()))
    pause.textContent = isPaused() ? '继续动态' : '暂停动态'
    pause.disabled = reduced.matches
    pause.title = reduced.matches ? '已按系统偏好减少动态' : ''
  }

  function size () {
    if (!renderer) return
    const host = dialog.open ? stage : viewport
    const { width, height } = host.getBoundingClientRect()
    if (width < 1 || height < 1) return
    const ratio = Math.min(devicePixelRatio || 1, innerWidth < 761 ? 1.4 : 1.7)
    if (width !== bufferSize.width || height !== bufferSize.height || ratio !== bufferSize.ratio) {
      renderer.setDrawingBufferSize(width, height, ratio)
      bufferSize = { width, height, ratio }
    }
    camera.aspect = width / height
    // Keep the full ring in narrow hero viewports and the three stations on phones.
    camera.fov = interior?.group.visible ? interiorFov(camera.aspect) : exteriorFov(camera.aspect)
    camera.updateProjectionMatrix()
    if (dialog.open && phase === 'departing') {
      const homeRect = viewport.getBoundingClientRect()
      sourceFrame = { ...homeRect.toJSON(), fov: exteriorFov(homeRect.width / homeRect.height) }
      transform = openingTransform(sourceFrame, { ...host.getBoundingClientRect().toJSON(), fov: exteriorFov(camera.aspect) })
    } else if (dialog.open && sourceFrame && !interior?.group.visible) {
      transform = openingTransform(sourceFrame, { ...host.getBoundingClientRect().toJSON(), fov: exteriorFov(camera.aspect) })
    }
    if (isTransitioning()) paintTransition()
    draw()
  }

  function changePhase (next) {
    phase = next
    dialog.dataset.phase = next
    hero.dataset.planetPhase = next
    const inside = next === 'interior'
    labels.forEach(({ element }) => { element.inert = !inside })
    dialog.querySelector('.planet-explorer__footer').inert = !inside && next !== 'fallback'
    reset.disabled = !inside
    document.getElementById('planet-zoom-in').disabled = !inside
    document.getElementById('planet-zoom-out').disabled = !inside
    canvas.setAttribute('role', inside ? 'img' : 'button')
    canvas.setAttribute('aria-label', inside
      ? '星球内部三维空间。拖动环视，方向键转动，加减键缩放。下方链接可直接访问内容。'
      : '蓝色空间号星球，点击进入内部空间')
  }

  function positionCamera () {
    if (!camera) return
    if (phase === 'interior') camera.position.set(...orbitPosition(view))
    else if (phase === 'approach' && flight.inside) {
      const remaining = 1 - flight.arrival
      camera.position.set(...orbitPosition({ yaw: -0.12 * remaining, pitch: defaultView.pitch + 0.06 * remaining, radius: defaultView.radius + 2.2 * remaining }))
    } else if (phase === 'approach') camera.position.set(...entryPosition(flightTime, entryOrigin))
    else if (phase === 'departing' && !flight.outside) {
      camera.position.set(...orbitPosition({ ...departureView, radius: departureView.radius + flight.retreat * 0.6 }))
    } else camera.position.set(pointer.x * 0.22, 1 + pointer.y * 0.14, 8)
    camera.lookAt(0, 0, 0)
  }

  function draw () {
    if (!renderer || contextLost || disposed) return
    positionCamera()
    renderer.render(scene, camera)
    if (phase === 'interior' || (phase === 'approach' && flight.inside)) {
      const { width, height } = bufferSize
      labels.forEach(({ element, object, point }) => {
        object.getWorldPosition(point).project(camera)
        element.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 0.9 || Math.abs(point.y) > 0.75
        element.style.setProperty('--node-x', `${(point.x + 1) * width / 2}px`)
        element.style.setProperty('--node-y', `${(1 - point.y) * height / 2 - 38}px`)
      })
    }
  }

  function paintTransition () {
    dialog.style.setProperty('--planet-veil', flight.veil)
    dialog.style.setProperty('--planet-cloud', flight.cloud)
    dialog.style.setProperty('--planet-drift', flight.drift)
    dialog.style.setProperty('--planet-hud', flight.hud)
    const remaining = phase === 'departing' ? flight.collapse : 1 - flight.expansion
    canvas.style.transform = `translate(${transform.x * remaining}px, ${transform.y * remaining}px) scale(${1 + (transform.scale - 1) * remaining})`
  }

  function settlePresentation () {
    canvas.style.removeProperty('transform')
    dialog.style.setProperty('--planet-veil', 1)
    dialog.style.setProperty('--planet-cloud', 0)
    dialog.style.setProperty('--planet-hud', 1)
  }

  function selectWorld (inside) {
    if (exterior.group.visible === !inside && (!interior || interior.group.visible === inside)) return
    exterior.group.visible = !inside
    if (interior) interior.group.visible = inside
    scene.background = inside ? new THREE.Color('#020812') : null
    camera.fov = inside ? interiorFov(camera.aspect) : exteriorFov(camera.aspect)
    camera.updateProjectionMatrix()
  }

  function schedule () {
    if (frame || !renderer || contextLost || disposed || document.hidden || (!dialog.open && !visible)) return
    frame = requestAnimationFrame(tick)
  }

  function tick (time) {
    frame = 0
    // Follow the display cadence during exploration; 45fps gating skips every
    // other callback on a 60Hz display. The passive homepage retains its cap.
    if (!dialog.open && lastTime && time - lastTime < 1000 / 30) { schedule(); return }
    const delta = lastTime ? Math.min(time - lastTime, 64) : 0
    lastTime = time
    if (!isPaused()) worldTime += delta / 1000
    if (isTransitioning()) {
      // Camera, mask, canvas placement and HUD share wall time, even on slow frames.
      flightTime = Math.max(0, time - transitionStart)
      flight = phase === 'departing' ? returnFrame(flightTime) : entryFrame(flightTime)
      paintTransition()
      if (phase === 'departing') {
        if (flight.outside) selectWorld(false)
        if (flight.complete) { dialog.close(); return }
      } else {
        if (flight.inside) selectWorld(true)
        if (flight.complete || reduced.matches) {
          showInterior()
          if (!isPaused()) schedule()
          return
        }
      }
    }
    exterior?.update(worldTime)
    if (interior?.group.visible) interior.update(worldTime)
    draw()
    if (!isPaused() || isTransitioning()) schedule()
  }

  function prepareInterior () {
    if (!interior) {
      // Allocate on entry intent, before the visible flight begins.
      interior = createInterior(THREE)
      scene.add(interior.group)
      const titles = { archives: '文章归档', latest: '最新记录', games: '游戏合集' }
      interior.nodes.forEach(({ object, id }) => {
        const element = document.createElement('button')
        element.type = 'button'
        element.className = 'planet-node-label'
        element.inert = true
        element.textContent = `${titles[id]} ↗`
        element.addEventListener('click', () => links.find(link => link.dataset.planetNode === id)?.click())
        stage.append(element)
        labels.push({ element, object, point: new THREE.Vector3() })
      })
      // Compile on hover/focus intent or before departure, never at the scene seam.
      exterior.group.visible = false
      interior.update(worldTime)
      // Compile only this world's materials and lights. Traversing the full
      // scene also compiles hidden exterior materials against interior lights.
      renderer.compile(interior.group, camera)
      interior.group.visible = false
      exterior.group.visible = true
    }
  }

  function showInterior () {
    prepareInterior()
    selectWorld(true)
    changePhase('interior')
    status.textContent = '已进入星球内部 · 拖动环视，滚轮缩放；选择下方入口继续探索。'
    view = { ...defaultView }
    interior.update(worldTime)
    settlePresentation()
    size()
  }

  function startFlight () {
    if (!dialog.open || !renderer) return
    prepareInterior()
    flightTime = 0
    lastTime = 0
    transitionStart = performance.now()
    flight = entryFrame(0)
    if (reduced.matches || isPaused()) showInterior()
    else {
      changePhase('approach')
      selectWorld(false)
      status.textContent = '正在穿越星环与云层…'
    }
    size()
    schedule()
  }

  function openExplorer (opener) {
    if (dialog.open) return
    if (renderer && !contextLost) {
      try { prepareInterior() } catch { fail() }
    }
    sourceFrame = { ...canvas.getBoundingClientRect().toJSON(), fov: camera?.fov || 42 }
    if (camera) entryOrigin = camera.position.toArray()
    savedFocus = opener || document.activeElement
    savedOverflow = document.body.style.overflow
    savedPadding = document.body.style.paddingRight
    const scrollbar = innerWidth - document.documentElement.clientWidth
    if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`
    inertState = [...document.body.children].filter(el => el !== dialog).map(el => [el, el.inert])
    inertState.forEach(([el]) => { el.inert = true })
    document.body.style.overflow = 'hidden'
    document.body.classList.add('planet-is-exploring')
    dialog.showModal()
    stage.append(canvas)
    close.focus({ preventScroll: true })
    if (renderer && !contextLost) startFlight()
    else {
      changePhase(phase === 'loading' ? 'loading' : 'fallback')
      settlePresentation()
      status.textContent = phase === 'loading' ? '正在准备星球空间…' : '当前设备暂时无法显示 3D 空间。你仍可通过下方入口探索内容。'
    }
  }

  function requestClose () {
    if (!dialog.open) return
    if (!renderer || phase !== 'interior' || isPaused() || contextLost || document.hidden) { dialog.close(); return }
    const rect = viewport.getBoundingClientRect()
    sourceFrame = { ...rect.toJSON(), fov: exteriorFov(rect.width / rect.height) }
    transform = openingTransform(sourceFrame, { ...stage.getBoundingClientRect().toJSON(), fov: exteriorFov(camera.aspect) })
    departureView = { ...view }
    flightTime = 0
    transitionStart = performance.now()
    lastTime = 0
    flight = returnFrame(0)
    changePhase('departing')
    status.textContent = '正在返回深空…'
    paintTransition()
    schedule()
  }

  function finishClose () {
    cancelAnimationFrame(frame)
    frame = 0
    drag = null
    touches.clear()
    gestureMoved = false
    transitionStart = 0
    sourceFrame = null
    canvas.style.removeProperty('transform')
    viewport.append(canvas)
    inertState.forEach(([el, previous]) => { el.inert = previous })
    inertState = []
    document.body.style.overflow = savedOverflow || ''
    document.body.style.paddingRight = savedPadding
    document.body.classList.remove('planet-is-exploring')
    if (exterior && !contextLost) {
      exterior.group.visible = true
      if (interior) interior.group.visible = false
      scene.background = null
      changePhase('exterior')
      pointer.x = pointer.y = 0
      lastTime = 0
      size()
      schedule()
    }
    savedFocus?.focus({ preventScroll: true })
  }

  function fail () {
    cancelAnimationFrame(frame)
    frame = 0
    hero.classList.remove('planet-webgl-ready')
    changePhase('fallback')
    settlePresentation()
    canvas.hidden = true
    status.textContent = '当前设备暂时无法显示 3D 空间。你仍可通过下方入口探索内容。'
    enter.textContent = '探索星球内容'
    renderer?.dispose()
    renderer = null
  }

  function zoom (amount) {
    if (phase !== 'interior') return
    view = constrainView({ ...view, radius: view.radius + amount })
    draw()
  }

  function hit (event, objects) {
    const rect = canvas.getBoundingClientRect()
    raycaster.setFromCamera({ x: (event.clientX - rect.left) / rect.width * 2 - 1, y: -(event.clientY - rect.top) / rect.height * 2 + 1 }, camera)
    return raycaster.intersectObjects(objects, true)[0]
  }

  function activateHit (event) {
    if (!renderer || isTransitioning()) return
    if (!dialog.open) {
      if (hit(event, [exterior.planet])) openExplorer(canvas)
    } else if (phase === 'interior') {
      const selected = hit(event, interior.nodes.map(node => node.object))
      if (!selected) return
      const node = interior.nodes.find(node => {
        let object = selected.object
        while (object) {
          if (object === node.object) return true
          object = object.parent
        }
        return false
      })
      const link = links.find(link => link.dataset.planetNode === node?.id)
      link?.click()
    }
  }

  enter.addEventListener('click', () => openExplorer(enter))
  // Some touch browsers suppress the compatibility click after a canvas drag.
  // Activate a stationary control touch on release and ignore its later click.
  let controlTouch = null
  let releasedControl = null
  dialog.addEventListener('pointerdown', event => {
    const button = event.target.closest('.planet-control')
    if (event.pointerType === 'touch' && event.isPrimary && button && !button.disabled) {
      controlTouch = { button, id: event.pointerId, x: event.clientX, y: event.clientY }
    }
  })
  dialog.addEventListener('pointercancel', () => { controlTouch = null })
  dialog.addEventListener('pointerup', event => {
    const touch = controlTouch
    controlTouch = null
    if (!touch || event.pointerId !== touch.id || !touch.button.contains(event.target) || touch.button.disabled) return
    if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 10) return
    releasedControl = { button: touch.button, time: performance.now() }
    touch.button.click()
  })
  dialog.addEventListener('click', event => {
    if (event.isTrusted && event.pointerType === 'touch' && releasedControl?.button.contains(event.target) && performance.now() - releasedControl.time < 700) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }, true)
  close.addEventListener('click', requestClose)
  dialog.addEventListener('close', finishClose)
  // Native dialog Escape handling keeps keyboard focus trapped in the top layer.
  dialog.addEventListener('cancel', event => { event.preventDefault(); drag = null; requestClose() })
  links.forEach(link => link.addEventListener('click', () => dialog.close()))
  reset.addEventListener('click', () => { view = { ...defaultView }; draw() })
  document.getElementById('planet-zoom-in').addEventListener('click', () => zoom(-1))
  document.getElementById('planet-zoom-out').addEventListener('click', () => zoom(1))
  pause.addEventListener('click', () => {
    if (motion) motion.click()
    else localPaused = !localPaused
    syncControls()
    if (phase === 'approach' && isPaused()) showInterior()
    else if (phase === 'departing' && isPaused()) dialog.close()
    lastTime = 0
    schedule()
  })
  motion?.addEventListener('click', () => {
    localPaused = false
    syncControls()
    lastTime = 0
    schedule()
  })
  reduced.addEventListener('change', () => {
    syncControls()
    if (phase === 'approach' && reduced.matches) showInterior()
    else if (phase === 'departing' && reduced.matches) dialog.close()
    lastTime = 0
    draw()
    schedule()
  })
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !dialog.open || phase !== 'interior') return
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (touches.size === 1) {
      gestureMoved = false
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, distance: 0 }
    }
    if (touches.size === 2) {
      const [a, b] = [...touches.values()]
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
      gestureMoved = true
      if (drag) drag.distance = 7
    }
    canvas.setPointerCapture(event.pointerId)
  })
  canvas.addEventListener('pointermove', event => {
    if (!dialog.open) {
      const rect = canvas.getBoundingClientRect()
      if (!isPaused()) {
        pointer.x = (event.clientX - rect.left) / rect.width - 0.5
        pointer.y = (event.clientY - rect.top) / rect.height - 0.5
      }
      return
    }
    if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (touches.size === 2) {
      const [a, b] = [...touches.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (distance > 0 && pinchDistance > 0) zoom(view.radius * (pinchDistance / distance - 1))
      pinchDistance = distance
      return
    }
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.distance += Math.abs(dx) + Math.abs(dy)
    gestureMoved ||= drag.distance > 6
    view = constrainView({ ...view, yaw: view.yaw - dx * 0.006, pitch: view.pitch + dy * 0.005 })
    drag.x = event.clientX
    drag.y = event.clientY
    draw()
  })
  canvas.addEventListener('pointerup', event => {
    const moved = gestureMoved || drag?.distance > 6 || touches.size > 1
    touches.delete(event.pointerId)
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    drag = null
    if (!moved) activateHit(event)
  })
  canvas.addEventListener('pointercancel', () => { drag = null; touches.clear() })
  canvas.addEventListener('lostpointercapture', event => { drag = null; touches.delete(event.pointerId) })
  canvas.addEventListener('wheel', event => {
    if (phase !== 'interior' || !dialog.open) return
    event.preventDefault()
    zoom(Math.sign(event.deltaY) * 0.5)
  }, { passive: false })
  canvas.addEventListener('keydown', event => {
    if (!dialog.open && ['Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openExplorer(canvas)
    } else if (phase === 'interior') {
      const actions = {
        ArrowLeft: () => { view.yaw -= 0.12 }, ArrowRight: () => { view.yaw += 0.12 },
        ArrowUp: () => { view.pitch += 0.08 }, ArrowDown: () => { view.pitch -= 0.08 },
        '+': () => { view.radius -= 0.5 }, '=': () => { view.radius -= 0.5 }, '-': () => { view.radius += 0.5 }
      }
      if (actions[event.key]) {
        event.preventDefault()
        actions[event.key]()
        view = constrainView(view)
        draw()
      }
    }
  })
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault()
    contextLost = true
    fail()
  })
  const resizeObserver = new ResizeObserver(size)
  resizeObserver.observe(viewport)
  resizeObserver.observe(stage)
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting
    lastTime = 0
    if (visible) schedule()
    else if (!dialog.open) { cancelAnimationFrame(frame); frame = 0 }
  })
  observer.observe(hero)
  document.addEventListener('visibilitychange', () => {
    lastTime = 0
    if (document.hidden) { hiddenAt = performance.now(); cancelAnimationFrame(frame); frame = 0 }
    else {
      if (hiddenAt && isTransitioning()) transitionStart += performance.now() - hiddenAt
      hiddenAt = 0
      schedule()
    }
  })
  addEventListener('pagehide', event => {
    cancelAnimationFrame(frame)
    frame = 0
    if (event.persisted) return
    disposed = true
    observer.disconnect()
    resizeObserver.disconnect()
    exterior?.dispose()
    interior?.dispose()
    renderer?.dispose()
  })
  addEventListener('pageshow', () => { lastTime = 0; schedule() })

  let createInterior
  const prewarm = () => {
    if (!renderer || !createInterior || interior || dialog.open || disposed || contextLost) return
    try { prepareInterior() } catch { fail() }
  }
  enter.addEventListener('pointerenter', prewarm, { once: true })
  enter.addEventListener('focus', prewarm, { once: true })
  viewport.addEventListener('pointerenter', prewarm, { once: true })
  canvas.addEventListener('focus', prewarm, { once: true })
  syncControls()
  Promise.all([import('../vendor/three/three.module.min.js'), import('./planet-world.mjs')]).then(([library, worlds]) => {
    if (disposed) return
    THREE = library
    createInterior = worlds.createInterior
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100)
    raycaster = new THREE.Raycaster()
    exterior = worlds.createExterior(THREE)
    scene.add(exterior.group)
    changePhase('exterior')
    size()
    hero.classList.add('planet-webgl-ready')
    // The previous 2D sphere remains as a static fallback, without a second animation loop.
    window.FluidPlanetSurface?.mount(document.getElementById('planet-surface')).destroy()
    if (dialog.open) startFlight()
    else schedule()
  }).catch(fail)
}
