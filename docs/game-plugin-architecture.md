# Game Plugin Architecture

GameHub is being separated into a reusable platform and independently versioned game packages. GameHub remains responsible for rooms, members, spectators, reconnects, transport, the lobby, the game picker, personal settings, and the page shell. A game package owns its rules, authoritative state, browser presentation, game-specific assets, and tests.

## Target installation model

Games are installed as trusted npm dependencies and enabled through the
`gamePackages` list in `gamehub.config.json`. Deployments can override that
list with the comma-separated `GAMEHUB_GAME_PACKAGES` environment variable.
Installation requires adding the dependency and its package name to the
configured list. The package lock and Docker build then select an exact,
reproducible version.

The Docker build runs `npm run verify:packages` after the test suite. That
check packs the local SDK, reads every enabled game from `gamehub.config.json`,
downloads each exact version declared in the root dependencies, installs all
artifacts into an empty temporary consumer, and validates their exports and
declared browser assets. It guards against missing package files and imports
that exist only in a development checkout.

Game packages execute trusted server code. They are not a sandbox for packages supplied by room hosts or browser clients.

## Versioned contracts

The independently buildable `@masonf539/game-sdk` workspace under
`packages/game-sdk` contains the initial GameHub game API:

- `GamePluginManifest` identifies the API version, package version, public game definition, and client delivery method.
- `GameServerPlugin` creates an authoritative `GameSession` for a room.
- `GameSession` receives generic actions and lifecycle notifications and exposes viewer-safe public state.
- `GameClientModule` mounts a game's browser interface inside the root supplied by GameHub and receives generic state and events.
- Optional keybind declarations expose stable named actions and physical-key defaults; mounted clients subscribe through `GameClientContext.input` rather than owning global keyboard listeners.
- `GamePluginRegistry` validates manifests, rejects duplicate IDs, and supplies public definitions to the game picker.

The manifest API and package version are separate. `apiVersion` describes compatibility with GameHub, while `packageVersion` describes a release of the game itself.

The SDK is part of the GameHub platform, not a game plugin. The `packages/`
directory holds reusable platform packages. Playable games live in independent
repositories and declare a compatible SDK range as a peer dependency, so the
host and its games share the platform's SDK installation.
GameHub likewise installs exact game-package versions for reproducible builds.

## Current package boundary

Egyptian War is the external `@masonf539/egyptian-war` package maintained in
the [Egyptian War repository](https://github.com/MasonF539/Egyptian-War). Its package export supplies the manifest,
public directory, and `GameServerPlugin`. The package-owned `GameSession` contains
authoritative state, timers, slap arbitration, animation sequencing, pause and
disconnect recovery, member lifecycle handling, and completion. The package's
browser module owns the board rendering, controls, animations, chat/spectator
panel, and game audio. GameHub injects declared resources and communicates only
through generic SDK services and state, event, and action envelopes.

The completed migration order was:

1. Route the existing game catalog through the validated registry.
2. Route the built-in client through generic game action, state, and event envelopes.
3. Introduce `GameSession`, remove the legacy events, and move Egyptian War timer and animation orchestration into the package session.
4. Route the embedded Egyptian War client through GameHub's generic browser game host.
5. Move Egyptian War styles, templates, previews, music, and effects into its game package.
6. Add package discovery from an explicit administrator-controlled configuration.
7. Publish the GameHub SDK to npm, extract the complete game package into the Egyptian War repository, make it depend on an exact SDK release, and install the game back into GameHub as a pinned dependency.
8. Keep the minimal fixture plugin as integration coverage proving the host lifecycle works without Egyptian War-specific behavior.

## Ownership boundary

GameHub keeps its own `index.html`, core stylesheet, and client code. A game module controls only the game root that GameHub gives it. It must clean up event listeners, timers, and DOM state when `destroy()` is called. GameHub additionally scopes `GameClientContext.input` subscriptions to the current mount and clears them after unmount or a failed mount, so a package cannot leave duplicate key handlers behind.

GameHub's page shell also owns the tabbed Settings interface. Its reusable
Game tab exposes full-screen, lifecycle pause/resume, and confirmed exit/leave
actions without querying package-specific controls. Game packages remain
responsible for fitting their mounted panels to the supplied viewport;
Egyptian War fixes its active panel to that viewport and accounts for mobile
safe areas. The settings categories are vertical on large screens and move
above the selected panel horizontally at medium and small breakpoints. The
Keybinds tab contains a General group and one independently collapsible group
for every installed game that declares keybinds. Overrides are personal,
stored locally by game and action ID, and routed only to an active player while
that game is mounted. Text entry, spectators, and open modal dialogs suppress
gameplay shortcuts. The interface marks both sides of a collision within one
game or against a General shortcut; the same physical key may be reused by
different games because only one game can be mounted at a time.
Assignable defaults use `KeyboardEvent.code`: letters, numbers, arrows, Space,
Enter, Escape, punctuation, and ordinary numpad keys are supported. Tab,
function keys, and standalone modifiers remain reserved; Backspace clears a
personal binding. Ctrl/Alt/Command combinations pass through to the browser.
The SDK rejects invalid package defaults and the client rejects undeclared
action IDs instead of silently ignoring package typos.

The platform owns menu/lobby audio and the adjustable lobby alert category, which includes player-join notifications and the replaceable `public/assets/audio/effects/game-finished.mp3` alert heard by members already waiting in the lobby. Individual game packages own game music and action effects and register them through the shared audio service. The server routes package events only to active players and spectators, preventing lobby waiters from receiving delayed gameplay audio. GameHub identifies members returning from a finished game so their promotion back into the player list does not trigger the new-player sound.

The server remains authoritative across the boundary. Browser modules may request actions but cannot supply trusted state, winners, clocks, scores, or arbitration results.

GameHub wraps each package's declared markup in a game-specific root, hides
inactive roots, and passes only the active package root to `mount()`. Package
clients must query within that root and namespace their CSS. Embedded clients
load their declared classic `entryPaths`; module clients additionally load the
required `entryPath` as an ES module.

Platform request handlers accept missing Socket.IO acknowledgement callbacks
without throwing. Room codes use cryptographically secure randomness, and
repeated invalid room-code guesses are limited before room lookup continues.
Active players must use the game-leave flow before leaving a lobby, which
keeps authoritative sessions from retaining a player the room has removed.
