const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const progress = (time, start, end) => clamp((time - start) / (end - start), 0, 1)
const smooth = value => value * value * value * (value * (value * 6 - 15) + 10)
export const ENTRY_DURATION = 2600
export const SCENE_SEAM = 1580
export const RETURN_DURATION = 720

export function entryFrame (time) {
  return {
    expansion: smooth(progress(time, 0, 560)),
    travel: progress(time, 180, SCENE_SEAM),
    veil: smooth(progress(time, 0, 560)),
    cloud: smooth(progress(time, 1050, 1510)) * (1 - smooth(progress(time, 1800, 2450))),
    drift: smooth(progress(time, 1050, 2450)),
    inside: time >= SCENE_SEAM,
    arrival: smooth(progress(time, SCENE_SEAM, ENTRY_DURATION)),
    hud: smooth(progress(time, 2140, ENTRY_DURATION)),
    complete: time >= ENTRY_DURATION
  }
}

export function returnFrame (time) {
  const collapse = smooth(progress(time, 300, RETURN_DURATION))
  return {
    collapse,
    veil: 1 - collapse,
    cloud: smooth(progress(time, 0, 220)) * (1 - smooth(progress(time, 300, 620))),
    drift: 1 - smooth(progress(time, 0, RETURN_DURATION)),
    retreat: smooth(progress(time, 0, 260)),
    outside: time >= 260,
    hud: 1 - smooth(progress(time, 0, 120)),
    complete: time >= RETURN_DURATION
  }
}

export function openingTransform (source, target) {
  return {
    x: source.left + source.width / 2 - target.left - target.width / 2,
    y: source.top + source.height / 2 - target.top - target.height / 2,
    scale: source.height / target.height * Math.tan(target.fov * Math.PI / 360) / Math.tan(source.fov * Math.PI / 360)
  }
}

export function constrainView (view) {
  return { yaw: view.yaw, pitch: clamp(view.pitch, -0.35, 0.85), radius: clamp(view.radius, 6, 14) }
}

export function orbitPosition (view) {
  const horizontal = Math.cos(view.pitch) * view.radius
  return [Math.sin(view.yaw) * horizontal, Math.sin(view.pitch) * view.radius, Math.cos(view.yaw) * horizontal]
}

export function approachPosition (progress) {
  const t = clamp(progress, 0, 1)
  const eased = t * t * (2 - t)
  return [0, 1 - eased * 0.98, 8 - eased * 7.8]
}

export function entryPosition (time, origin = [0, 1, 8]) {
  const frame = entryFrame(time)
  const position = approachPosition(frame.travel)
  const remaining = 1 - frame.expansion
  return position.map((value, index) => value + (origin[index] - [0, 1, 8][index]) * remaining)
}
