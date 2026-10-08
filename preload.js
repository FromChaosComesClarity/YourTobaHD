// YourTobaHD Preload Script
// Ad-stripping at the innertube JSON level before the Leanback player or feed receives it.
// Derived from VacuumTube (MIT) and youTOBA.

const AD_OBJECT_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams']
const AD_RENDERER_KEYS = [
  'adSlotRenderer',
  'promotedSparklesWebRenderer',
  'promotedVideoRenderer',
  'displayAdRenderer',
  'carouselAdRenderer',
  'compactPromotedVideoRenderer',
  'inFeedAdLayoutRenderer',
  'adBadgeRenderer'
]
const MAX_DEPTH = 14

function isAdEntry(item) {
  if (!item || typeof item !== 'object') return false
  if (AD_RENDERER_KEYS.some((key) => key in item)) return true
  if (item.command?.reelWatchEndpoint?.adClientParams?.isAd) return true
  return false
}

function stripAds(node, depth = 0) {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return node

  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      if (isAdEntry(node[i])) {
        node.splice(i, 1)
      } else {
        stripAds(node[i], depth + 1)
      }
    }
    return node
  }

  for (const key of Object.keys(node)) {
    if (AD_OBJECT_KEYS.includes(key)) {
      node[key] = []
      continue
    }
    stripAds(node[key], depth + 1)
  }
  return node
}

// Intercept YouTube's initial global data assignments (ytInitialData, ytInitialPlayerResponse)
function guardInitialGlobal(name) {
  let value
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get() {
        return value
      },
      set(v) {
        try {
          value = stripAds(v)
        } catch {
          value = v
        }
      }
    })
  } catch {
    // Already defined by page
  }
}

guardInitialGlobal('ytInitialData')
guardInitialGlobal('ytInitialPlayerResponse')

// Persistent JSON.parse override for Leanback SPA navigation
const originalJSONParse = JSON.parse
JSON.parse = function (...args) {
  const result = originalJSONParse.apply(this, args)
  if (result && typeof result === 'object') {
    try {
      return stripAds(result)
    } catch {
      return result
    }
  }
  return result
}

// Persistent window.fetch override for Innertube video player & browse endpoints
const AD_BEARING_ENDPOINTS = ['/youtubei/v1/player', '/youtubei/v1/browse', '/youtubei/v1/search', '/youtubei/v1/next']
const FETCH_PATCH_TIMEOUT_MS = 4000

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })

const originalFetch = window.fetch.bind(window)
window.fetch = async function (...args) {
  const response = await originalFetch(...args)
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
  if (!AD_BEARING_ENDPOINTS.some((endpoint) => url.includes(endpoint))) return response

  try {
    const text = await withTimeout(response.clone().text(), FETCH_PATCH_TIMEOUT_MS)
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return response
    }
    const stripped = stripAds(json)
    const body = JSON.stringify(stripped)

    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  } catch {
    return response
  }
}

// Couch / TV auto-hide mouse cursor after 2.5s of no movement
let cursorTimeout
window.addEventListener('mousemove', () => {
  document.documentElement.style.cursor = 'default'
  clearTimeout(cursorTimeout)
  cursorTimeout = setTimeout(() => {
    document.documentElement.style.cursor = 'none'
  }, 2500)
}, { passive: true })
