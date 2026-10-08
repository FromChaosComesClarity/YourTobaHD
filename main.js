const { app, BrowserWindow, session, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const { ElectronBlocker } = require('@ghostery/adblocker-electron')
const { adsAndTrackingLists } = require('@ghostery/adblocker')

// 1. Native panel pixels
// Leanback is built for a TV's Cobalt, which reports the panel itself as the
// viewport at a device scale of 1: 1920x1080 on a 1080p set, 3840x2160 on a 4K
// one. Leanback scales its own interface to that and sizes playback by it.
// A desktop compositor scales instead — Hyprland at 1.5 or 2 on a TV — and then
// Leanback sees 1280x720 or 1920x1080 and lays out for the smaller screen.
//
// Two layers, because neither covers every session:
//  - force-device-scale-factor=1 is what YourTobaCRT used, and it holds where
//    Chromium owns the scale (X11/XWayland, GDK_SCALE).
//  - ⚠️ Under native Wayland the compositor's scale wins and that switch is
//    ignored (verified: Hyprland at 1.5 still gave a 1280x720 viewport at
//    dpr 1.5). There the page is zoomed by 1/scale instead, which hands
//    Leanback the panel's real pixels at dpr 1 — see matchPanelPixels().
app.commandLine.appendSwitch('force-device-scale-factor', '1')

// 2. Video decode in hardware where the machine has it (VA-API: Intel, AMD).
// A long 4K stream decoded on the CPU is the difference between a quiet box and
// a fan. Chromium falls back to software on its own where VA-API is missing.
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoDecodeLinuxGL,AcceleratedVideoDecodeLinuxGL')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('disable-background-timer-throttling')

app.setName('YourTobaHD')

const TV_URL = 'https://www.youtube.com/tv'
const BG_COLOR = '#000000'
const PARTITION = 'persist:yourtobahd'

// Cobalt UA strings (validated from VacuumTube / youTOBA)
// Cobalt 19 for initial handshake, Cobalt 25 for ongoing navigation.
const TV_CLIENT_UA = `Mozilla/5.0 (PS4; Leanback Shell) Cobalt/19.lts.0-qa; compatible; YourTobaHD/${app.getVersion()}`
const TV_UA = `Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; YourTobaHD/${app.getVersion()}`

let mainWindow = null
let hdCssContent = ''

// The one setting worth remembering between runs: whether this TV crops the
// picture. Decided once per set, with F10, and then left alone.
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')
let settings = { overscan: false }

function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) } } catch {}
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + '\n')
  } catch (err) {
    console.warn('Could not save settings:', err.message)
  }
}

try {
  hdCssContent = fs.readFileSync(path.join(__dirname, 'hd-style.css'), 'utf-8')
} catch (err) {
  console.warn('Could not read hd-style.css:', err.message)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// Zoom so that one CSS pixel is one panel pixel, whatever the compositor's
// scale. Recomputed on every load and whenever the window changes display or
// the display changes scale, since a TV plugged in later is a different screen.
//
// ⚠️ Measured from the page, not from Electron's `screen`: with
// force-device-scale-factor set, `screen` reports a scale of 1 even while the
// Wayland surface renders at 1.5 (verified). devicePixelRatio is what the page
// actually gets, and it is the product of the real scale and the zoom.
//
// ⚠️ Idempotent by construction: the device scale is dpr ÷ the current zoom, so
// the target zoom is the same however many times this runs. Load, dom-ready,
// resize and display changes all call it, often together; dividing the zoom by
// dpr each time compounded (verified: it ran away to 0.23). Calls are debounced,
// and a measurement waits for the page to have redrawn at the last zoom.
let panelTimer = null
let panelSettling = false
function matchPanelPixels() {
  clearTimeout(panelTimer)
  panelTimer = setTimeout(measurePanelPixels, 250)
}

async function measurePanelPixels() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (panelSettling) { matchPanelPixels(); return }
  const wc = mainWindow.webContents
  const zoom = wc.getZoomFactor()
  let dpr
  try { dpr = await wc.executeJavaScript('window.devicePixelRatio') } catch { return }
  if (!dpr) return
  const target = 1 / (dpr / zoom)
  if (Math.abs(zoom - target) < 0.001) return
  panelSettling = true
  wc.setZoomFactor(target)
  setTimeout(() => { panelSettling = false }, 600)
}

function applyHdStyles() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  matchPanelPixels()

  if (hdCssContent) {
    mainWindow.webContents.insertCSS(hdCssContent).catch(() => {})
  }

  const script = settings.overscan
    ? `document.documentElement.classList.add('hd-overscan');`
    : `document.documentElement.classList.remove('hd-overscan');`

  mainWindow.webContents.executeJavaScript(script).catch(() => {})
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: BG_COLOR,
    show: false,
    webPreferences: {
      partition: PARTITION,
      // contextIsolation: false is required so preload.js can patch window.fetch/JSON.parse
      // and Innertube globals directly in page context.
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: ['--youtoba-tv']
    }
  })

  // Prevent navigation away from YouTube TV (keep popups/links contained)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.webContents.setUserAgent(TV_UA)
  mainWindow.webContents.loadURL(TV_URL, { userAgent: TV_CLIENT_UA })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Re-inject styling whenever page finishes loading or navigates
  mainWindow.webContents.on('did-finish-load', applyHdStyles)
  mainWindow.webContents.on('dom-ready', applyHdStyles)

  // Hotkeys
  // F10: Toggle overscan compensation (for TVs that crop the HDMI picture)
  // F11: Fullscreen toggle
  // Ctrl+Q: Quit
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    if (input.key === 'F10') {
      settings.overscan = !settings.overscan
      saveSettings()
      applyHdStyles()
      event.preventDefault()
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
    } else if ((input.control || input.meta) && input.key.toLowerCase() === 'q') {
      app.quit()
      event.preventDefault()
    }
  })

  mainWindow.on('move', matchPanelPixels)
  mainWindow.on('resize', matchPanelPixels)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  loadSettings()
  const ses = session.fromPartition(PARTITION)

  // Permission handling: deny microphone/camera/notifications for lean security
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(false)
  })

  // Setup Ad Blocking:
  // Ghostery network-level ad/tracker blocking. Cosmetic filtering is disabled
  // (loadCosmeticFilters: false) because it crashes YouTube template rendering.
  try {
    const blocker = await ElectronBlocker.fromLists(fetch, adsAndTrackingLists, {
      loadCosmeticFilters: false
    })
    blocker.enableBlockingInSession(ses)
  } catch (err) {
    console.error('Failed to initialize ElectronBlocker:', err)
  }

  createWindow()
  screen.on('display-metrics-changed', matchPanelPixels)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
