# Validation and build status

Latest local validation: Windows, 20 October 2026.

- JavaScript syntax checks and all 16 Node tests pass, including display-frame scheduling at 60/144 Hz, drag backpressure, pointer cancellation, and release cleanup.
- Real Electron desktop smoke test passes through a full restart. Exactly one transparent companion window appears immediately; a saved hidden state does not hide it on relaunch. Skin and roaming choices survive restart.
- The drag smoke test exercises actual renderer animation frames, preload IPC, and native window movement, substituting only the OS cursor source. The local Windows run measured approximately 62 native position updates/second on a 60 Hz display. Stationary cursors do not issue redundant native moves, release uses the final cursor position, and no movement continues after release.
- Native roaming, travel direction, Sit still, alpha hit testing, per-skin reactions, fixed sizing, and all 16 transparent sprite borders pass.
- Version tags build Windows installer/portable EXEs and both Mac architectures before publishing a GitHub Release with checksums. Empty signing secrets are unset rather than treated as certificate paths.

Build artifacts and test screenshots are ignored by Git. Automated movement rates do not establish visual smoothness on every compositor. Multi-monitor scaling, touchscreen hardware, and installer acceptance remain in the [native release checklist](RELEASING.md). Trusted publisher signing requires the owner's certificates and, for Mac, notarization credentials.
