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
- Added the generic server `GameSession` lifecycle and package factory.
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
- Moved authoritative Egyptian War state, timers, slap arbitration,
  animations, pause/disconnect recovery, member removal, and completion into
  its package-owned `GameSession`.
- Removed Egyptian War engine imports and game-specific room state from
  GameHub's server.
- Moved the installed-game list into `gamehub.config.json`, leaving GameHub's
  server free of Egyptian War package names and implementation imports.
- Split production and test compilation so published `dist` directories do
  not contain test JavaScript or empty test declaration modules.

## In progress

- Add a minimal second plugin to verify that GameHub has no remaining
  Egyptian War assumptions before stabilizing the SDK API.
- Move `games/egyptian-war` into its independent repository, publish or pin
  its package, and reinstall it in GameHub as an external dependency.

## Verification

- The full production Docker build compiles both workspaces and passes all 52
  automated tests.
- The production container serves injected package markup and the
  package-owned browser module from its declared public route.
- GameHub's runtime client and server contain no Egyptian War implementation
  branches or imports; the installed package list lives in configuration.

## Final repository split

Once the in-repository boundary is complete, `games/egyptian-war` can become
its own repository and return to GameHub as a pinned package dependency. The
GameHub repository keeps the SDK, platform, room system, transport, picker,
chat, spectators, settings, and generic game host.

Egyptian War is intentionally a GameHub plugin rather than a standalone web
application. Its independent repository will contain the game implementation
and assets, while GameHub will continue to supply the page shell, lobby,
rooms, networking, shared settings, and browser host.
