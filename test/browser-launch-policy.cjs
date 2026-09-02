const WINDOWS_HEADLESS_OUTER_FRAME_WIDTH = 22

const WINDOWS_BROWSER_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
]

const LINUX_BROWSER_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/google/chrome/google-chrome'
]

function chromeCandidatesFor (platform = process.platform, envPath = process.env.CHROME_PATH) {
  const platformPaths = platform === 'win32' ? WINDOWS_BROWSER_PATHS : LINUX_BROWSER_PATHS
  return [envPath, ...platformPaths].filter(Boolean)
}

function windowSizeFor (viewport, platform = process.platform) {
  const outerWidth = platform === 'win32' && viewport.width >= 768
    ? viewport.width + WINDOWS_HEADLESS_OUTER_FRAME_WIDTH
    : viewport.width
  return [outerWidth, viewport.height]
}

module.exports = { chromeCandidatesFor, windowSizeFor }
