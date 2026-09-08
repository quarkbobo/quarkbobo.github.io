// Keep the browser build local and tied to the package-lock version.
const fs = require('node:fs')
const path = require('node:path')
const target = path.resolve(__dirname, '../themes/fluid-particle/source/vendor/three')
const source = path.resolve(path.dirname(require.resolve('three')), '..')
fs.mkdirSync(target, { recursive: true })
for (const filename of ['three.module.min.js', 'three.core.min.js']) {
  fs.copyFileSync(path.join(source, 'build', filename), path.join(target, filename))
}
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE.txt'))
