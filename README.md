# YourTobaHD

A lightweight, dedicated native shell around **YouTube TV (Leanback)** for modern 16:9 televisions — 1080p and 4K, over HDMI.

Forked from [YourTobaCRT](https://github.com/FromChaosComesClarity/YourTobaCRT), which does the same job for a 4:3 tube at 720×480i. Derived from [youTOBA](https://github.com/FromChaosComesClarity/youTOBA). Made to sit on the home screen of [OMATVLauncher](https://github.com/FromChaosComesClarity/OMATVLauncher): drop the AppImage in `~/Applications` and it is a tile.

---

## From CRT to HD

YourTobaCRT spent most of its code correcting for the screen. A modern TV is the screen Leanback was designed for, so most of that comes out, and one thing turns around:

1. **Native panel pixels (kept, for the opposite reason)**: a TV's own YouTube app reports the panel itself — 1920×1080 or 3840×2160 at a device scale of 1 — and Leanback scales its interface to that. A desktop compositor scales instead: Hyprland at 1.5 or 2 hands Leanback 1280×720 or 1920×1080 and it lays out for the smaller screen. YourTobaCRT's `force-device-scale-factor=1` still covers X11/XWayland, but under native Wayland the compositor's scale wins, so YourTobaHD measures the page's real `devicePixelRatio` and zooms by its inverse. Verified on a 1080p panel at Hyprland scale 1.5: Leanback gets 1920×1080 at a device scale of 1, and looks exactly the same size.
2. **No letterbox**: the panel *is* 16:9. The 4:3 letterbox and stretch modes are gone.
3. **Overscan off by default**: with the TV set to "Just Scan" / "Screen Fit" / "Original", an HDMI picture is shown 1:1 and needs no safe area. For sets that crop anyway, `F10` draws the interface at the broadcast title-safe size instead, and remembers that for this machine.
4. **No interlace or composite workarounds**: the 3px focus floor and the desaturated reds were for 480i twitter and NTSC colour bleed. Progressive HDMI has neither.
5. **Hardware video decode**: VA-API decoding is requested (Intel, AMD), so a long 4K stream does not run on the CPU. Chromium falls back to software where it is unavailable.

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
  - `F10` — Toggle overscan compensation, for TVs that crop the picture (remembered).
  - `F11` — Toggle Fullscreen.
  - `Ctrl + Q` — Quit cleanly.

---

## Target

- **Display**: any 16:9 TV over HDMI, 1080p or 4K
- **OS**: Omarchy / Arch Linux (Hyprland)
- **Home screen**: [OMATVLauncher](https://github.com/FromChaosComesClarity/OMATVLauncher) (optional)

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

The resulting `YourTobaHD.AppImage` in `dist/` is completely standalone. Put it in `~/Applications` and OMATVLauncher lists it.

---

## License

GPL-3.0 (matching YourTobaCRT, OmaCRT, Clarity, and EmuLatte).
