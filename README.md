# Miso

A little ghost. A good little friend.

Miso is a desktop companion for **Windows and macOS** built with Electron. Open the app and the ghost cat appears immediately on your desktop. There is no launcher or startup screen. It wanders, reacts to pets, plays, and naps. Everything runs locally, with no account, API key, or internet connection needed after installation.

## Install

Get the latest downloads from **[GitHub Releases](https://github.com/Adventnl/desktop-companion/releases/latest)**. No source code, Node.js, or terminal needed.

- **Windows, download and run:** choose `Miso-<version>-Windows-Portable.exe`, which selects the right version for your PC. Smaller `Portable-x64.exe` and `Portable-arm64.exe` downloads are also available. Double-click the downloaded EXE and the cat appears. No installation needed.
- **Windows, install once:** choose `Miso-<version>-Windows-Setup.exe`. The one-click installer selects x64 or ARM64, installs for your user without administrator access, and launches the cat. Open the desktop shortcut on later visits. Uninstall from Windows Settings > Apps.
- **Mac:** choose `Miso-<version>-mac-arm64.dmg` for Apple silicon, or `Miso-<version>-mac-x64.dmg` for Intel. Open the DMG, drag Miso into Applications, eject the disk image, then open Miso. A ZIP of the app is also available. To remove it, quit Miso and move the application to Trash.

Current downloads are unsigned on Windows and ad-hoc signed on Mac. Windows may show an unknown-publisher prompt; macOS may block the app because it is not Developer ID signed and notarized. The release notes describe signing status. [Maintainer release instructions](docs/RELEASING.md).

### Mac: “Apple could not verify Miso is free of malware”

This is macOS Gatekeeper blocking an app whose developer identity and notarization it cannot verify. If you downloaded Miso from this project's [GitHub Releases](https://github.com/Adventnl/desktop-companion/releases/latest) and trust that copy:

1. Drag Miso into **Applications** and try opening it once.
2. Click **Done** in the warning.
3. Open **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway** beside the message about Miso.
4. Confirm **Open** and authenticate if prompted. Later launches can open normally.

This creates an exception for Miso. See [Apple's instructions](https://support.apple.com/en-us/102445). Removing the warning for new downloads requires a new release signed with a Developer ID Application certificate and notarized by Apple.

## A little company

| Do this | Miso does this |
| --- | --- |
| Click / tap the cat | Shows a little love (or wakes up) |
| Drag the cat | Moves to your favorite corner |
| Right-click the cat | Opens actions: Sit still / Wander around, Change skin, Play, and Take a nap |
| Click the tray / menu bar icon | Shows Miso |
| `Ctrl+Shift+M` / `⌘⇧M` | Recalls Miso to your cursor |

There is no dashboard or wardrobe window. Opening the app, including opening it again while it is running, shows the cat directly. Right-click **Change skin** to choose Just Miso, Witch hat, Pumpkin, or Cardboard box. The chosen skin stays on while petting, playing, walking, and sleeping. All sprites share a fixed canvas and scale; clicking never resizes the pet. Choose **Quit Miso** from the right-click or tray menu to exit. Some Windows tray icons are under the overflow arrow.

Transparent parts of the pet window pass clicks through to the desktop. Hovering the cat pauses roaming so it is easy to catch. Dragging follows display refresh frames independently of the behavior loop, samples the current system cursor, and never queues stale moves. **Sit still** stops roaming until you choose **Wander around**. The cat also pauses while its right-click menu is open. Miso stays within display work areas, avoiding the dock and taskbar, and occasionally visits another connected screen. On monitor removal or wake from sleep, its position is brought back onto an available display.

The overlay sits above normal applications. Operating-system security prompts, the lock screen, some exclusive fullscreen games, and certain fullscreen apps can appear above it. No Accessibility, screen recording, or administrator permissions are needed for normal features. Touch works through ordinary pointer events on supported touch displays; macOS normally uses a mouse or trackpad.

## Develop

Use the existing checkout in each isolated cloud task; a Git worktree is unnecessary.

Install **Node.js 24 LTS or newer**, then:

```sh
npm ci
npm start
```

`npm ci` installs the pinned Electron runtime (including its verified native binary) and packaging tools. No frontend build server or backend is needed. Start the app in a native desktop session. Launch at login is available only in the packaged Windows or Mac app and is off by default.

```sh
npm run check          # JavaScript syntax
npm test               # Movement, monitor bounds, settings, and pose rules
npm run test:desktop   # Real Electron windows, UI/IPC, roaming, restart persistence
npm run pack           # Package an unpacked app for the current host
npm run dist:win       # Windows installers (run on Windows)
npm run dist:portable  # Windows portable executable, no installation needed
npm run dist:mac       # Apple silicon + Intel DMG and ZIP (run on macOS)
```

Build outputs go into `dist/`. Desktop test screenshots go into `test-results/`. Desktop tests use a temporary preference directory and do not change normal settings. On headless Linux, a running X server such as Xvfb is required. The optional `MISO_TEST_NO_SANDBOX=1` flag is only for disposable Linux test containers that cannot enable the Chromium sandbox; normal launches and packaged builds retain the sandbox.

The portable Windows build can be launched directly without installation. Launch at login is disabled in portable mode because the app is unpacked to a temporary location each time. A Mac ZIP contains `Miso.app`, which can be copied to Applications. Unsigned builds still require a trusted publisher for frictionless installation; the archives produced on Linux are development artifacts, not signed releases.

In a cloud machine with a read-only home directory, use writable `XDG_CACHE_HOME` and `XDG_CONFIG_HOME` paths under `/workspace` for development. If the environment uses an HTTPS proxy, Node 24 can use it with `NODE_USE_ENV_PROXY=1` during installation. Keep TLS and artifact checksum verification enabled.

## Inside the app

- `src/main.js` owns native windows, the tray, settings, per-pixel mouse pass-through, multi-display movement, and IPC validation.
- `src/core.js` contains pure movement, settings, and sprite-selection rules.
- `src/preload.js` exposes a small API to sandboxed, isolated renderers. Node integration is disabled and pages enforce a restrictive content security policy.
- `src/renderer/` contains the transparent companion. No remote content, analytics, or external fonts are loaded.
- `assets/cat/pixel/` contains the active pixel artwork: 16 redrawn 50 × 50 sprites with a fixed 12-color palette, binary transparency, clean charcoal outlines, and clear margins. Walking frames face right in the source; the renderer mirrors them for leftward travel. All four skins have two walking frames and a sleeping pose with closed eyes. The renderer uses nearest-neighbor scaling to keep the pixels crisp.
- `assets/cat/` retains the original supplied PNGs for provenance. Rebuild the active pixel frames with `node_modules/.bin/electron scripts/prepare-pixel-sprites.cjs`; the script slices the regenerated atlas and normalizes its palette, alpha, and outlines. [Generation prompt and provenance](assets/cat/pixel/GENERATION.md) are included. `assets/cat/hd/` retains the previous smooth artwork and its provenance, but is not used by the companion.

Preferences are saved atomically in `settings.json` under Electron’s per-user app data directory (`%APPDATA%/Miso` on Windows, `~/Library/Application Support/Miso` on macOS). No application or activity data is transmitted. Provenance notes from the supplied archive are retained in `assets/ASSET-NOTES.txt`.

## Verification status

The CI workflow runs the Node tests and Electron desktop smoke test on native Windows and macOS runners. Version tags automatically publish installers, portable apps, Mac downloads, and SHA-256 checksums to GitHub Releases after both builds pass. A Linux cloud smoke test verifies the shared implementation and transparent window captures; it cannot establish macOS Spaces behavior, Windows touch hardware, native installer behavior, signing, or notarization. Perform the native checklist in [RELEASING.md](docs/RELEASING.md) before distributing a release.
