# Building and distributing Miso

## Make the installers

The **Test and build desktop apps** workflow tests and builds on native Windows and macOS runners. It produces:

- A combined Windows x64/ARM64 one-click installer (`Windows-Setup.exe`), which launches Miso after installation.
- A combined Windows portable EXE, plus smaller x64 and ARM64 versions, which open the cat without installation.
- Apple silicon and Intel disk images (`.dmg`) and app archives (`.zip`).

Push a version tag matching `package.json` (for example `v1.0.3`) to publish a release automatically. Bump the version and lockfile before the next release. Tag the commit containing the intended code and artwork; ordinary pushes do not update existing release downloads. Both platform jobs must pass before the release job runs. For every architecture, the `afterPack` hook checks the version and compares every packaged source and asset file byte-for-byte with that commit's checkout, including the active pixel sprites. A missing or stale file fails the build before installers or archives are created. The release job verifies all eight expected downloads, generates `SHA256SUMS.txt`, uploads to a draft release, and only then publishes it as the latest release. The workflow refuses to overwrite an already published release. A failed unpublished draft can be retried by rerunning the workflow.

Ordinary pushes, pull requests, and manual workflow runs only upload Actions artifacts. End users download from [Releases](https://github.com/Adventnl/desktop-companion/releases/latest), without visiting Actions or the source code. Release notes distinguish the portable EXEs, installer, and Mac architectures and state whether signing credentials were available.

Local builds require Node 24+ and `npm ci`. Use `npm run dist:win -- --publish never` on Windows or `npm run dist:mac -- --publish never` on macOS. Apple’s tooling and notarization require macOS. Use native runners to avoid Wine and cross-compilation limitations.

## Signing

Development builds are useful for private testing. Without certificates, the native workflow makes unsigned Windows builds and ad-hoc signed Mac builds (with hardened runtime disabled for those test builds). Ad-hoc signing lets the altered Mac executable run on Apple silicon; it does not establish a trusted publisher identity or provide notarization. The Mac archives cross-built on Linux have no signing applied and should be replaced with native builds before distribution. A smooth public installation needs a trusted publisher identity. Store signing material as GitHub Actions secrets, never in the repository.

For macOS, add:

| Secret | Purpose |
| --- | --- |
| `MAC_CERTIFICATE` | Base64-encoded Developer ID Application certificate (`.p12`) |
| `MAC_CERTIFICATE_PASSWORD` | Password for that certificate |
| `APPLE_ID` | Apple developer account for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple developer team identifier |

The workflow passes the certificate to electron-builder using `CSC_LINK` and `CSC_KEY_PASSWORD` and requires signing to succeed when a certificate is supplied. electron-builder automatically notarizes a signed macOS build when the complete Apple credential set is present. Hardened runtime and the V8 JIT entitlement are configured for signed distribution builds. Confirm notarization in the build log, then verify the downloaded application:

```sh
codesign --verify --deep --strict --verbose=2 /Applications/Miso.app
spctl --assess --type execute --verbose=2 /Applications/Miso.app
xcrun stapler validate /Applications/Miso.app
```

If users see “Apple could not verify Miso is free of malware,” check that all five Mac secrets above were configured for that release. A successful build with ad-hoc signing does not pass Gatekeeper verification. Use a Developer ID Application certificate from an Apple Developer Program account; an ad-hoc or Mac App Store certificate is not a substitute. After configuring the secrets, publish a new version and complete the signature, Gatekeeper, and stapling checks above on the downloaded app. Existing downloads do not become signed or notarized when secrets are added.

Until a signed and notarized release is available, the README and release notes explain Apple's **Privacy & Security → Open Anyway** exception for users who trust their download. [Apple's explanation and opening instructions](https://support.apple.com/en-us/102445).

For Windows, add `WIN_CERTIFICATE` (base64 `.p12`) and `WIN_CERTIFICATE_PASSWORD`. The workflow passes them to electron-builder. Your certificate provider may require hardware-backed or cloud signing; configure electron-builder’s supported integration separately for that provider. A new signed Windows application can still receive SmartScreen reputation prompts.

Do not treat an unsigned artifact as signed or publish a Mac app if notarization failed. No signing material or developer credentials are included with this project.

## Native release checklist

On a clean Windows PC and a Mac, install the matching architecture and verify:

1. The portable EXE opens the transparent cat immediately above ordinary applications. The Windows installer completes and starts the cat automatically. Opening a shortcut, the Mac app, or a second copy also shows the cat directly; no launcher opens. Restart after hiding Miso and confirm it is visible again.
2. Click/tap reacts; holding and dragging tracks the cursor smoothly, stops exactly on release, and does not generate a click reaction when cancelled; transparent areas let desktop clicks through. Double-clicking never opens the old dashboard. Right-click opens the actions menu and pauses wandering until it closes.
3. Test all four skins through petting, play, sleep/wake, and walking. The skin stays selected, the body scale remains consistent, and walking faces the travel direction. **Sit still** stops roaming; **Wander around** resumes it. Skin and roaming choices persist after restarting.
4. With the cat hidden, the tray and `Ctrl+Shift+M` / `⌘⇧M` can recover it. If another app owns the shortcut, the tray still works.
5. Try multiple monitors, including negative coordinates, different scale factors, and unplugging a monitor. Try macOS Spaces and fullscreen apps. Document platform-specific overlay limitations.
6. If migrating from a version with launch at login enabled, verify the existing background startup works. Confirm old size/click-through settings no longer make the cat change size or become inaccessible.
7. Verify signatures, macOS notarization, and installer provenance. Uninstall and confirm the app and shortcuts are removed. Preferences are retained on Windows for reinstalls; they can be removed from the documented user data folder.

The cloud machine cannot replace this native acceptance check. The automated smoke test exercises real Electron windows, UI actions, movement, transparency, and persistence, but does not simulate a complete desktop compositor or installer session.
