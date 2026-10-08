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
7. Extract the complete package into the Egyptian War repository and install it back into GameHub as a versioned dependency.
8. Verify the boundary with a minimal second game before treating the API as stable.

## Ownership boundary

GameHub keeps its own `index.html`, core stylesheet, and client code. A game module controls only the game root that GameHub gives it. It must clean up event listeners, timers, and DOM state when `destroy()` is called.

The platform owns menu/lobby audio and player-join notifications. Individual game packages own game music and action effects and register them through the shared audio service.

The server remains authoritative across the boundary. Browser modules may request actions but cannot supply trusted state, winners, clocks, scores, or arbitration results.
