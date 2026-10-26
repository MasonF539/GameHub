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
chat history, or game state. At most two pending requests per client address
are allowed in a room. Requests expire after one minute, can be cancelled,
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

## Chat, score resets, and shared controls

Chat is optional per game through its definition. GameHub validates membership,
message length (1-300 characters), and send rate, and retains the last 50 messages
for viewers of the active match on join or reconnect. Lobby waiters do not receive
this history. History clears when a match starts or ends. The current room chat is
shared by players and spectators; separate channels are not implemented.

The platform's scoreboard reset service checks host permission and opens an
in-app confirmation for the active game. Cancelling preserves totals. Room or
game closure, disconnection, and loss of host ownership cancel an open reset;
late replies must not dismiss a newer confirmation or access an unmounted game.
The modal also closes safely if cancellation occurs during its opening animation.

GameHub owns confirmed room closure, game exit, and player/spectator leave flows.
It hides room codes by default and provides reveal, copy-code, and copy-link
controls. Lobby waiters may enter an active game as spectators; spectators can
return to the lobby through the spectator-leave confirmation. These procedures
are shared across games. Game definitions declare
playability; the platform keeps rules/settings available and prevents starting
an unplayable game.

Fullscreen is an explicit Game settings action. The platform does not request
fullscreen automatically on page load or room entry. Browser support and user
interaction determine whether the request succeeds.

The personal Audio settings persist independent music, lobby-alert, and gameplay
volume levels; 0% disables a category. Game packages register their own music and
effects, and audio waits for browser-approved user interaction before starting.

## Host ownership and recovery

GameHub owns room host identity and transfer. When a host remains disconnected
for 60 seconds, control transfers to a connected active player, or a connected
lobby player when no game is running. If no eligible successor exists, the room
closes. A returning former host does not automatically reclaim ownership.
Disconnected non-host lobby players and spectators normally expire after two
minutes; active-game players remain subject to the game's disconnect policy and
host-management flow.

Manual transfer is available beside Kick in the lobby and in Settings > Game,
including during active play. Mounted clients receive ownership changes without
restarting the match; games should refresh their host controls using the current
`context.isHost` value. The host-transfer deadline is independent of any game's
configurable offline-autoplay wait. The separate two-minute Socket.IO recovery
window does not determine when host transfer occurs.

Games own their offline-player policies, turn timers, and manual-pause behavior.
Egyptian War's game-specific policy is documented in its own design document.
Personal display preferences do not change shared animation or gameplay timing.

## Current platform limits

Private per-player events, spectator-isolated chat, and a shared SDK turn-timer
implementation are not currently provided.

## Presets and room scores

Hosts can save up to 20 named rule presets per game in their browser. The host's
last confirmed configuration is restored on game selection. Saved values are
validated against the current game schema, including numeric bounds and slider
increments; missing or incompatible values fall back to defaults. Selecting a
preset loads the settings draft; Save Settings applies it to the room.

Preset controls are available to the current host when no game is active. They
refresh after a host change and when a match ends, including when ownership
changed during play. Presets require no accounts or server storage and remain
specific to the browser and site origin.

Games may optionally declare scoreboard columns and report authoritative counters
through `context.recordStat(memberId, key)`. The platform awards declared `wins`
on game completion. Totals live only in room memory, survive game restarts and
socket-ID changes, and disappear when the room closes or the process stops.
Score rows are keyed by case-insensitive player name within each room and game,
so leaving and rejoining with the same name preserves totals. A returning name
updates its displayed spelling and avatar; names are not authenticated identities.
A host-only reset clears totals. Scoreboards retain at most 200 participant rows
per game per room. Pending joiners receive no scores.

The browser receives optional `scoreboard`, `host-changed`, and `host-status`
platform events. `context.isHost` reflects current ownership; games should update
their visible host controls on ownership changes. Optional lifecycle disconnection
metadata includes server deadlines so clients render countdowns locally. Egyptian
War exposes its game-specific scoreboard only beside Chat and Spectators.
Slap rule explanations appear only after resolution; no live slap-validity hints
or client-reported scores are accepted. Host procedures are described under
[Host ownership and recovery](#host-ownership-and-recovery).

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

## Rejoining and browser storage

Transport recovery is authorized against the current socket-to-room membership
map before Socket.IO restores rooms or replays missed events. Removed or replaced
memberships cannot recover a former room subscription; legitimate members retain
transport recovery, and browser token restoration remains the fallback.
Authorized transport recovery sends a fresh reconnect token even if the original
room-entry acknowledgement was lost, preserving restoration after a later refresh.
The per-member chat cooldown also survives socket replacement; reconnecting does
not reset its timer or delay another member's chat.

Each tab keeps its own player reconnect token in session storage. Refreshes and
brief drops restore that player automatically while a Reconnecting screen blocks
accidental input. After ten seconds without restoration, the client returns to
the menu and checks saved identities for an explicit rejoin offer.

A rejected resume with `sessionUnavailable: true` means the server no longer
recognizes that identity (missing, expired, or revoked). The client forgets that
identity, clears the stale lobby or mounted game, and returns to the menu with
the server's reason. Temporary request errors keep the bounded recovery window
and saved identity. Late rejections cannot discard a successfully rotated or
newer session. Other browser-local preferences are unaffected.

Local storage keeps up to 20 recent players with their room code, name, token,
and last-seen time. Disconnect, visibility, and page-close events refresh recency.
The server checks that tokens are within their 24-hour lifetime, that their room
and member still exist, and whether the player is connected. Browser Web Locks,
when available, also exclude identities still held by another tab, including an
open tab that is briefly offline. Fresh tabs never automatically claim a saved
identity. Old browser-wide tokens migrate to the same validated offer.

The rejoin modal offers only the most recently seen eligible disconnected player,
respects explicit room invites, and normally appears once per page visit. An
offer interrupted by disconnection is checked again after connection recovery.
If another dialog is open or closing, eligibility is checked again after that
dialog finishes closing so the offer does not overlap it. Its footer offers
Rejoin and Join as a new player. Rejoin uses the saved token and bypasses join approval;
manual rejoining rechecks that the old player is still disconnected. Names alone
never authorize claiming a seat. Switching devices without the token has no
name-based fallback.

Join as a new player first asks the server to release the saved disconnected
identity. During a game this uses the package's voluntary-removal contract, which
must succeed before the seat and token are removed. Releasing a host transfers
ownership to an eligible connected player, or closes the room when nobody can
take over; the modal explains that consequence. The user then enters a name and
uses the ordinary join flow, including approval and lock checks. A failed release
preserves the saved identity. No ghost seat is intentionally left behind.
Disconnect cleanup closes a pending rejoin modal and releases unfinished claims
when the tab has no active identity. Resume and saved-player-release callbacks
use request generations so stale replies cannot clear a newer room session.

Room creation and ordinary joining keep a separate pending request identity.
Disconnects, room resets, and successful session restoration invalidate it.
Acknowledgements apply only to that request while the tab is outside a room;
late successes and failures cannot replace a newer lobby or unlock its controls.
Approval results require a current waiting join request. Cancellation replies
also check request identity so approval winning the race leaves the joined
controls locked.

Leave Lobby, Leave Game, Stop Spectating, and Spectate use a lifecycle generation
to reject stale asynchronous responses. Disconnects, room changes/resets, game
mounts, and game completion invalidate pending lifecycle replies and reset their
buttons. A later match in the same room also has a new generation, so its board
cannot be unmounted by a delayed reply from the previous match. Host Exit Game
and Close Lobby acknowledgements use the same generation check. Leave Game,
Stop Spectating, Exit Game, and Close Lobby confirmations close on invalidation
even if their opening animation is in progress: cleanup retries after `shown.bs.modal` and removes the retry on
`hidden.bs.modal`. Opening is tracked from `show.bs.modal`, before the backdrop
finishes appearing. Verification is recorded in [bug-review.md](bug-review.md).

Presets, keybinds, audio, and display preferences remain browser-wide local
storage. Loading a preset changes the host's draft; Save Settings applies it
only to that host's room.
Save Settings acknowledgements also belong to a specific pending save and editor
visit. Showing or closing that editor, replacing the save, or changing the room
lifecycle invalidates older replies. A stale acknowledgement cannot close a newly
opened editor or discard a preset-loaded draft. This guards only the reply's UI
side effects; confirmed server-rule events and browser preset persistence keep
their existing roles.
Rule-preference mutations reread current storage and preserve unrelated presets
and confirmed rules. An exclusive Web Lock serializes writes across tabs where
supported; otherwise fresh reads protect sequential updates but do not guarantee
serialization of simultaneous writes. Storage events refresh preset lists without
resetting the host's unsaved draft, preset name, or focus. Queued preset saves use
the name and rule values captured when Save preset was clicked. Saving an existing
preset name replaces that preset. Failed writes retain pending preset saves,
deletions, and confirmed-rule changes in memory. Reads and external storage events
merge those edits over current shared data; the next successful mutation persists
the merged result and clears pending edits only after the write succeeds. Until
then, the UI reports that those edits last only for this visit. Closing or
reloading the tab before storage recovers loses its unpersisted edits.

Game-picker replies are tied to a pending selection and room. Showing or closing
the picker invalidates older selection replies, preventing them from closing or
unlocking newer controls. Leave Game requests require current active membership;
lobby waiters cannot invoke a second plugin removal or regain active membership
through a failed removal.

Display choices apply immediately in the current page. Persistence merges changed
fields into fresh shared storage so another tab's unrelated choices survive.
Failed writes retain pending fields until a later successful change. Display
writes use an exclusive Web Lock where available and retain it through the
storage task boundary before allowing another tab to write. Without Web Locks,
sequential writes merge fresh data but exact simultaneous writes are not atomic.

Keybind writes validate fresh stored bindings and apply only changed actions,
including default resets and explicit unbinding. Failed writes retain pending
action changes for the next save. The current tab updates its keybind UI and
subscriptions immediately; synchronous storage writes protect sequential edits
from other tabs but do not guarantee atomic simultaneous updates.

Audio persistence likewise merges changed categories into fresh saved settings
and retains failed category writes for recovery. Global mute/unmute explicitly
updates every category. Local playback remains immediate, with the same
sequential-write guarantee and simultaneous-write limit as keybinds.

Numeric rule schemas follow the host's integer validation. Select choices and
defaults are integers; range bounds and steps are integers, and the default must
be in bounds on a step starting at min. Invalid schemas fail registry validation
rather than producing a settings editor whose default cannot be saved. Typed
range values round to a valid step within the bounds, including when max falls
between steps.

Leaving or exiting through Settings waits for its hidden event before opening
the next confirmation, preserving Bootstrap's backdrop and body scroll lock.
The queued handoff is cancelled on room/game lifecycle changes, and chooses the
current host/player/spectator confirmation only when Settings has finished closing.

The browser host discovers modules registered after its construction when checking
or mounting a game. Platform startup is deferred after declared game module
scripts, so active-room recovery waits for their registration. The module fixture
includes an actual rendering client; browser verification covers a delayed module
response during an active-match refresh as well as normal action/state routing.

Saved-player lock rejections apply only to their current pending claim. An
obsolete lock failure cannot unlock controls or report an error for a newer
room-entry request; a current rejection still restores retry controls.

A current restoration-lock failure stops the reconnect overlay immediately and
returns to a validated saved-player offer, retaining the saved token. It clears
only the tab's failed recovery attempt; a release-as-new failure keeps its current
offer available for retry.

Returning to the lobby clears the previous match's disconnection list and status
text. Room-level host recovery remains separate, so lobby waiters do not retain
obsolete match countdowns after they stop receiving game lifecycle events.

Join-approval request failures restore the server-confirmed policy rather than
inverting a possibly newer checkbox value. Replies from an obsolete room
lifecycle or after loss of host ownership cannot change the current controls.


Explicit host pause requests are delegated to the session even when lifecycle
state is already paused. A game can distinguish a manual host pause from an
automatic disconnect pause and preserve that intent after reconnection. Resume
on an already-running game remains a no-op.


Browser requests share one connection guard. A request made while disconnected
returns a failed acknowledgement immediately instead of entering Socket.IO's
send buffer; this includes game actions, chat, room controls, and pause requests.
Gameplay keybind handlers do not run while disconnected. Local preference edits
remain independent of transport availability.

For launcher-discovered invites, the server observes the registration file once
per second and broadcasts only changes to the validated address, including its
removal. Connected clients cache that value for Copy Link. A configured
GAMEHUB_PUBLIC_URL takes precedence and skips the file observer. The observer
is removed when the HTTP server closes.
