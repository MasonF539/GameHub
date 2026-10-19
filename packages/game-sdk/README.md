# GameHub Game SDK

Versioned TypeScript contracts used by GameHub and its trusted game packages.
Game packages depend on this package instead of importing GameHub's private
server source.

This package is reusable GameHub platform infrastructure, not a playable game.
It lives under `packages/` and remains owned by the GameHub repository when
individual games move into their own repositories. Egyptian War and future
games consume an exact SDK release from the public npm registry.

The SDK defines package manifests, authoritative `GameSession` lifecycle
hooks, viewer-safe state and event envelopes, browser-module platform
services, and optional named keybind actions. A game declares stable action
IDs and defaults; GameHub owns the remapping UI, local persistence, and input
routing through `GameClientContext.input`. GameHub treats installed packages
as trusted code and does not expose its private room implementation through
these contracts.

Keybind defaults are validated `KeyboardEvent.code` values. Letters, numbers,
arrows, Space, Enter, Escape, punctuation, and ordinary numpad keys are
assignable; Tab, function keys, and standalone modifiers are reserved by the
platform. Games must subscribe only to action IDs declared in their manifest.

## Releasing

The package is configured for public npm publication. From the repository
root, first update its semantic version and verify the full suite, then run:

```powershell
npm publish --workspace @masonf539/game-sdk --tag beta
```

Use the beta tag for prereleases so the stable npm tag stays unchanged.
Publishing requires npm access to the `@masonf539` scope. Games declare compatible
SDK peer ranges, including an explicit prerelease range when testing an SDK beta,
so the game and host share one installation. Pin the development dependency to
the SDK release used for builds and tests.
