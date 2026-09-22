import * as THREE from '../vendor/three/three.module.min.js'
import { pairForce, accelerations, trailAlpha } from './three-body-core.mjs'

const IDS = ['star-a', 'star-b', 'star-c', 'planet']
const COLORS = [0xffb45b, 0x80caff, 0xff694a, 0x85c9db]
const TRAIL_CAPACITY = 512
const VISUAL_DEFAULTS = { exposure: 1.1, bloom: 1, particles: 1, nebula: 0.6, starScale: 1, trailWidth: 1.4 }
const VISUAL_RANGES = { exposure: [0.6, 1.8], bloom: [0, 2], particles: [0, 2], nebula: [0, 1], starScale: [0.65, 1.5], trailWidth: [0.5, 3] }
const VISUAL_KEYS = Object.keys(VISUAL_DEFAULTS)
const PARTICLE_CAPACITY = { far: 4000, near: 1000, belt: 256 }
const DUST_CAPACITY = 192
const validPosition = position => Array.isArray(position) && position.length === 3 && position.every(Number.isFinite)
const effectStrength = value => THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 2)
// Display radii are enlarged for observation; core radii alone govern collisions.
const displayRadius = body => Math.max(body.radius, body.id === 'planet' ? 0.28 : 0.4 + body.radius * 0.7)
const surfaceVertex = `
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`
const noiseShader = `
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float terrain(vec3 p) {
    float total = 0.0, weight = 0.53;
    for (int i = 0; i < 4; i++) { total += weight * noise(p); p = p * 2.03 + vec3(4.7, 2.1, 8.3); weight *= 0.48; }
    return total;
  }`
const lightShader = `
  uniform vec3 starPositions[3];
  uniform vec3 starColors[3];
  uniform float luminosities[3];
  uniform float auroraStrength;
  uniform float auroraTime;
  vec3 auroralEmission(vec3 local, float daylight) {
    if (auroraStrength <= 0.0) return vec3(0.0);
    vec3 p = normalize(local);
    float longitude = atan(p.y, p.x);
    float latitude = abs(p.z);
    float band = exp(-pow((latitude - 0.86 - sin(longitude * 5.0 + auroraTime * 0.12) * 0.025) / 0.055, 2.0));
    float curtains = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(longitude * 25.0 + sin(longitude * 7.0) + auroraTime * 0.3), 2.0);
    float night = 1.0 - smoothstep(0.003, 0.04, daylight);
    vec3 tint = mix(vec3(0.12, 0.95, 0.48), vec3(0.36, 0.22, 0.85), smoothstep(0.86, 0.96, latitude));
    return tint * band * curtains * night * auroraStrength * 0.85;
  }`

function starMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, time: { value: 0 }, brightness: { value: 1 } },
    vertexShader: surfaceVertex,
    fragmentShader: `
      uniform vec3 tint; uniform float time; uniform float brightness;
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal;
      ${noiseShader}
      void main() {
        vec3 n = normalize(vNormal), eye = normalize(cameraPosition - vWorld);
        float granules = terrain(vLocal * 8.0 + vec3(time * 0.025, 0, 0));
        float facing = max(0.0, dot(n, eye));
        float limb = 0.3 + 0.7 * pow(facing, 0.55);
        float whiteCore = pow(facing, 12.0) * 0.6;
        vec3 light = mix(tint * 0.95, vec3(2.4, 2.3, 2.15), whiteCore);
        light *= limb * (0.87 + granules * 0.22);
        gl_FragColor = vec4(light * brightness, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
}

function coronaMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, time: { value: 0 }, strength: { value: 1 }, flareStrength: { value: 0 } },
    vertexShader: surfaceVertex, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    fragmentShader: `
      uniform vec3 tint; uniform float time; uniform float strength; uniform float flareStrength;
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld)));
        float shell = pow(facing, 2.3) * 1.3;
        float filaments = 0.92 + 0.08 * sin(vLocal.x * 19.0 + sin(vLocal.y * 23.0 + time * 0.12) + vLocal.z * 7.0);
        float eruption = 1.0 + flareStrength * 0.3 * pow(max(0.0, sin(vLocal.x * 11.0 + vLocal.y * 17.0 + time * 0.8)), 8.0);
        gl_FragColor = vec4(tint, shell * filaments * eruption * strength * 0.52);
        #include <colorspace_fragment>
      }`
  })
}

function nebulaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { strength: { value: 0.6 } }, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 direction; uniform float strength;
      void main() {
        vec3 p = normalize(direction);
        float warp = sin(p.x * 5.0 + p.z * 3.0) * 0.13 + sin(p.z * 11.0 - p.x * 2.0) * 0.035;
        float band = exp(-pow((p.y + p.x * 0.25 - warp + 0.05) * 3.6, 2.0));
        float cloud = 0.46 + sin(p.x * 8.0 + sin(p.z * 5.0) * 2.0) * 0.2 + sin(p.x * 19.0 - p.z * 15.0) * 0.08;
        float dust = smoothstep(0.24, 0.7, cloud) * band;
        vec3 tint = mix(vec3(0.043, 0.009, 0.024), vec3(0.007, 0.024, 0.060), smoothstep(-0.7, 0.7, p.x));
        gl_FragColor = vec4(vec3(0.001, 0.0021, 0.0048) + tint * dust * strength, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
}

function planetMaterial(lights) {
  return new THREE.ShaderMaterial({
    uniforms: { ...lights, time: { value: 0 } },
    vertexShader: surfaceVertex,
    fragmentShader: `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal;
      uniform float time; ${lightShader} ${noiseShader}
      void main() {
        vec3 n = normalize(vNormal), eye = normalize(cameraPosition - vWorld);
        float altitude = terrain(vLocal * 3.4 + vec3(1.7, 4.2, 2.9));
        float land = smoothstep(0.46, 0.51, altitude);
        float ice = smoothstep(0.82, 0.97, abs(vLocal.z) + altitude * 0.08);
        vec3 ocean = mix(vec3(0.014, 0.055, 0.11), vec3(0.035, 0.19, 0.23), smoothstep(0.38, 0.46, altitude));
        vec3 ground = mix(vec3(0.12, 0.22, 0.13), vec3(0.40, 0.34, 0.23), smoothstep(0.49, 0.7, altitude));
        vec3 albedo = mix(mix(ocean, ground, land), vec3(0.75, 0.82, 0.84), ice);
        float clouds = smoothstep(0.56, 0.72, terrain(vLocal * 8.0 + vec3(time * 0.012, 0, 0)));
        albedo = mix(albedo, vec3(0.76, 0.81, 0.82), clouds * 0.85);
        vec3 irradiance = vec3(0), specular = vec3(0); float daylight = 0.0;
        for (int i = 0; i < 3; i++) {
          vec3 ray = starPositions[i] - vWorld;
          float flux = luminosities[i] / max(dot(ray, ray), 0.0001);
          vec3 direction = normalize(ray);
          float day = max(0.0, dot(n, direction));
          daylight += flux * day;
          irradiance += starColors[i] * flux * day;
          specular += starColors[i] * flux * pow(max(0.0, dot(reflect(-direction, n), eye)), 55.0) * day;
        }
        vec3 light = vec3(1) - exp(-irradiance * 2.8);
        vec3 color = albedo * (vec3(0.035) + light * 2.4);
        color += (vec3(1) - exp(-specular)) * (1.0 - land) * (1.0 - clouds) * 0.4;
        color += auroralEmission(vLocal, daylight);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
}

function atmosphereMaterial(lights) {
  return new THREE.ShaderMaterial({
    uniforms: lights, vertexShader: surfaceVertex,
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    fragmentShader: `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; ${lightShader}
      void main() {
        vec3 n = normalize(vNormal), eye = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(n, eye)), 3.4), daylight = 0.0;
        for (int i = 0; i < 3; i++) {
          vec3 ray = starPositions[i] - vWorld;
          daylight += luminosities[i] / max(dot(ray, ray), 0.0001) * max(0.0, dot(n, normalize(ray)));
        }
        vec3 aurora = auroralEmission(vLocal, daylight);
        float glow = min(1.0, max(aurora.r, max(aurora.g, aurora.b)));
        vec3 tint = mix(vec3(0.29, 0.61, 0.83), normalize(aurora + vec3(0.0001)), glow);
        gl_FragColor = vec4(tint, rim * (0.08 + 0.42 * (1.0 - exp(-daylight * 3.0)) + glow * 0.55));
        #include <colorspace_fragment>
      }`
  })
}

function glowTexture() {
  const size = 96, data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const distance = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1)
    const offset = (y * size + x) * 4
    data[offset] = data[offset + 1] = data[offset + 2] = 255
    data[offset + 3] = Math.round(Math.exp(-distance * distance * 6) * Math.max(0, 1 - distance) * 255)
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  texture.magFilter = texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

function particleMaterial(pointSize) {
  return new THREE.ShaderMaterial({
    uniforms: { pointSize: { value: pointSize }, gain: { value: 1 } }, vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float pointSize; varying vec3 tint;
      void main() { tint = color; vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(pointSize * 320.0 / max(1.0, -view.z), 1.0, 5.0); gl_Position = projectionMatrix * view; }`,
    fragmentShader: `uniform float gain; varying vec3 tint;
      void main() { float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;
        float halo = exp(-r * r * 5.0) * (1.0 - smoothstep(0.6, 1.0, r));
        gl_FragColor = vec4(tint, halo * gain);
        #include <colorspace_fragment>
      }`
  })
}

function starfield(count, radius, pointSize, seed) {
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3)
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < count; i++) {
    const z = random() * 2 - 1, angle = random() * Math.PI * 2, r = radius * (1 + random() * 0.5)
    const planar = Math.sqrt(1 - z * z), light = 0.18 + Math.pow(random(), 4) * 0.65
    positions.set([r * planar * Math.cos(angle), r * planar * Math.sin(angle), r * z], i * 3)
    colors.set([light * (0.86 + random() * 0.14), light * 0.93, light], i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const points = new THREE.Points(geometry, particleMaterial(pointSize))
  points.frustumCulled = false
  return points
}

function dustField() {
  const geometry = new THREE.BufferGeometry(), seeds = new Float32Array(DUST_CAPACITY * 4)
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST_CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(DUST_CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage))
  let seed = 140729
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < DUST_CAPACITY; i++) seeds.set([random(), (random() - 0.5) * 34, random() * 16 - 6, 0.7 + random() * 0.6], i * 4)
  geometry.setDrawRange(0, 0)
  const points = new THREE.Points(geometry, particleMaterial(0.48))
  points.frustumCulled = false
  return { points, seeds }
}

function makeTrail(color) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRAIL_CAPACITY), 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('spark', new THREE.BufferAttribute(Float32Array.from({ length: TRAIL_CAPACITY }, (_, i) => i % 7 === 0 ? 1 : 0.12), 1))
  geometry.setDrawRange(0, 0)
  const material = (points) => new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, pointSize: { value: 5.6 }, gain: { value: 1 } }, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute float alpha; attribute float spark; uniform float pointSize; varying float fade; varying float scintillation;
      void main() { fade = alpha; scintillation = spark; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = pointSize * (0.72 + spark * 0.28); }`,
    fragmentShader: `uniform vec3 tint; uniform float gain; varying float fade; varying float scintillation;
      void main() { ${points ? 'float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;' : ''}
        gl_FragColor = vec4(${points ? 'mix(tint, vec3(1.0), exp(-r * r * 70.0) * 0.5)' : 'tint'}, fade * gain * ${points ? '(exp(-r * r * 6.0) * 0.23 + exp(-r * r * 65.0) * 0.75) * scintillation' : '0.62'});
        #include <colorspace_fragment>
      }`
  })
  const line = new THREE.Line(geometry, material(false)), particles = new THREE.Points(geometry, material(true))
  line.frustumCulled = particles.frustumCulled = false
  return { geometry, line, particles }
}

export async function createScene(canvas) {
  const attributes = { alpha: false, antialias: true, powerPreference: 'high-performance' }
  const context = canvas.getContext('webgl2', attributes)
  if (!context) throw new Error('此设备无法创建 WebGL2 观测画面')
  const renderer = new THREE.WebGLRenderer({ canvas, context, ...attributes })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5))
  renderer.setClearColor(0x030710, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = VISUAL_DEFAULTS.exposure
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(44, 1, 0.001, 2000)
  const sphere = new THREE.SphereGeometry(1, 48, 32), glow = glowTexture()
  const lights = {
    starPositions: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    starColors: { value: COLORS.slice(0, 3).map(color => new THREE.Color(color)) },
    luminosities: { value: [0, 0, 0] },
    auroraStrength: { value: 0 }, auroraTime: { value: 0 }
  }
  const bodyObjects = IDS.map((id, i) => {
    const group = new THREE.Group()
    const material = i === 3 ? planetMaterial(lights) : starMaterial(COLORS[i])
    const surface = new THREE.Mesh(sphere, material)
    group.add(surface)
    let halo, flare, corona, atmosphere
    if (i === 3) {
      atmosphere = new THREE.Mesh(sphere, atmosphereMaterial(lights))
      atmosphere.scale.setScalar(1.055)
      group.add(atmosphere)
    } else {
      corona = new THREE.Mesh(sphere, coronaMaterial(COLORS[i]))
      corona.scale.setScalar(1.45)
      halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: COLORS[i], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      halo.scale.set(7.2, 7.2, 1)
      flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: COLORS[i], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      flare.scale.set(15, 0.17, 1)
      group.add(corona, halo, flare)
    }
    scene.add(group)
    return { id, group, surface, halo, flare, corona, atmosphere }
  })
  const trails = IDS.map((id, i) => {
    const trail = makeTrail(COLORS[i]); scene.add(trail.line, trail.particles); return trail
  })
  const farStars = starfield(PARTICLE_CAPACITY.far, 360, 2.1, 20260922), nearStars = starfield(PARTICLE_CAPACITY.near, 125, 1.7, 317)
  const nebula = new THREE.Mesh(sphere, nebulaMaterial())
  nebula.scale.setScalar(900); nebula.renderOrder = -10
  const dust = dustField()
  scene.add(nebula, farStars, nearStars, dust.points)
  const beltGeometry = new THREE.BufferGeometry()
  beltGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_CAPACITY.belt * 3), 3).setUsage(THREE.DynamicDrawUsage))
  const ice = new THREE.Color(0xb8e2ef), iceColors = new Float32Array(PARTICLE_CAPACITY.belt * 3)
  for (let i = 0; i < PARTICLE_CAPACITY.belt; i++) ice.toArray(iceColors, i * 3)
  beltGeometry.setAttribute('color', new THREE.BufferAttribute(iceColors, 3)); beltGeometry.setDrawRange(0, 0)
  const belt = new THREE.Points(beltGeometry, particleMaterial(0.55))
  belt.frustumCulled = false; scene.add(belt)
  const markerPositions = []
  for (let i = 0; i < 32; i++) for (const angle of [i * Math.PI / 16, (i + 1) * Math.PI / 16]) markerPositions.push(Math.cos(angle), Math.sin(angle), 0)
  markerPositions.push(-1.5, 0, 0, 1.5, 0, 0, 0, -1.5, 0, 0, 1.5, 0)
  const markerGeometry = new THREE.BufferGeometry()
  markerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(markerPositions, 3))
  const markerMaterial = new THREE.LineBasicMaterial({ color: 0x8ee2e9, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false })
  const lagrangeMarkers = Array.from({ length: 5 }, (_, i) => {
    const marker = new THREE.LineSegments(markerGeometry, markerMaterial)
    marker.name = `L${i + 1}`; marker.frustumCulled = false; scene.add(marker); return marker
  })
  const guideGeometry = new THREE.BufferGeometry()
  guideGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36), 3).setUsage(THREE.DynamicDrawUsage))
  guideGeometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(12), 1).setUsage(THREE.DynamicDrawUsage))
  guideGeometry.setDrawRange(0, 0)
  const lagrangeGuides = new THREE.LineSegments(guideGeometry, new THREE.LineDashedMaterial({ color: 0x78b9c7, transparent: true, opacity: 0.24, dashSize: 0.12, gapSize: 0.12, depthWrite: false }))
  lagrangeGuides.frustumCulled = false; scene.add(lagrangeGuides)
  const arrows = Array.from({ length: 8 }, () => {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xffffff, 0.16, 0.07)
    arrow.visible = false
    arrow.line.material.transparent = arrow.cone.material.transparent = true
    arrow.line.material.opacity = arrow.cone.material.opacity = 0.85
    scene.add(arrow)
    return arrow
  })
  const pairGeometry = new THREE.BufferGeometry()
  pairGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3).setUsage(THREE.DynamicDrawUsage))
  const pairLines = new THREE.LineSegments(pairGeometry, new THREE.LineBasicMaterial({ color: 0x809bab, transparent: true, opacity: 0.24, depthWrite: false }))
  pairLines.visible = false; pairLines.frustumCulled = false; scene.add(pairLines)
  const target = new THREE.Vector3(), desiredTarget = new THREE.Vector3(), desiredCamera = new THREE.Vector3()
  const vector = new THREE.Vector3(), origin = new THREE.Vector3(), box = new THREE.Box3()
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3()
  let width = 0, height = 0, frames = 0, disposed = false, currentView = 'station'
  const visual = { ...VISUAL_DEFAULTS }
  const effects = { flare: { starId: null, strength: 0 }, dust: 0, aurora: 0 }
  const visualRadius = body => displayRadius(body) * (width < 650 ? 1.5 : 1) * visual.starScale
  let trailPointCount = 0, forceArrowCount = 0, bodyCount = 0, projections = {}
  let forcePairs = []
  let selectedVectors = null
  let beltCount = 0, lagrangeCount = 0, lagrangeProjections = {}
  let fitBelt = false, dustCount = 0

  function resize() {
    const rect = canvas.getBoundingClientRect()
    const nextWidth = Math.max(1, Math.round(rect.width)), nextHeight = Math.max(1, Math.round(rect.height))
    if (width === nextWidth && height === nextHeight) return
    width = nextWidth; height = nextHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function updateCamera(bodies, options) {
    currentView = IDS.includes(options.view) ? options.view : 'station'
    const referencePoints = Array.isArray(options.lagrange) ? options.lagrange.slice() : []
    if (fitBelt && currentView === 'station' && Array.isArray(options.belt?.particles)) {
      let count = 0
      for (const particle of options.belt.particles) {
        if (particle.active === false || !validPosition(particle.position)) continue
        referencePoints.push(particle)
        if (++count === PARTICLE_CAPACITY.belt) break
      }
    }
    box.makeEmpty()
    for (const body of bodies) if (body.active) box.expandByPoint(vector.fromArray(body.position))
    for (const point of referencePoints) if (validPosition(point.position)) box.expandByPoint(vector.fromArray(point.position))
    if (box.isEmpty()) desiredTarget.set(0, 0, 0)
    else box.getCenter(desiredTarget)
    let radius = 2
    for (const body of bodies) if (body.active) radius = Math.max(radius, vector.fromArray(body.position).distanceTo(desiredTarget) + visualRadius(body) * 2)
    for (const point of referencePoints) if (validPosition(point.position)) radius = Math.max(radius, vector.fromArray(point.position).distanceTo(desiredTarget) + 0.3)
    const yaw = Number.isFinite(options.yaw) ? options.yaw : 0.12
    const pitch = THREE.MathUtils.clamp(Number.isFinite(options.pitch) ? options.pitch : 0.27, -1.35, 1.35)
    const zoom = THREE.MathUtils.clamp(Number.isFinite(options.zoom) ? options.zoom : 1, 0.3, 5)
    forward.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    right.set(Math.cos(yaw), 0, -Math.sin(yaw)); up.crossVectors(forward, right)
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    let distance = 3
    for (const body of bodies) if (body.active) {
      vector.fromArray(body.position).sub(desiredTarget)
      const margin = visualRadius(body) * 1.6
      distance = Math.max(distance, vector.dot(forward) + Math.max((Math.abs(vector.dot(right)) + margin) / (tangent * camera.aspect), (Math.abs(vector.dot(up)) + margin) / tangent))
    }
    for (const point of referencePoints) if (validPosition(point.position)) {
      vector.fromArray(point.position).sub(desiredTarget)
      distance = Math.max(distance, vector.dot(forward) + Math.max((Math.abs(vector.dot(right)) + 0.3) / (tangent * camera.aspect), (Math.abs(vector.dot(up)) + 0.3) / tangent))
    }
    distance *= 1.16
    const followed = bodies.find(body => body.id === currentView)
    if (followed) {
      desiredTarget.fromArray(followed.position)
      distance = visualRadius(followed) * 8.5 / Math.min(1, camera.aspect)
    }
    distance /= zoom
    desiredCamera.copy(forward).multiplyScalar(distance).add(desiredTarget)
    const alpha = !frames || options.paused ? 1 : 1 - Math.exp(-Math.max(0, options.deltaSeconds || 0) * 9)
    if (alpha === 1) {
      target.copy(desiredTarget)
      camera.position.copy(desiredCamera)
    } else {
      target.lerp(desiredTarget, alpha)
      camera.position.lerp(desiredCamera, alpha)
    }
    // A camera cannot enter a body even when an interpolated transition crosses one.
    for (const body of bodies) if (body.active) {
      origin.fromArray(body.position)
      vector.subVectors(camera.position, origin)
      const safeRadius = visualRadius(body) * 1.35
      if (vector.lengthSq() < safeRadius * safeRadius) {
        if (vector.lengthSq() < 1e-12) vector.set(0, 0, 1)
        camera.position.copy(origin).add(vector.setLength(safeRadius))
      }
    }
    camera.far = Math.max(2000, radius * 8, camera.position.length() + 1000)
    camera.updateProjectionMatrix()
    camera.lookAt(target)
    camera.updateMatrixWorld()
    farStars.position.copy(camera.position)
    nearStars.position.copy(camera.position).multiplyScalar(0.985)
    nebula.position.copy(camera.position)
  }

  function updateObservations(system, options) {
    beltCount = 0
    for (const particle of Array.isArray(options.belt?.particles) ? options.belt.particles : []) {
      if (beltCount >= PARTICLE_CAPACITY.belt) break
      if (particle.active === false || !validPosition(particle.position)) continue
      beltGeometry.attributes.position.array.set(particle.position, beltCount++ * 3)
    }
    beltGeometry.setDrawRange(0, beltCount); beltGeometry.attributes.position.needsUpdate = true
    belt.material.uniforms.gain.value = 0.9
    lagrangeCount = 0; lagrangeProjections = {}
    const points = Array.isArray(options.lagrange) ? options.lagrange : []
    const hasMarkers = points.some(point => /^L[1-5]$/.test(point.id) && validPosition(point.position))
    markerGeometry.setDrawRange(0, hasMarkers ? markerPositions.length / 3 : 0)
    for (const marker of lagrangeMarkers) {
      const point = points.find(point => point.id === marker.name)
      const valid = Boolean(point && validPosition(point.position))
      // Keep the empty geometry uploaded so toggling markers never allocates a GPU buffer.
      marker.visible = valid || !hasMarkers
      if (!valid) continue
      lagrangeCount++; marker.position.fromArray(point.position)
      marker.quaternion.copy(camera.quaternion)
      marker.scale.setScalar(Math.max(0.035, marker.position.distanceTo(camera.position) * 0.005))
      vector.copy(marker.position).project(camera)
      lagrangeProjections[marker.name] = { x: (vector.x + 1) * width / 2, y: (1 - vector.y) * height / 2, visible: Math.abs(vector.x) < 1 && Math.abs(vector.y) < 1 && vector.z >= -1 && vector.z <= 1 }
    }
    let segments = 0
    const segment = (a, b) => {
      if (!a || !b || !validPosition(a.position) || !validPosition(b.position)) return
      guideGeometry.attributes.position.array.set(a.position, segments * 6)
      guideGeometry.attributes.position.array.set(b.position, segments * 6 + 3)
      guideGeometry.attributes.lineDistance.array[segments * 2] = 0
      guideGeometry.attributes.lineDistance.array[segments * 2 + 1] = vector.fromArray(a.position).distanceTo(origin.fromArray(b.position))
      segments++
    }
    const primaryA = system.bodies.find(body => body.id === options.lagrangePrimaries?.[0] && body.active)
    const primaryB = system.bodies.find(body => body.id === options.lagrangePrimaries?.[1] && body.active)
    if (lagrangeCount && primaryA && primaryB) {
      for (const id of ['L4', 'L5']) {
        const point = points.find(point => point.id === id)
        segment(primaryA, point); segment(point, primaryB)
      }
      segment(primaryA, primaryB)
      segment(points.find(point => point.id === 'L3'), points.find(point => point.id === 'L2'))
    }
    guideGeometry.setDrawRange(0, segments * 2)
    guideGeometry.attributes.position.needsUpdate = guideGeometry.attributes.lineDistance.needsUpdate = true
  }

  function showArrow(start, direction, length, color, opacity = 0.85) {
    if (forceArrowCount >= arrows.length || !Number.isFinite(length) || length <= 0 || direction.lengthSq() === 0) return
    const arrow = arrows[forceArrowCount++]
    arrow.visible = true; arrow.position.copy(start)
    arrow.setDirection(direction.normalize()); arrow.setColor(color)
    arrow.setLength(length, Math.min(length * 0.23, 0.3), Math.min(length * 0.11, 0.13))
    arrow.line.material.opacity = arrow.cone.material.opacity = opacity
  }

  function updateForces(system, options) {
    forceArrowCount = 0
    forcePairs = []; selectedVectors = null; pairLines.visible = false
    for (const arrow of arrows) arrow.visible = false
    if (!options.forceMode) return
    const bodies = system.bodies, selected = bodies.find(body => body.id === options.selectedId && body.active) || bodies.find(body => body.id === 'planet' && body.active)
    if (options.forceMode === 'acceleration' && selected) {
      const acceleration = accelerations(system)[bodies.indexOf(selected)], force = acceleration.map(value => value * selected.mass)
      const forceMagnitude = Math.hypot(...force), accelerationMagnitude = Math.hypot(...acceleration)
      // F and a have different units; each decade scale is exposed beside its value.
      const scale = magnitude => magnitude > 0 ? 0.28 / (10 ** Math.floor(Math.log10(magnitude))) : 0
      selectedVectors = { id: selected.id, force, acceleration, forceMagnitude, accelerationMagnitude, forceScale: scale(forceMagnitude), accelerationScale: scale(accelerationMagnitude) }
      const offset = visualRadius(selected) * 0.35
      showArrow(origin.fromArray(selected.position).addScaledVector(right, offset), vector.fromArray(force), forceMagnitude * selectedVectors.forceScale, 0xefc080)
      showArrow(origin.fromArray(selected.position).addScaledVector(right, -offset), vector.fromArray(acceleration), accelerationMagnitude * selectedVectors.accelerationScale, 0x92d9e5)
    } else if (options.forceMode === 'gravity') {
      const stars = bodies.filter(body => body.active && body.id !== 'planet')
      for (let i = 0; i < stars.length; i++) for (let j = i + 1; j < stars.length; j++) {
        const force = pairForce(stars[i], stars[j], system.G, system.softening)
        forcePairs.push({ ids: [stars[i].id, stars[j].id], force, magnitude: Math.hypot(...force) })
      }
      const maximum = Math.max(1e-30, ...forcePairs.map(pair => pair.magnitude))
      forcePairs.forEach((pair, index) => {
        const a = stars.find(body => body.id === pair.ids[0]), b = stars.find(body => body.id === pair.ids[1])
        const color = [0xd7cda0, 0xd9a18c, 0x9ebbd7][index], length = pair.magnitude / maximum * 2.8
        showArrow(origin.fromArray(a.position), vector.fromArray(pair.force), length, color)
        showArrow(origin.fromArray(b.position), vector.fromArray(pair.force).negate(), length, color)
        pairGeometry.attributes.position.array.set(a.position, index * 6)
        pairGeometry.attributes.position.array.set(b.position, index * 6 + 3)
      })
      pairGeometry.setDrawRange(0, forcePairs.length * 2)
      pairGeometry.attributes.position.needsUpdate = true
      pairLines.visible = forcePairs.length > 0
    } else if (options.forceMode === 'radiation') {
      const planet = bodies.find(body => body.id === 'planet' && body.active)
      if (!planet) return
      const sources = bodies.filter(body => body.active && body !== planet && body.luminosity > 0)
      const fluxes = sources.map(body => body.luminosity / Math.max(1e-12, vector.fromArray(body.position).distanceToSquared(origin.fromArray(planet.position))))
      const maximum = Math.max(1e-12, ...fluxes)
      sources.forEach((body, index) => {
        origin.fromArray(body.position)
        vector.fromArray(planet.position).sub(origin)
        const distance = vector.length()
        if (distance <= visualRadius(body) + visualRadius(planet)) return
        vector.divideScalar(distance); origin.addScaledVector(vector, visualRadius(body) * 1.1)
        showArrow(origin, vector, distance - visualRadius(body) * 1.1 - visualRadius(planet) * 1.1, COLORS[IDS.indexOf(body.id)], 0.12 + fluxes[index] / maximum * 0.73)
      })
    }
  }

  function render(system, options = {}) {
    if (disposed) return
    resize()
    for (const key of VISUAL_KEYS) {
      const value = options.visual?.[key]
      visual[key] = THREE.MathUtils.clamp(Number.isFinite(value) ? value : VISUAL_DEFAULTS[key], VISUAL_RANGES[key][0], VISUAL_RANGES[key][1])
    }
    fitBelt = options.fitBelt === true
    effects.flare.starId = IDS.slice(0, 3).includes(options.effects?.flare?.starId) ? options.effects.flare.starId : null
    effects.flare.strength = effects.flare.starId ? effectStrength(options.effects?.flare?.strength) : 0
    effects.dust = effectStrength(options.effects?.dust)
    effects.aurora = effectStrength(options.effects?.aurora)
    renderer.toneMappingExposure = visual.exposure
    nebula.material.uniforms.strength.value = visual.nebula
    farStars.geometry.setDrawRange(0, Math.floor(PARTICLE_CAPACITY.far * visual.particles / 2))
    nearStars.geometry.setDrawRange(0, Math.floor(PARTICLE_CAPACITY.near * visual.particles / 2))
    farStars.material.uniforms.gain.value = 0.8 + visual.particles * 0.2
    nearStars.material.uniforms.gain.value = 0.7 + visual.particles * 0.25
    bodyCount = 0; trailPointCount = 0
    const runningSeconds = Number.isFinite(options.runningSeconds) ? options.runningSeconds : 0
    lights.auroraStrength.value = effects.aurora
    lights.auroraTime.value = runningSeconds
    dustCount = Math.floor(DUST_CAPACITY * effects.dust / 2)
    const dustPosition = dust.points.geometry.attributes.position, dustColor = dust.points.geometry.attributes.color
    for (let i = 0; i < dustCount; i++) {
      const seed = i * 4, offset = i * 3
      const cycle = ((dust.seeds[seed] + runningSeconds * dust.seeds[seed + 3] * 0.018) % 1 + 1) % 1
      const fade = Math.sin(cycle * Math.PI) ** 2
      // Decorative wind is a fixed world-space volume, separate from physical bodies and their trails.
      dustPosition.array[offset] = cycle * 58 - 29
      dustPosition.array[offset + 1] = dust.seeds[seed + 1] + cycle * 4 - 2
      dustPosition.array[offset + 2] = dust.seeds[seed + 2]
      dustColor.array[offset] = fade * 0.55
      dustColor.array[offset + 1] = fade * 0.7
      dustColor.array[offset + 2] = fade * 0.8
    }
    dust.points.geometry.setDrawRange(0, dustCount)
    dustPosition.needsUpdate = dustColor.needsUpdate = true
    dust.points.material.uniforms.gain.value = effects.dust * 0.8
    farStars.rotation.z = runningSeconds * 0.00025
    nearStars.rotation.z = runningSeconds * -0.0005
    for (let i = 0; i < bodyObjects.length; i++) {
      const object = bodyObjects[i], body = system.bodies.find(value => value.id === object.id)
      object.group.visible = Boolean(body?.active)
      if (body?.active) {
        bodyCount++
        object.group.position.fromArray(body.position)
        object.group.scale.setScalar(visualRadius(body))
        object.surface.rotation.z = system.time * Math.PI / 10
        object.surface.material.uniforms.time.value = system.time
        if (i < 3) {
          const flare = object.id === effects.flare.starId ? effects.flare.strength : 0
          object.surface.material.uniforms.brightness.value = body.luminosity > 0 ? Math.min(1.7, 0.95 + Math.log1p(body.luminosity) * 0.24) : 0.025
          object.corona.material.uniforms.time.value = runningSeconds
          object.corona.material.uniforms.flareStrength.value = flare
          object.corona.material.uniforms.strength.value = (body.luminosity > 0 ? visual.bloom : 0) + flare
          object.corona.scale.setScalar(1.45 + flare * 0.2)
          const baseHalo = body.luminosity > 0 ? Math.min(0.58, (0.24 + Math.sqrt(body.luminosity) * 0.045) * visual.bloom) : 0
          object.halo.material.opacity = Math.min(0.78, baseHalo + flare * 0.18)
          object.flare.material.opacity = Math.min(0.48, object.halo.material.opacity * 0.2 + flare * 0.14)
          object.flare.scale.set(15 + flare * 7, 0.17 + flare * 0.17, 1)
        }
      }
      if (i < 3) {
        lights.starPositions.value[i].fromArray(body?.position || [0, 0, 0])
        lights.luminosities.value[i] = body?.active ? body.luminosity : 0
      }
      const trail = trails[i], records = options.trails?.[object.id] || []
      trail.line.material.uniforms.gain.value = 1 + visual.bloom * 0.32
      trail.particles.material.uniforms.pointSize.value = visual.trailWidth * 4
      trail.particles.material.uniforms.gain.value = visual.particles * (1 + visual.bloom * 0.4)
      let count = 0
      for (let n = Math.max(0, records.length - TRAIL_CAPACITY); n < records.length; n++) {
        const record = records[n], alpha = trailAlpha(Math.max(0, runningSeconds - record.time))
        if (alpha <= 0) continue
        trail.geometry.attributes.position.array.set(record.position, count * 3)
        trail.geometry.attributes.alpha.array[count++] = alpha
      }
      trail.geometry.setDrawRange(0, count)
      trail.geometry.attributes.position.needsUpdate = trail.geometry.attributes.alpha.needsUpdate = true
      trailPointCount += count
    }
    updateCamera(system.bodies, options)
    updateObservations(system, options)
    updateForces(system, options)
    renderer.render(scene, camera)
    frames++
    projections = {}
    for (const body of system.bodies) if (body.active) {
      vector.fromArray(body.position).project(camera)
      projections[body.id] = { x: (vector.x + 1) * width / 2, y: (1 - vector.y) * height / 2, visible: Math.abs(vector.x) < 1 && Math.abs(vector.y) < 1 && vector.z >= -1 && vector.z <= 1 }
    }
  }

  function diagnostics() {
    const cameraState = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() }
    const state = { available: !disposed, frames, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, camera: cameraState }
    return {
      ...state, width, height, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      bodyCount, trailPointCount, forceArrowCount, forcePairs, selectedVectors, currentView,
      cameraPosition: cameraState.position, target: target.toArray(), projections, renderer: state,
      visual: { ...visual },
      visualUniforms: {
        exposure: renderer.toneMappingExposure, nebula: nebula.material.uniforms.strength.value,
        stars: bodyObjects.slice(0, 3).map(object => ({ id: object.id, tint: `#${object.surface.material.uniforms.tint.value.getHexString()}`, brightness: object.surface.material.uniforms.brightness.value, coronaStrength: object.corona.material.uniforms.strength.value, haloOpacity: object.halo.material.opacity, displayRadius: object.group.scale.x })),
        trails: trails.map((trail, i) => ({ id: IDS[i], pointSize: trail.particles.material.uniforms.pointSize.value, gain: trail.particles.material.uniforms.gain.value, drawCount: trail.geometry.drawRange.count }))
      },
      particles: {
        allocated: { far: PARTICLE_CAPACITY.far, near: PARTICLE_CAPACITY.near, trailPerBody: TRAIL_CAPACITY },
        drawn: { far: farStars.geometry.drawRange.count, near: nearStars.geometry.drawRange.count, trails: trailPointCount }
      },
      effects: { flare: { ...effects.flare }, dust: effects.dust, aurora: effects.aurora },
      effectUniforms: {
        stars: bodyObjects.slice(0, 3).map(object => ({ id: object.id, flareStrength: object.corona.material.uniforms.flareStrength.value, coronaStrength: object.corona.material.uniforms.strength.value, haloOpacity: object.halo.material.opacity, flareOpacity: object.flare.material.opacity })),
        planetAurora: bodyObjects[3].surface.material.uniforms.auroraStrength.value,
        atmosphereAurora: bodyObjects[3].atmosphere.material.uniforms.auroraStrength.value,
        dustStrength: dust.points.material.uniforms.gain.value
      },
      dustParticles: { allocated: DUST_CAPACITY, active: dustCount, space: 'world', decorative: true, sample: Array.from(dust.points.geometry.attributes.position.array.subarray(0, Math.min(3, dustCount) * 3)) },
      fitBelt, beltIncludedInFit: fitBelt && currentView === 'station',
      beltCount, beltCapacity: PARTICLE_CAPACITY.belt,
      beltSample: Array.from(beltGeometry.attributes.position.array.subarray(0, Math.min(3, beltCount) * 3)),
      lagrangeProjections, lagrangeCount, lagrangeCapacity: 5, lagrangeGuideSegments: guideGeometry.drawRange.count / 2
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    const geometries = new Set(), materials = new Set()
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry)
      if (object.material) materials.add(object.material)
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    glow.dispose(); renderer.dispose(); scene.clear()
  }

  resize()
  return { render, resize, dispose, diagnostics }
}
