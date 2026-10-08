# Game Plugin Architecture

GameHub is being separated into a reusable platform and independently versioned game packages. GameHub remains responsible for rooms, members, spectators, reconnects, transport, the lobby, the game picker, personal settings, and the page shell. A game package owns its rules, authoritative state, browser presentation, game-specific assets, and tests.

## Target installation model

Games will be installed as trusted npm dependencies and enabled in GameHub configuration. A future installation should require only installing the package and adding its package name to the configured game list. The package lock and Docker build will then select an exact, reproducible version.

Game packages execute trusted server code. They are not a sandbox for packages supplied by room hosts or browser clients.

## Versioned contracts

The contracts under `src/game-sdk` are the initial GameHub game API:

- `GamePluginManifest` identifies the API version, package version, public game definition, and client delivery method.
- `GameServerPlugin` creates an authoritative `GameSession` for a room.
- `GameSession` receives generic actions and lifecycle notifications and exposes viewer-safe public state.
- `GameClientModule` mounts a game's browser interface inside the root supplied by GameHub and receives generic state and events.
- `GamePluginRegistry` validates manifests, rejects duplicate IDs, and supplies public definitions to the game picker.

The manifest API and package version are separate. `apiVersion` describes compatibility with GameHub, while `packageVersion` describes a release of the game itself.

## Transitional state

Egyptian War is registered with a valid versioned manifest, but its delivery mode is currently `embedded`. Its server lifecycle is still handled directly by `server.ts`, and its markup, styles, and browser logic remain in GameHub's shared public files. This preserves the working game while those responsibilities are moved behind the contracts.

The intended migration order is:

1. Route the existing game catalog through the validated registry.
2. Replace Egyptian-War-specific room state and Socket.IO routing with `GameSession` and generic game events.
3. Give GameHub a generic browser game root and move Egyptian War into a `GameClientModule`.
4. Move Egyptian War styles, templates, previews, music, and effects into its game package.
5. Add package discovery from an explicit administrator-controlled configuration.
6. Extract the complete package into the Egyptian War repository and install it back into GameHub as a versioned dependency.
7. Verify the boundary with a minimal test game before treating the API as stable.

## Ownership boundary

GameHub keeps its own `index.html`, core stylesheet, and client code. A game module controls only the game root that GameHub gives it. It must clean up event listeners, timers, and DOM state when `destroy()` is called.

The platform owns menu/lobby audio and player-join notifications. Individual game packages own game music and action effects and register them through the shared audio service.

The server remains authoritative across the boundary. Browser modules may request actions but cannot supply trusted state, winners, clocks, scores, or arbitration results.
