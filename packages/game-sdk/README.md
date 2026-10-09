# GameHub Game SDK

Versioned TypeScript contracts used by GameHub and its trusted game packages.
Game packages depend on this package instead of importing GameHub's private
server source.

This package is reusable GameHub platform infrastructure, not a playable game.
It lives under `packages/` and remains owned by the GameHub repository when
individual games move into their own repositories. Egyptian War and future
games consume an exact SDK release from the public npm registry.

The SDK defines package manifests, authoritative `GameSession` lifecycle
hooks, viewer-safe state and event envelopes, and browser-module platform
services. GameHub treats installed packages as trusted code and does not expose
its private room implementation through these contracts.

## Releasing

The package is configured for public npm publication. From the repository
root, first update its semantic version and verify the full suite, then run:

```powershell
npm publish --workspace @gamehub/game-sdk
```

Publishing requires npm access to the `@gamehub` scope. Game packages should
pin a released SDK version so their supported GameHub API is reproducible.
