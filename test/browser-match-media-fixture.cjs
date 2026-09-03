function installFinePointerMatchMedia (root) {
  const nativeMatchMedia = root.matchMedia.bind(root)
  const inputCapabilities = new Map([
    ['(pointer: coarse)', false],
    ['(pointer: fine)', true],
    ['(hover: hover)', true],
    ['(hover: none)', false]
  ])

  root.matchMedia = function (query) {
    const normalizedQuery = String(query).trim().replace(/\s+/g, ' ').toLowerCase()
    const nativeResult = nativeMatchMedia(query)

    if (!inputCapabilities.has(normalizedQuery)) return nativeResult

    const matches = inputCapabilities.get(normalizedQuery)
    return new Proxy(nativeResult, {
      get (target, property) {
        if (property === 'matches') return matches
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
      set (target, property, value) {
        return Reflect.set(target, property, value, target)
      }
    })
  }
}

function finePointerMatchMediaFixtureScript () {
  return `(${installFinePointerMatchMedia.toString()})(window);`
}

module.exports = { finePointerMatchMediaFixtureScript, installFinePointerMatchMedia }
