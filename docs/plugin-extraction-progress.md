# Plugin Extraction Progress

This file records the migration from an embedded Egyptian War implementation
to an independently versioned GameHub plugin.

## Completed

- Created independently buildable `@masonf539/game-sdk` and
  `@masonf539/egyptian-war` packages.
- Replaced private source imports with package-name imports.
- Moved Egyptian War engine code, tests, design notes, preview media, music,
  effects, HTML markup, and CSS through the temporary
  `games/egyptian-war` extraction workspace.
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
- Added publish-safe package exports, package-local licenses, and a generic
  artifact verification step that packs the local SDK, discovers configured
  games, downloads their pinned releases, installs everything into a clean
  temporary consumer, and validates runtime exports and declared assets.
- Generated and updated the `egyptian-war-standalone` subtree branch so the
  package sits at repository root with its relevant commit history, standalone
  ignore/attribute files, current rules, UI, assets, tests, and license.
- Replaced the generated README commit in
  `github.com/MasonF539/Egyptian-War` with that prepared history and updated
  the package repository, issue-tracker, and homepage metadata.
- Selected the account-owned `@masonf539` npm scope and renamed the SDK, game,
  imports, configuration, verification script, and lockfile consistently.
- Kept the Settings interface and its reusable Game actions in GameHub while
  making the Egyptian War viewport stable, safe-area-aware, and
  non-overlapping on small screens.
- Kept platform audio semantics separate from game audio: lobby waiters receive
  a GameHub completion chime when a match ends, while returning participants do
  not trigger the new-player sound.
- Hardened the Windows public launcher by resolving the tunnel before opening
  the browser and verifying that the complete Quick Tunnel URL reached the
  clipboard.

## Published packages

- Published `@masonf539/game-sdk@1.0.0` to npm.
- Published `@masonf539/egyptian-war@1.0.0`, depending on the exact SDK
  release, and installed it back into GameHub as a pinned external dependency.
- Removed the temporary Egyptian War workspace copy from GameHub; its source,
  tests, docs, and assets now live only in its independent repository.

## Verification

- The full production Docker build compiles the platform workspace and runs
  the GameHub and SDK automated tests. Egyptian War runs its own package test
  suite before publication.
- The current test set was reviewed after extraction; no obsolete temporary
  preview or duplicate test remained to remove.
- The production container serves injected package markup and the
  package-owned browser module from its declared public route.
- `npm run verify:packages` confirms the SDK and published game tarballs contain their
  compiled declarations/runtime and required public assets, exclude source and
  test folders, and work when installed outside the monorepo.
- GameHub's runtime client and server contain no Egyptian War implementation
  branches or imports; the installed package list lives in configuration.

## Final repository split

Egyptian War now has its own repository and is consumed by GameHub as a pinned
registry dependency. The GameHub repository keeps the SDK, platform, room
system, transport, picker, chat, spectators, settings, and generic game host.

The generic host now keeps gameplay events scoped to current board viewers.
Spectators can return to the lobby, lobby waiters can rejoin an active board
as spectators, and the client retains spectator-list updates that arrive
before a package finishes mounting. Lobby waiters hear a distinct completion
chime when a game finishes, while returning participants are excluded from
normal player-join notification detection.

`packages/game-sdk` stays in GameHub because it is the platform-owned contract
used by every game, not a playable game itself. Egyptian War and future game
repositories consume an exact SDK version published to the public npm registry
instead of copying its source.

Egyptian War is intentionally a GameHub plugin rather than a standalone web
application. Its independent repository will contain the game implementation
and assets, while GameHub will continue to supply the page shell, lobby,
rooms, networking, shared settings, and browser host.
