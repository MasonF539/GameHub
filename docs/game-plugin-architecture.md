# Game Plugin Architecture

GameHub is being separated into a reusable platform and independently versioned game packages. GameHub remains responsible for rooms, members, spectators, reconnects, transport, the lobby, the game picker, personal settings, and the page shell. A game package owns its rules, authoritative state, browser presentation, game-specific assets, and tests.

## Target installation model

Games are installed as trusted npm dependencies and enabled through the
`gamePackages` list in `gamehub.config.json`. Deployments can override that
list with the comma-separated `GAMEHUB_GAME_PACKAGES` environment variable.
Installation requires adding the dependency and its package name to the
configured list. The package lock and Docker build then select an exact,
reproducible version.

Game packages execute trusted server code. They are not a sandbox for packages supplied by room hosts or browser clients.

## Versioned contracts

The independently buildable `@gamehub/game-sdk` workspace under
`packages/game-sdk` contains the initial GameHub game API:

- `GamePluginManifest` identifies the API version, package version, public game definition, and client delivery method.
- `GameServerPlugin` creates an authoritative `GameSession` for a room.
- `GameSession` receives generic actions and lifecycle notifications and exposes viewer-safe public state.
- `GameClientModule` mounts a game's browser interface inside the root supplied by GameHub and receives generic state and events.
- `GamePluginRegistry` validates manifests, rejects duplicate IDs, and supplies public definitions to the game picker.

The manifest API and package version are separate. `apiVersion` describes compatibility with GameHub, while `packageVersion` describes a release of the game itself.

The SDK is part of the GameHub platform, not a game plugin. The `packages/`
directory holds reusable platform packages, while `games/` holds playable game
implementations being prepared for extraction. After Egyptian War moves to its
own repository, GameHub will continue to own and version the SDK so Egyptian
War and future games can depend on the same stable contract. The selected
distribution path is the public npm registry, using exact SDK versions in game
package dependencies.

## Current in-repository boundary

Egyptian War is an independently buildable `@gamehub/egyptian-war` workspace
under `games/egyptian-war`. Its package export supplies the manifest, public
directory, and `GameServerPlugin`. The package-owned `GameSession` contains
authoritative state, timers, slap arbitration, animation sequencing, pause and
disconnect recovery, member lifecycle handling, and completion. The package's
browser module owns the board rendering, controls, animations, chat/spectator
panel, and game audio. GameHub injects declared resources and communicates only
through generic SDK services and state, event, and action envelopes.

The intended migration order is:

1. Route the existing game catalog through the validated registry.
2. Route the built-in client through generic game action, state, and event envelopes.
3. Introduce `GameSession`, remove the legacy events, and move Egyptian War timer and animation orchestration into the package session.
4. Route the embedded Egyptian War client through GameHub's generic browser game host.
5. Move Egyptian War styles, templates, previews, music, and effects into its game package.
6. Add package discovery from an explicit administrator-controlled configuration.
7. Publish the GameHub SDK to npm, extract the complete game package into the Egyptian War repository, make it depend on an exact SDK release, and install the game back into GameHub as a pinned dependency.
8. Keep the minimal fixture plugin as integration coverage proving the host lifecycle works without Egyptian War-specific behavior.

## Ownership boundary

GameHub keeps its own `index.html`, core stylesheet, and client code. A game module controls only the game root that GameHub gives it. It must clean up event listeners, timers, and DOM state when `destroy()` is called.

The platform owns menu/lobby audio and player-join notifications. Individual game packages own game music and action effects and register them through the shared audio service.

The server remains authoritative across the boundary. Browser modules may request actions but cannot supply trusted state, winners, clocks, scores, or arbitration results.

GameHub wraps each package's declared markup in a game-specific root, hides
inactive roots, and passes only the active package root to `mount()`. Package
clients must query within that root and namespace their CSS. Embedded clients
load their declared classic `entryPaths`; module clients additionally load the
required `entryPath` as an ES module.

Platform request handlers accept missing Socket.IO acknowledgement callbacks
without throwing. Room codes use cryptographically secure randomness, and
repeated invalid room-code guesses are limited before room lookup continues.
