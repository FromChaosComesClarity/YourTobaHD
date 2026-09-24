# YourTobaCRT

An ultra-lightweight, dedicated native shell around **YouTube TV (Leanback)** engineered specifically for 4:3 CRT televisions driven via an **HDMI out → composite adapter → CRT TV (720×480i NTSC)** display chain.

Derived from [youTOBA](https://github.com/FromChaosComesClarity/youTOBA) and research from [OmaCRT](https://github.com/FromChaosComesClarity/OmaCRT).

---

## Why YourTobaCRT?

Standard browsers and Electron apps fail silently on analog CRT setups:
1. **Fractional Scaling Collapse**: Omarchy sets `GDK_SCALE=2` for high-DPI displays. Chromium detects this and derives a fractional scale factor (~1.64), silently crunching the 720×480 screen into an unusable 439×293 viewport. YourTobaCRT forces `force-device-scale-factor=1`, ensuring 1 CSS pixel equals 1 physical scanline.
2. **Aspect Ratio Distortion (16:9 on 4:3)**: YouTube TV is designed for 16:9 widescreen. Squeezed full-frame onto a 4:3 CRT tube, circles become tall ovals and video is vertically elongated by 33%. YourTobaCRT defaults to a 16:9 letterbox (360 active lines centered in 480 lines), maintaining exact geometry.
3. **Bezel Overscan**: Consumer CRT televisions cut off 5% to 7% of the raster behind the cabinet bezel. Injected safe-area padding ensures the navigation guide, search bar, and scrubbers stay visible.
4. **480i Interlace Twitter**: 1px horizontal lines flicker violently at 30Hz on interlaced composite video. YourTobaCRT enforces 3px minimum focus outlines and tones down pure saturated red chroma bleed.
5. **Ultra-Low Memory Footprint**: Running on a Mac Mini (late 2014, dual-core Haswell, 4 GB RAM), every megabyte counts. All desktop UI chrome, dual-view WebContents, and heavy downloader runtimes (`ffmpeg-static`, `yt-dlp`) have been eliminated.

---

## Features

- **Leanback Only**: Launches directly into `youtube.com/tv` using the validated PS4 Cobalt handshake.
- **Ads Stripped at the Source**:
  - Network-level ad/tracker blocking via `@ghostery/adblocker-electron` (cosmetic filters disabled to prevent YouTube DOM crashes).
  - Direct Innertube JSON response-stripping in `preload.js` so ads are purged before the player can even register them.
- **Couch-Friendly**:
  - Auto-hides mouse cursor after 2.5 seconds of inactivity.
  - Native arrow keys, `Enter` (select), `Escape`/`Backspace` (back), and `Space` (play/pause).
- **Controls & Hotkeys**:
  - `F10` — Toggle Aspect Ratio: **16:9 Letterbox** (accurate video geometry) ↔ **4:3 Full Stretch** (fills the entire tube).
  - `F11` — Toggle Fullscreen.
  - `Ctrl + Q` — Quit cleanly.

---

## Hardware Target Profile

- **Device**: Mac Mini (Macmini7,1, late-2014)
- **CPU**: Intel Core i5-4260U (Haswell-ULT, 2C/4T @ 1.4 GHz)
- **RAM**: 4 GB
- **GPU**: Intel HD Graphics 5000 (`i915`)
- **OS**: Omarchy / Arch Linux (Hyprland)
- **Output**: HDMI out → composite adapter → CRT TV (720×480i)

---

## Building the AppImage

```bash
# Install dependencies
npm install

# Run unpacked in development mode
npm run dev

# Package standalone Linux AppImage into dist/
npm run dist
```

The resulting `YourTobaCRT.AppImage` in `dist/` is completely standalone and ready to be transferred to the target CRT machine.

---

## License

GPL-3.0 (matching OmaCRT, Clarity, and EmuLatte).
