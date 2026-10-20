# Game Plugin Architecture

GameHub separates the reusable platform from independently versioned game packages. GameHub is responsible for rooms, members, spectators, reconnects, transport, the lobby, the game picker, personal settings, and the page shell. A game package owns its rules, authoritative state, browser presentation, game-specific assets, and tests.

## Target installation model

Games are installed as trusted npm dependencies and enabled through the
`gamePackages` list in `gamehub.config.json`. Deployments can override that
list with the comma-separated `GAMEHUB_GAME_PACKAGES` environment variable.
Installation requires adding the dependency and its package name to the
configured list. The package lock and Docker build then select an exact,
reproducible version.

When testing unpublished changes to an installed game, track a
version-specific patch in `patches/`. The install hook applies it to the npm
package, including in Docker, so normal build/start commands run the changes.
The independent game repository remains the source for the next package release.
Remove the patch once the dependency is updated to a release containing the fix.

The Docker build runs `npm run verify:packages` after the test suite. That
check packs the local SDK, reads every enabled game from `gamehub.config.json`,
downloads each exact version declared in the root dependencies, installs all
artifacts into an empty temporary consumer, and validates their exports and
declared browser assets. It guards against missing package files and imports
that exist only in a development checkout.

Game packages execute trusted server code. They are not a sandbox for packages supplied by room hosts or browser clients.

## Joining and personal display options

Room invite links use `?room=CODE` to prefill the entry form; players still choose
their own name and avatar. Room codes start hidden for everyone. The copy icon
beside the eye copies the code without revealing it; a separate Copy link button
copies the invite URL. Manual code entry and each viewer's reveal toggle remain.
The server supplies the invite base URL: the Public launcher registers its
detected TryCloudflare address, or an operator can set `GAMEHUB_PUBLIC_URL`.
The host can stay on localhost while copying public invites. Without a public
address, the copy action falls back to the current browser address.
The address is sent on connection and cached in browser memory; copying a link
does not make another server request. Reloading or reconnecting refreshes it.
Locked rooms reject new join requests and dismiss any pending requests.
The host can require approval for both players and
spectators in Settings → Game → Joining. Pending visitors receive no membership,
chat history, or game state. Requests expire after one minute, can be cancelled,
and are checked again against the room lock, capacity, and names on acceptance.

Games may declare `displayOptions` in their definition. Each option has a stable
key, a default, and named choices with optional preview paths inside that game's
public directory. GameHub renders per-game dropdowns in Settings → Game → Display
Options and stores selections locally on the device. `context.display.get` and
`onChange` let a game apply these personal preferences without changing shared
rules. Keyboard hints use `context.input.getBinding`, `hasKeyboard`, and
`onBindingsChanged` so labels follow remapping. Keyboard presence uses pointer
capabilities and observed keyboard input because browsers do not expose a
reliable list of connected keyboards.

Egyptian War defaults to a 60-second offline waiting period, then auto-plays
offline turns while preserving each player's hand for reconnection. Hosts can
adjust the waiting period or disable takeover in the lobby's game settings.
An explicit host pause remains paused when the wait ends. After the host
disconnects, a two-minute recovery window precedes automatic transfer to a connected
active player (or a connected lobby player when no game is running). With no
eligible successor, the abandoned room closes. Hosts can transfer control manually
in Settings > Game. Ownership changes notify mounted clients without resetting the game. Animation timing is shared;
there is no personal animation-speed setting. System reduced-motion preferences
remain supported.

Private per-player events, spectator-isolated chat, a shared SDK turn timer,
are not implemented by these changes.

## Presets and room scores

Hosts can save up to 20 named rule presets per game in their browser. The host's
last confirmed configuration is restored on game selection. Saved values are
validated against the current game schema; missing or incompatible values fall
back to defaults. Loading a preset edits the draft; Save Settings applies it.
Presets never go into server storage and remain specific to the browser origin.

Games may optionally declare scoreboard columns and report authoritative counters
through `context.recordStat(memberId, key)`. The platform awards declared `wins`
on game completion. Totals live only in room memory, survive game restarts and
socket-ID changes, and disappear when the room closes or the process stops.
Members have server-generated score identities that survive reconnection; fresh
joins receive new identities. A host-only reset clears totals. Scoreboards retain
at most 200 participant rows per game per room. Pending joiners receive no scores.

The browser receives optional `scoreboard`, `host-changed`, and `host-status`
platform events. `context.isHost` reflects current ownership; games should update
their visible host controls on ownership changes. Optional lifecycle disconnection
metadata includes server deadlines so clients render countdowns locally. Egyptian
War exposes its game-specific scoreboard only beside Chat and Spectators.
Manual host transfer is available beside Kick in the lobby and in GameHub
settings during a game. A disconnected host
hands control to a connected player after 60 seconds; a returning former host
does not automatically reclaim control. Slap rule explanations appear only after resolution;
no live slap-validity hints or client-reported scores are accepted.

## Versioned contracts

GameHub **1.0.0** is the first official application release, distributed through
GitHub and built with Docker. Its version is independent of the npm package
versions: this branch uses `@masonf539/game-sdk@1.1.0-beta.0` and
`@masonf539/egyptian-war@1.0.1-beta.6`. Updating the application version does not
require republishing either npm package unless that package itself changes.

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
