const { app, BrowserWindow, session, ipcMain, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')
const { ElectronBlocker } = require('@ghostery/adblocker-electron')
const { adsAndTrackingLists } = require('@ghostery/adblocker')

// 1. CRT Display & Density Fix
// Omarchy exports GDK_SCALE=2, causing Chromium to calculate a fractional
// deviceScaleFactor (~1.64) which shrinks a 720x480 window to a 439x293 viewport.
// Forcing scale factor 1 guarantees 1 CSS px = 1 physical screen scanline.
app.commandLine.appendSwitch('force-device-scale-factor', '1')

// Performance flags tuned for Intel HD 5000 / Haswell on Linux
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('disable-background-timer-throttling')

app.setName('YourTobaCRT')

const TV_URL = 'https://www.youtube.com/tv'
const BG_COLOR = '#000000'
const PARTITION = 'persist:yourtobacrt'

// Cobalt UA strings (validated from VacuumTube / youTOBA)
// Cobalt 19 for initial handshake, Cobalt 25 for ongoing navigation.
const TV_CLIENT_UA = `Mozilla/5.0 (PS4; Leanback Shell) Cobalt/19.lts.0-qa; compatible; YourTobaCRT/${app.getVersion()}`
const TV_UA = `Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; YourTobaCRT/${app.getVersion()}`

let mainWindow = null
let crtCssContent = ''
let isLetterbox = true // Default: 16:9 letterboxed inside 4:3 for accurate geometry

try {
  crtCssContent = fs.readFileSync(path.join(__dirname, 'crt-style.css'), 'utf-8')
} catch (err) {
  console.warn('Could not read crt-style.css:', err.message)
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

function applyCrtStyles() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  
  // Inject the base CRT stylesheet
  if (crtCssContent) {
    mainWindow.webContents.insertCSS(crtCssContent).catch(() => {})
  }

  // Apply or toggle letterbox mode class on <html>
  const script = isLetterbox 
    ? `document.documentElement.classList.add('crt-letterbox-16-9');`
    : `document.documentElement.classList.remove('crt-letterbox-16-9');`
  
  mainWindow.webContents.executeJavaScript(script).catch(() => {})
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 480,
    minWidth: 640,
    minHeight: 480,
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

  // Re-inject CRT styling whenever page finishes loading or navigates
  mainWindow.webContents.on('did-finish-load', applyCrtStyles)
  mainWindow.webContents.on('dom-ready', applyCrtStyles)

  // Cursor auto-hide logic: TV Leanback is couch/keyboard driven.
  // Hide pointer after 2.5s of inactivity.
  let cursorTimer = null
  mainWindow.webContents.on('cursor-changed', () => {
    // Chromium cursor events
  })

  // Handle hotkeys
  // F10: Toggle Aspect Ratio (Letterbox 16:9 vs 4:3 Full)
  // F11: Fullscreen toggle
  // Ctrl+Q / Escape (with confirmation or direct): Quit
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    if (input.key === 'F10') {
      isLetterbox = !isLetterbox
      applyCrtStyles()
      event.preventDefault()
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
      event.preventDefault()
    } else if ((input.control || input.meta) && input.key.toLowerCase() === 'q') {
      app.quit()
      event.preventDefault()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
