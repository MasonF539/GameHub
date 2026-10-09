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
- Added a minimal fixture plugin for GameHub integration coverage and moved
  Egyptian War-specific session, browser animation, and audio-registration
  coverage into the game package.
- Moved the generic gameplay-view wrapper into GameHub's page shell so game
  packages provide only the markup mounted inside `#game-root`.
- Added per-package markup roots, active-root client mounting, and ES-module
  entry-point loading for module-delivered game clients.
- Centralized the avatar catalog in server-rendered platform configuration and
  hardened room requests with optional acknowledgements, cryptographic room
  codes, and invalid-join throttling.
- Added publish-safe package exports, package-local licenses, and an artifact
  verification step that packs both packages, installs their tarballs into a
  clean temporary consumer, and loads Egyptian War without workspace source.

## In progress

- Move `games/egyptian-war` into its independent repository, publish it to npm,
  and reinstall an exact version in GameHub as an external dependency.
- Publish the SDK first so the independent Egyptian War repository can create
  its own lockfile against the real exact SDK release.
- Confirm the npm scope and destination GitHub repository name before changing
  the package's repository metadata or publishing either package.

## Verification

- The full production Docker build compiles both workspaces and passes all 58
  automated tests.
- The production container serves injected package markup and the
  package-owned browser module from its declared public route.
- `npm run verify:packages` confirms the SDK and game tarballs contain their
  compiled declarations/runtime and required public assets, exclude source and
  test folders, and work when installed outside the monorepo.
- GameHub's runtime client and server contain no Egyptian War implementation
  branches or imports; the installed package list lives in configuration.

## Final repository split

Once the in-repository boundary is complete, `games/egyptian-war` can become
its own repository and return to GameHub as a pinned package dependency. The
GameHub repository keeps the SDK, platform, room system, transport, picker,
chat, spectators, settings, and generic game host.

`packages/game-sdk` stays in GameHub because it is the platform-owned contract
used by every game, not a playable game itself. Egyptian War and future game
repositories consume an exact SDK version published to the public npm registry
instead of copying its source.

Egyptian War is intentionally a GameHub plugin rather than a standalone web
application. Its independent repository will contain the game implementation
and assets, while GameHub will continue to supply the page shell, lobby,
rooms, networking, shared settings, and browser host.
