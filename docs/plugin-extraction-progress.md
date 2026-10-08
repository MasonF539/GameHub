# Plugin Extraction Progress

This file records the migration from an embedded Egyptian War implementation
to an independently versioned GameHub plugin.

## Completed

- Created independently buildable `@gamehub/game-sdk` and
  `@gamehub/egyptian-war` npm workspaces.
- Replaced private source imports with package-name imports.
- Moved Egyptian War engine code, tests, design notes, preview media, music,
  effects, HTML markup, and CSS into `games/egyptian-war`.
- Added a generic browser game-client host and generic Socket.IO envelopes.
- Added a transitional server `GameSession` adapter.
- Made picker previews manifest-driven.
- Let game packages register their own music and effects.
- Made `#game-root` the actual browser host root.
- Added startup validation and integration coverage for package markup
  injection.
- Made the root `check` command type-check every workspace.
- Added `GAMEHUB_GAME_PACKAGES` configuration and manifest-driven loading for
  package markup, styles, scripts, definitions, and static public routes.
- Moved the complete Egyptian War browser controller into the game package,
  including rendering, animations, controls, chat, spectators, and audio.
- Extended the SDK browser context with generic platform services for pause,
  chat, member removal, notifications, and host state.
- Added package-side browser module registration and generic platform-event
  routing without game-specific code in `public/client.js`.

## In progress

- Move authoritative timers, arbitration orchestration, and member lifecycle
  handling behind the package `GameSession`.

## Final repository split

Once the in-repository boundary is complete, `games/egyptian-war` can become
its own repository and return to GameHub as a pinned package dependency. The
GameHub repository keeps the SDK, platform, room system, transport, picker,
chat, spectators, settings, and generic game host.
