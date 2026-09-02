const assert = require('node:assert/strict')
const test = require('node:test')

const { chromeCandidatesFor, windowSizeFor } = require('./browser-launch-policy.cjs')

test('Linux browser policy resolves standard GitHub runner Chrome paths without Windows sizing compensation', () => {
  const candidates = chromeCandidatesFor('linux', '')

  assert.deepEqual(candidates.slice(0, 4), [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ])
  assert.deepEqual(windowSizeFor({ width: 1024, height: 768 }, 'linux'), [1024, 768])
  assert.deepEqual(windowSizeFor({ width: 767, height: 900 }, 'win32'), [767, 900])
  assert.deepEqual(windowSizeFor({ width: 1024, height: 768 }, 'win32'), [1046, 768])
})
