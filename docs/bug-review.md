# Current bug review

Review date: 2026-10-26. Findings describe the current unpublished checkout.

## Fixed: late room-entry responses replace a newer lobby

1. Create a room and delay delivery of its successful acknowledgement to the client.
2. Disconnect and reconnect the tab before that acknowledgement is processed.
3. Create a second room successfully.
4. Deliver the original acknowledgement.

Before the fix, the client switched its displayed room and saved reconnect
identity to the first room while its socket remained in the second. Locking the
displayed room then failed with "Only the host can lock or unlock the lobby."

The client now tracks the specific pending entry request. Disconnects, room
resets, and successful session restoration invalidate it. Both Create Room and
Join Room acknowledgements must still belong to that request before changing
lobby state, saved identity, pending controls, or notifications. Completion retires
the request, and name fallback uses the submitted name rather than a later input.

Approval results apply only while the current join request awaits approval.
Cancellation acknowledgements cannot unlock controls after an accepted join or
cancel a newer entry request.

Verification: six added client regressions cover stale success and failure replies
for creation and joining, late approval results after cancellation, and cancellation
acknowledgements after approval. Real Edge browser checks hold an actual server
acknowledgement until after a disconnect, reconnection, and a successful new room
creation; the newer lobby and its working host actions are preserved.

## Fixed: rejected reconnect leaves a stale room visible

Previously, restarting the server while a lobby tab stayed open caused recovery
to keep the nonexistent room visible and report "Your room session is already
active." Room actions failed and the stopped recovery timer never returned the
user to the menu.

The server now marks missing, expired, and revoked reconnect identities with
`sessionUnavailable: true`. For that terminal response, the client forgets the
stale identity, clears room state, unmounts any game, unlocks entry controls, and
returns to the menu with the server's actual reason. An ordinary connection drop
or a temporary request error preserves the saved identity and ten-second recovery
window. If that window expires, recovery returns to the existing saved-player
flow rather than deleting the identity.

Generation and mount-session identity checks ignore stale rejection replies after
a newer successful restoration or token rotation.

Verification: client regressions cover terminal rejection in lobby and gameplay,
temporary-error timeout behavior, and preserving a successfully rotated identity.
The server integration test distinguishes unavailable/revoked tokens from an
identity that is simply connected elsewhere. Actual Edge browser checks restart
a temporary server on the same port with a lobby and with an active Egyptian War
game; both return to the menu through the terminal-rejection path, show the real
reason, and allow a fresh room to be created without reloading. Expiry is marked
by the server's existing 24-hour expiry branch; a 24-hour browser session was not
run for this review.

## Fixed: one tab can overwrite another tab's rule presets

Previously, saving Alpha in one host tab and Beta in a second tab could leave
only Beta in browser storage. Each tab wrote its entire stale startup snapshot.

Preset save/delete and last-confirmed-rule updates now reread shared storage
inside the mutation and preserve unrelated entries. Where Web Locks is available,
all rule-preference writes use the same exclusive lock, including confirmed-rule
writes, so overlapping updates serialize. Identical preset names still mean an
intentional replacement; the last completed update wins for that name.

Storage events refresh only the current preset dropdown. The unsaved rule values,
preset-name input, focus, and existing selection are preserved when possible.
External deletion removes the option without applying another preset. A queued
save captures its name and draft at click time. Unavailable storage retains the
existing memory-only behavior and reports that the preset lasts for this visit.

Verification: 67 browser-client tests pass, including new stale save/delete,
external list/draft, and confirmed-rule preservation regressions. Actual Edge
checks retain both sequential saves, hold the shared lock to queue two overlapping
saves and retain all four presets, and verify that deleting a preset in one tab
updates the other list without changing its draft.

Without Web Locks, each mutation still rereads storage and fixes sequential
stale-tab overwrites; exact simultaneous writes are not guaranteed to serialize.
This fallback also applies on origins where that browser API is unavailable.

## Fixed: memory-only presets disappear on the next save when writes fail

Previously, allowing storage reads while making preset writes throw
`QuotaExceededError` caused saving Beta to discard an earlier memory-only Alpha,
despite the toast promising both presets would last for the current visit.

The client now keeps unpersisted save, delete, and last-confirmed-rule changes.
Fresh reads and storage events replay those changes over current shared data,
preserving local edits without replacing unrelated updates from another tab.
The next successful mutation writes the merged data and clears pending changes
only after `setItem` succeeds. Names and values remain captured at click time.
Repeated updates to the same name resolve in edit order. Existing entries are
not silently truncated during recovery; the limit still blocks new additions
when there are already 20 other presets.

Verification: all 69 client tests pass. Added coverage simulates both read-allowed
write failures and fully blocked storage, including repeated saves, deletion,
confirmed-rule changes, external storage events, and later successful persistence.
Actual Edge checks preserve Alpha and Beta through injected write failures, merge
Remote from a second tab, restore writes, save Gamma, reload the page, and find
all four presets. Sequential and concurrently queued normal cross-tab saves also
continue to pass.

Pending edits remain only in the current tab while storage is unwritable. Closing
or reloading that tab before a successful write cannot preserve those edits.
Write failures were injected; the test did not fill actual storage to its quota.

## Fixed: a late Leave Lobby response clears a newer room

Previously, delaying an actual Leave Lobby acknowledgement until after a
disconnect, reconnect, and successful new room creation cleared the newer room's
UI and reconnect identity. The socket remained joined on the server, so another
creation attempt failed with "You are already in a room."

Leave Lobby, Leave Game, Stop Spectating, and Spectate callbacks now capture the
current lifecycle generation and ignore stale successes and failures. Changes
of room, disconnection, room resets, game mounts, and game completion invalidate
that generation. A new match in the same room is a different lifecycle as well.
Invalidation resets pending leave/spectate buttons and requests closure of visible
game-leave confirmations; a stale reply cannot unlock or hide a newer operation's controls.
The valid Leave Lobby path clears the room code captured when the action began.

Verification: all 78 client tests pass, including nine new regressions for stale
leave/spectate successes and failures and a new match in the same room. A real
Edge test delays the server's actual leave acknowledgement, reconnects, creates
a new lobby, and then delivers the reply: the newer lobby and identity remain,
and a host lock action succeeds. The eight-tab browser check also passes refresh,
reconnect, admission approval, saved-player release, and modal/layout checks.

## Fixed: a leave confirmation remains over the lobby after game completion

Previously, ending a match while a guest's Leave Game dialog was opening returned
the guest to the lobby but left the confirmation and its backdrop visible.
Bootstrap ignored `hide()` during its opening transition.

Leave Game, Stop Spectating, and the host's Exit Game dialogs now track
`show.bs.modal`, including the initial backdrop-opening phase before the dialog
has the `show` class. Lifecycle cleanup attempts an immediate hide and queues one
retry on `shown.bs.modal`. `hidden.bs.modal` removes retry listeners, so later
confirmations do not inherit an obsolete close handler. Repeated invalidation
does not attach duplicate retries.

Exit Game replies now also check their captured lifecycle generation, and its
pending confirm button resets on invalidation. Old successes or failures cannot
hide a newer confirmation or unlock its pending button. Leave and Exit actions
require an actively mounted game before submitting.

Verification: all 89 client tests pass. Eleven added regressions cover opening
cleanup for all three dialogs on game completion, room closure, and disconnection;
listener cleanup across reopening; and stale Exit Game success/failure replies.
Actual Edge checks cover all three dialogs during game completion, host Exit Game
while game completion is immediately followed by room closure, and Leave Game
during disconnect. Each check verifies that
the dialog, backdrop, and body scroll lock are removed after transitions complete.

## Fixed: a late Save Settings acknowledgement closes a newer settings draft

Previously, holding a successful Save Settings acknowledgement, closing/reopening
the dialog, editing a new draft, and then delivering that old acknowledgement
closed the newer editor and rebuilt its fields from confirmed rules.

Each Save Settings action now has a pending request identity tied to its room and
game. Showing, hiding, or finishing hiding the editor invalidates that request,
as do room/game lifecycle changes. Only the latest save in the current editor
visit can close it or report its acknowledgement failure. Host ownership and the
selected game are checked again before applying reply side effects.

Server-confirmed rule events and the preset storage pipeline are unchanged.
Selecting a preset still loads only the draft, Save preset saves browser-local
rules, and Save Settings applies them to the room. An obsolete acknowledgement
cannot close a reopened editor, discard its preset-loaded draft, or alter presets.

Verification: all 93 client tests pass, including stale success/failure replies,
newer saves in the same visit, reconnect/new-room protection, and preservation of
preset values and storage. Actual Edge checks preserve the reopened editor and
its draft, create a preset there, confirm that a current Save Settings closes
normally and remembers confirmed rules, and reload that preset successfully.
The normal concurrent-tab and quota-recovery preset checks are run separately.

## Fixed: stale Close Lobby and game-picker replies affect newer controls

Close Lobby replies now check the room lifecycle generation, and its confirmation
uses the same transition-aware cleanup as the game leave/exit dialogs. Game
selection replies belong to a specific pending selection and room; opening or
closing the picker invalidates older replies. An obsolete response cannot close
newer controls or unlock their pending action. Three regressions reproduced the
old behavior; all 96 client tests pass, and the full GameHub/SDK run passes 161 tests.

## Fixed: repeated Leave Game can restore a departed participant and stop a timer

The server rejects Leave Game from lobby waiters who are no longer participants
in the active match. Previously a repeated request still called the plugin; a
failure restored that player to the active participant set. Egyptian War also
suspended its turn timer before validating a removal, so a rejected removal left
the remaining players without a running deadline. It now suspends the timer only
after a successful removal. Regression tests reproduced both failures before the
fix, including expiration at the original deadline after a rejected removal.
All 91 game tests and 161 GameHub/SDK tests pass. A fresh production install
applies the updated patch and matches the independent game runtime.

## Additional engine audit

A deterministic exploratory run exercised 400 seeded Egyptian War games with
87,705 actions and departures across two to eight players. Checks found no lost
or duplicate cards, invalid active-turn indexes, or departed players retained in
challenges or winner references. This is invariant coverage, not a substitute for
full-length browser playtesting.

## Fixed: a departure-awarded pile inherits an almost-expired turn

If the challenger left while their responder had one second remaining, the
responder won the pile and remained the current player. The session treated this
as the same turn and gave them only that remaining second to begin the next pile.
It now detects pile-version changes during departure as a new turn, even when
the current player ID stays the same. Removing an unrelated player preserves the
original countdown.

Verification: both scenarios have regression tests; all 93 game tests pass.
The updated runtime is integrated into the normal GameHub install patch, and a
fresh production install applies it and matches the independent game files.
A separate seeded session audit exercised 69,713 pause, resume, disconnect,
reconnect, departure, action, and clock operations across 150 runs. It found no
lost or duplicate cards, active unpaused sessions without a turn timer, or paused
sessions with a running timer. These checks do not replace real-device playtests.

## Fixed: running games announce a disconnect pause after a host override

With two offline players, the host could resume play early, then receive a
"remains paused" announcement when one player reconnected. An individual
player's autoplay deadline could likewise say the game was waiting to continue,
and running snapshots retained a disconnect pause message.

Recovery announcements now consult the actual pause state. A running game says
it is continuing and exposes no pause message; a genuinely paused game retains
its waiting/resume guidance. Two regressions reproduced the contradictory
reconnect/deadline states. Host override, manual-pause, and departure-timer
regressions pass, as do all 95 game tests, the seeded session audit, and a fresh
production install.

## Fixed: a stale tab overwrites unrelated display preferences

Display dropdowns previously saved their entire startup cache. Changing a table
color in one tab could erase a card style or another game's choices saved by a
different tab. Writes now reread storage and merge only changed fields. Pending
fields survive storage failures and flush on a later successful change; the
current page still applies its choices immediately.

A shared browser lock serializes display writes where supported. Real Edge
checks exposed an intermittent loss when the lock was released immediately after
writing; keeping it through the storage task boundary resolved the reproduced
race across 15 consecutive browser runs. Those checks cover sequential and
concurrent saves, quota recovery, and reload. Three client regressions cover
unrelated choices and recovery with reads allowed or blocked; all 99 client tests
pass. Without Web Locks, fresh reads protect sequential changes but do not
promise atomic simultaneous writes. Temporary choices still require a successful
write before the page closes to survive reload.

## Fixed: rebinding a key erases other tabs' saved bindings

Keybind persistence also wrote an entire stale page cache. Rebinding one action
could erase another action, the General settings shortcut, or another game's
bindings saved elsewhere. Saving now rereads and validates storage, applies only
pending action changes, and retains them if persistence fails. Resetting to the
default deletes only that action's override; unbinding still stores null.
The current page's controls and active input subscriptions update immediately.

Five regressions cover external changes, default reset, unbinding, and recovery
with reads allowed or blocked; all 104 client tests pass. This synchronous path
preserves sequential cross-tab edits but does not guarantee atomic simultaneous
writes. Failed temporary changes require a later successful save before closing
the page to survive reload. Actual Edge tabs preserve separate keybind edits and
restore both after reload.

## Fixed: adjusting an audio slider overwrites unrelated saved volumes

Audio persistence now merges only changed categories into freshly loaded saved
settings. Adjusting game effects in one tab no longer replaces another tab's
music or join volume with an older cached value. Failed writes keep pending
category changes for a later successful save. Explicit global mute/unmute still
changes all categories, and local playback/controls update immediately.

Four audio tests pass, covering normal playback, external saves, failed-write
recovery with reads allowed or blocked, and global mute/unmute. As with the
synchronous keybind path, sequential cross-tab changes are preserved; exact
simultaneous writes are not guaranteed atomic. Actual Edge tabs preserve
independent category changes and restore the combined settings after reload.

## Fixed: SDK accepts numeric rule schemas the host cannot save

Registry validation accepted fractional numeric choices and off-step range
defaults, while the host rejects fractional rule values and slider values not on
an increment. A plugin could therefore load with settings that fail Save Settings
even without an edit. The registry now requires integer numeric values, integer
range bounds/steps, and an in-bounds default on a step starting at min. Valid
current Egyptian War settings remain accepted. A regression reproduces the old
acceptance and covers off-step defaults and fractional defaults/bounds/steps or
choices. SDK types and documentation describe the existing host constraint.
Verification: all 164 GameHub tests and nine SDK tests pass, including the
installed Egyptian War eight-player startup and package-sharing checks.

## Live-game browser verification

A real installed-package match completed after 95 moves between a 1366 by 768
laptop viewport and a 390 by 844 phone viewport. The laptop used the keyboard to
play cards; the phone used its Play button, and the host slapped visible doubles.
Each settled snapshot preserved the total of 54 cards across hands and pile. The
match reached the normal winner/game-ended event without browser script errors.
This covers one match in desktop Edge emulation, not physical devices, audible
output, every slap rule, or every possible full-game sequence.

## Fixed: Settings closure removes an exit confirmation's scroll lock

Choosing Exit/Leave from Settings previously hid Settings and immediately opened
the next confirmation. When Settings finished its fade, Bootstrap removed the
body's modal scroll lock even though the confirmation and backdrop remained.
A real Edge reproduction confirmed one visible Leave Game dialog with an
unlocked body.

The handoff now waits for Settings' hidden event before opening the appropriate
host/player/spectator confirmation. Opening-transition cleanup uses the existing
retry helper; lifecycle changes remove the queued handoff, and repeat clicks do
not queue duplicates. Five regressions cover all three roles and cancellation on
game completion or disconnect; all 109 client tests pass. Real Edge checks for
all three roles retain one confirmation, one backdrop, and the body scroll lock.

## Fixed: deferred game modules are missing from the browser host

The browser host copied module registrations only at construction. A module
script normally executes later, so a correctly registered module-delivered game
could still report that its browser client was not installed. The host now
lazily discovers pending registrations on has/mount without adding permanent
host listeners. A regression reproduced the missing late module.

A second real Edge reproduction delayed the fixture module response by 600 ms
while refreshing an active match. Session recovery ran before module registration
and failed to mount. The platform script now defers startup until the preceding
declared modules execute. The actual module fixture registers a minimal rendering
client rather than an empty export; browser checks cover initial mounting,
actions/state rendering, and active-match refresh with delayed module loading.
The server HTML integration check also verifies deferred platform startup and
module-before-platform ordering. Embedded Egyptian War keeps its existing script
delivery mode.

## Fixed: an obsolete player-lock rejection unlocks a newer entry request

A browser lock request could reject after its saved-player action had been
cancelled by disconnect and a new Create Room request had begun. The old catch
handler reset pending controls and reported an obsolete error. It now checks
pending claim identity before changing entry state. Two regressions cover stale
rejection protection and normal rejection/retry controls for the current claim.

## Fixed: failed restoration locks leave the reconnect overlay blocking retry

A current lock rejection restored some button states but left the reconnect
overlay visible for its full ten-second timeout. Manual rejoin had already
closed its offer, and automatic recovery still held a stale tab identity, so
neither immediately offered a retry. Current failures now stop the overlay and
return to the validated saved-player offer while retaining the saved token.
Release-as-new failures keep their existing offer. Two regressions cover manual
and automatic restoration without waiting for the recovery timeout.

## Fixed: an unsent chat draft follows the page into an unrelated room

A real Edge test typed a draft, ended the match, closed its room, and started a
new room on the same page. The old draft remained in the new game's chat input.
Egyptian War now clears that transient input during unmount. The same browser
flow passes, as do all 18 affected client regressions and the fresh production
install check. Server chat history, saved rules, and personal preferences are
unchanged; the fix is included in the current game patch.

## Fixed: lobby Settings retains an obsolete match disconnect countdown

Leaving a match or stopping spectating reset the local game flags but kept the
last disconnection list in Settings. Because lobby waiters stop receiving match
lifecycle updates, it could indefinitely show an old pause/countdown for a game
they were no longer viewing. Lobby transitions now clear and rerender only the
match-specific disconnection status. Room-level host recovery remains available.
Player and spectator regressions reproduce the stale text and verify cleanup.

## Fixed: approval failures invert newer room or toggle state

The join-approval checkbox used to invert its current value when a request failed.
A delayed failure could therefore change a newer room's policy display, and two
quick toggles could show an incorrect intermediate policy when replies arrived.
Failures now restore the last server-confirmed approval value and apply only to
the current host's room lifecycle. Two regressions reproduce the stale-room and
overlapping-toggle failures; server approval enforcement is unchanged.

## Fixed: clipboard fallback changes the room code after a room transition

The Copy code action passed the clicked room's code to the clipboard, but its
failure prompt read the room again after awaiting permission. If the room had
changed, it prompted a different code. It now captures one code for both paths,
matching the existing invite-link behavior. The host/guest copy regression also
covers delayed denial after moving to a different room.

## Fixed: unchanged turn snapshots rewrite the live announcement

Egyptian War replaced the turn live region's text on every state snapshot, even
when only the timer changed. MutationObserver coverage reproduced a redundant
live-region update with identical wording. The client now assigns text only when
it changes, retaining polite/atomic announcements for real turn, pause, and win
changes. The affected client suite passes; physical screen-reader output remains
untested. The current installed package and tracked patch include the fix.

## Fixed: invisible-only player names are admitted

A name consisting only of a zero-width joiner passed the length check and joined
with an apparently blank name. One validation condition now requires a character
other than whitespace, Unicode default-ignorable characters, or blank Braille.
The existing name regression covers these empty-looking names and still admits
visible compound emoji and text containing script joiners. No new name state or
normalization layer is introduced.

## Fixed: Settings shows a pause failure from an old room

A delayed Settings Pause failure could notify after disconnecting and entering
another room. The handler now checks the existing lifecycle generation before
showing the error. A regression reproduces the stale notification and verifies
that current-game failures still notify. No new state or change to server pause
behavior is needed.

## Fixed: leaving a match leaves stale player eligibility in the lobby list

A successful Leave Game removed the player from the active game but did not
broadcast the updated player list. Other clients still considered them playing,
so the in-game host-transfer dropdown could offer an ineligible target until
another membership event refreshed it. The server now calls the existing member
list broadcaster after a successful departure. The existing live-server leave
regression verifies the player changes from playing to waiting in the lobby;
server transfer authorization remains unchanged.

## Fixed: rounding a numeric setting can exceed its maximum

For a valid plugin range with minimum 5, maximum 14, and step 5, typing 14
rounded the number box to 15. Save Settings then submitted a value outside the
allowed range. The rounding expression now caps the step index at the highest
valid step. A regression covers both an upper bound between steps and an upper
bound on a step, including the submitted value. Egyptian War's existing ranges
already have aligned bounds, so its rule choices do not change.

## Fixed: a delayed rejoin offer overlaps Settings

An Edge reproduction delayed the saved-player check, opened Settings, and then
released the response. Both Settings and the rejoin modal became visible.
Saved-player offers now wait while a modal is open or finishing its closing
transition, then reuse the existing eligibility check after hidden.bs.modal.
No new recovery state is introduced. The regression covers both open and closing
dialogs and verifies that the eventual offer still submits the saved token.
The real Edge flow also passes, including a single backdrop and working rejoin.
All 120 client regressions pass. Live-browser checks cover manual/timed host
handoff, presets, scoreboard reset, reconnect identity, and pause controls. A
250-seed session audit passed 123,379 lifecycle/action/timer operations with
rotating reconnect ids and multiple decks, preserving cards and timer invariants.

## Fixed: revoked transport recovery restores a former room subscription

A live-server reproduction dropped a player's transport, kicked the disconnected
player, and reconnected the same client. Socket.IO recovered the old socket,
replayed room-lock updates sent after removal, and retained its former room
subscription even after the client created a different room. Later old-room
updates could therefore overwrite the new room's browser controls.

Recovery now checks the existing socket-to-room membership map before returning
a saved transport session. A revoked session is rejected before Socket.IO can
replay packets or rejoin its rooms; normal saved-player token handling remains
available. The live reproduction now receives neither replayed nor future
former-room updates. The regression also verifies that an authorized member can
still recover their original socket and that the revoked client can create and
control a new room. No new membership state or dependency is introduced.

## Fixed: recovered entry without its acknowledgement has no browser token

An Edge reproduction held a successful Create Room acknowledgement, dropped the
transport, and recovered the room. The browser entered the restored lobby but had
no saved reconnect token because the normal entry callback never ran. Refreshing
would lose that identity. Authorized transport recovery now rotates and sends a
token through the existing snapshot/token path, just as token-based restoration
does. The Edge flow now persists the token and returns to the same room after a
refresh. The recovery integration regression also verifies the fresh token works.

## Fixed: token restoration bypasses the chat cooldown

A live-server regression sent a chat message, restored the same player on a new
socket, and immediately sent another message successfully. The timestamp belonged
to the previous socket, so restoration reset the cooldown. It now belongs to the
existing room member through a weak map. Reconnects retain the wait; other players
can still send independently, and sending works after the cooldown expires.
The timestamp is not exposed in player data, written to disk, or retained after
the member object is discarded. No cleanup timer or stable-id map is needed.

Verification: all 35 server integration tests pass. Edge checks cover kicked
transport recovery and lost-entry-acknowledgement recovery through a refresh.
An 80-step mixed room audit preserves membership, active-player eligibility,
host ownership, and connection state across leaving, spectating, restarting,
transferring hosting, and token restoration.

## Accepted small-screen limit

Eight Egyptian War players and multiple disconnected-seat controls can leave a
very small central pile at 740 by 360 pixels. Further layout redesign is deferred
at the user's request. Normal landscape checks do not establish readability in
that crowded state. See the game's design and implementation documents.

At 280 pixels wide, opened side-panel tab names can clip. Checks at 320, 360,
and 390 pixels pass with readable tab names and no panel/control overlap in
both normal and expanded modes. Further shrinking for the 280-pixel case is
deferred under the same extreme-screen boundary rather than adding more layout
rules.

## Fixed: shortcuts override focused buttons

A game action bound to Enter intercepted focused buttons, submitted gameplay,
and prevented native activation. General Settings bound to Space or Enter had
the same problem before the game-only guard ran. The existing native-button
check now runs before both shortcut paths and covers Space, Enter, and
NumpadEnter; keybind capture still runs first. Regression groups reproduce the
old behavior, preserve native button activation, and verify shortcuts continue
working away from buttons. Saved bindings and presets are unchanged.

## Fixed: shortcuts resume before a modal finishes closing

Bootstrap removes show before a dialog's closing transition releases aria-modal
and its backdrop. Gameplay keys could act through the fading dialog, and the
Settings shortcut could open a second modal over another closing confirmation.
Both existing guards now include aria-modal, matching saved-player offers.
Regressions check the closing state and normal behavior after cleanup. Real
Edge checks verify actual Bootstrap transitions and native Enter activation.

## Fixed: an explicit host pause is dropped during a disconnect pause

The server treated Pause as a no-op whenever a game was already paused. That
also discarded a host's explicit pause during Egyptian War's automatic
reconnection pause. The player's return then resumed the game despite the
successful host request. Explicit pauses now reach the game's existing manual
pause handler; already-running Resume remains a no-op. A live-server regression
restores the disconnected player by token, verifies the game stays paused, and
checks that the host can resume. No extra pause state is introduced.

## Fixed: delayed room-control replies notify in another room

Held Kick, Lock Lobby, and host-transfer acknowledgements could display old
success/errors after closing their room and entering another. Their callbacks
now use the existing lifecycle generation. Paired regressions verify obsolete
responses stay silent and current failures still report. Room policies and
server permissions are unchanged; no new request tracking state is added.

## Fixed: room restoration discards the snapshot's lock state

The room-resumed handler assigned the server's lock state before showLobby,
which reset it to unlocked. It relied on a later room-lock-changed event to
correct the label and toggle direction. The assignment now follows showLobby.
The regression checks a locked snapshot immediately displays Locked and submits
an unlock request without requiring another event. Server lock enforcement is
unchanged.

## Fixed: vulnerable body-parser in the production lockfile

npm audit identified body-parser 2.3.0 under Express 5.2.1 as affected by
[GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), a crash
in compressed request-body handling. GameHub currently serves static assets
and uses Socket.IO without enabling Express body-parser middleware, so this
review did not reproduce an exposed GameHub request path for the advisory.
The compatible targeted update locks body-parser 2.4.0 and its required qs
6.16.1, leaving Express and package.json unchanged. npm audit --omit=dev now
reports zero known production vulnerabilities. A fresh offline production
installation still applies Egyptian War's existing patch and matches every
packaged runtime file.

## Fixed: undici advisories in browser-test dependencies

GameHub's jsdom dependency locked undici 8.11.2, and Egyptian War locked
8.12.1. npm audit reported affected EventSource, integrity-check, and response
content-encoding paths, including
[GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c).
Both development lockfiles now resolve the compatible 8.12.3 patch. Direct
dependency declarations are unchanged. These packages are test dependencies,
not Egyptian War's published runtime. Full npm audits for both repositories
now report zero known vulnerabilities.

## Corrected: README overstates chat-history lifetime

The README still described room-lifetime chat history after the match-isolation
fix. It now matches the server and architecture guide: only current-match viewers
receive history, lobby waiters do not, and history clears on match start/end.
No chat behavior or persistence setting changes in this documentation correction.

## Latest audit verification

- All 138 client regressions and all 36 live-server integration tests pass.
- All 206 root tests pass after the launcher and join-review corrections. Full type checks
  and the SDK's nine tests also pass.
- The actual npm run verify:packages check passes using the registry game
  artifact, a packed SDK, and the current patch in an isolated consumer.
- A clean Linux Node 24 container also passes fresh npm ci (including the game
  patch), full type checks, all 202 cross-platform root tests, and nine SDK tests.
  The four Windows launcher tests are skipped there and pass on Windows.
- The scoped SDK metadata and tarball can be downloaded without credentials.
- Egyptian War's 95 tests, type checks, and package dry-run pass in clean source
  copies on Windows and in a Linux Node 24 container. The Linux run installs
  dependencies fresh from the registry without npm credentials. This verifies
  the workflow commands on Linux, not a completed GitHub-hosted Actions run.
- A real eight-player Edge match finished in 209 moves without script errors or
  visible card-count drift. Keyboard/modal behavior passed separate Edge checks.
- Twenty repeated Edge match start/exit cycles kept exactly two game-action
  handlers, one keybind listener, and one display listener per mounted client.
  All subscriptions cleared on exit, with no browser script errors.
- All eight packaged audio files load and decode in Edge without media errors;
  physical audible output is not verified.
- One hundred eight-player slap races retained accepted attempts across a
  contender's disconnect/id remap, awarded one winner/stat, conserved all 54
  cards, and resumed their timers.
- Randomized session audits covered 267,297 manual-pause operations and another
  425,990 operations across randomized rules, deck counts, reconnect IDs, and
  membership changes without violating their timer/card invariants.
- An independent slap oracle matched 741,952 short-pile cases across all 64
  optional-rule combinations and every face-down penalty boundary.
- Permission checks denied 72 non-host mutations and 12 malformed host requests;
  80 mixed room transitions preserved membership and host eligibility.
- A further 304 malformed/unprivileged requests across 19 Socket.IO operations
  were rejected by an isolated server. Legitimate host pause/resume and guest
  gameplay still worked afterward; no additional fix was required.
- Native and token host recovery both clear handoff countdowns for other members
  and preserve host control; neither reproduced a stale countdown.

The new fixes change GameHub code, not Egyptian War's packaged runtime. Its
existing install patch remains unchanged. No package was published or repository
pushed during this audit.


## Local launcher retained a public tunnel

Switching from Public to Local left the existing tunnel running: omitting a
Compose profile does not stop services that are already running. Local mode now
explicitly stops the tunnel and starts only the GameHub service. If stopping the
tunnel fails, it aborts instead of reporting local-only operation.

Reproduced with isolated Docker services without exposing ports or touching the
running GameHub stack. Launcher regression tests stub Docker and verify both the
successful transition and the stop-failure path. See the [Compose profiles
documentation](https://docs.docker.com/compose/how-tos/profiles/).


## Delayed join-review errors belonged to an old room

Accept/Decline replies could still display an obsolete error after the host left
and created another room. They now use the existing room lifecycle guard, as
other room controls do. The paired regression cases reproduce the stale error
before the fix and verify that current-room failures still display afterward.


## Stop launcher falsely reported success after Docker failure

The Stop action always printed "GameHub has stopped", even when Compose failed
and containers could still be running. It now checks Docker's exit code and
reports failure before returning. Stubbed launcher tests cover success and
failure without stopping any actual containers.


## Cross-project starter review (2026-10-26)

The game template and Loaded Roulette's inherited placeholder score race shared
several bugs. Both now preserve points when a reconnect remaps the member ID,
reject disconnected-player actions, and stop advertising scoring or accepting
pause/resume after disposal. Browser clients reset the reused action button on
mount and ignore replies after destruction, so an old failure cannot notify a
replacement match. The example rule no longer claims that scoring uses turns.
These fixes apply to the score-race scaffold, not the planned roulette gameplay.

Both packages also installed SDK 1.0.1 as a runtime dependency. A packed consumer
with GameHub's SDK prerelease reproduced nested SDK copies before the fix. They
now declare a compatible peer range and keep 1.0.1 as a development dependency;
the same packed-consumer check verifies shared resolution after the fix. Neither
game has been added to GameHub's normal configuration.

Verification: nine tests and type checks pass in each scaffold after a fresh
standalone installation. A real Edge client running each game in an isolated
GameHub server preserves guest scores across token reconnects, handles host
pause/resume and scoring buttons, and exits without script errors. All 206
GameHub root tests, nine SDK tests, and 95 Egyptian War tests pass. npm audit
reports no known vulnerabilities in any of the four dependency lockfiles, and
tracked Markdown relative links resolve in all four repositories.

Template copying instructions now exclude .git so a new game does not inherit
the template's repository history and remote. Loaded Roulette's shared theft
rules now distinguish hand theft from Interception's future reward: an empty
hand blocks hand theft, but does not make a future reward ineligible.

Egyptian War's runtime and its install patch are unchanged in this pass. No
packages were published during this review.


## Additional pass: launcher transitions and offline requests (2026-10-26)

Public mode could select an expired address from retained logs after a tunnel
container restarted. It now obtains the current container start time and reads
only logs from that run using [Compose logs --since](https://docs.docker.com/reference/cli/docker/compose/logs/).
If container metadata is unavailable it does not fall back to an older address.
It also restores the caller's prior GAMEHUB_TRUST_CLOUDFLARE_IP setting, whether
unset, true, or false, including after a failed start. Sixteen isolated launcher
tests cover Local/Stop plus Public startup and metadata success/failure without
running Docker or touching the user's containers.

Real Edge/Socket.IO checks confirmed that offline game actions, chat, kicks,
and pause commands entered the send buffer. A focused lobby Lock button also
queued an offline mutation when activated with Enter behind the reconnecting
screen. All browser requests now use one sender that fails immediately while
disconnected, and gameplay shortcuts do not fire offline. Nine client regressions
cover game APIs, keyboard dispatch, lobby controls, and approval rollback. Real
Edge checks now verify an empty send buffer for both game and lobby paths.

The server previously sent the public invite address only on connection. Tabs
already connected during tunnel registration or clearing retained a stale value.
A registration-file observer now broadcasts validated changes to connected
clients, unless a fixed environment URL is configured. An isolated integration
test covers creation, replacement, and removal. A real Edge Copy Link check
confirms public/local fallback updates on the same socket and room, with no
per-click request. This pass does not verify a live Cloudflare tunnel.


Additional-pass verification: full type checks, all 228 GameHub root tests, and
all nine SDK tests pass. The root total includes 147 client tests, 37 live-server
integration tests, and 16 mocked Windows launcher tests. Real Edge checks cover
offline game APIs, focused lobby controls, and live invite-cache updates. The
Egyptian War runtime/patch and the two scaffold runtimes were not changed again
in this additional pass. No Docker daemon or live tunnel was used.


## Follow-up on the external bundle report (2026-10-26)

The report predates the SDK peer fixes in the template and Loaded Roulette,
Loaded Roulette's separate package/game identity, and Egyptian War's workflow.
Those changes are already present. GameHub's missing workflow is now added for
Node 24 on Linux and Windows, including package-artifact verification. The hub
now declares the same >=20 production runtime minimum as the SDK and games;
README guidance distinguishes this from newer development dependency needs.

The beta.6 JavaScript/browser patch omitted generated declarations and package
docs. Beta.7 now publishes the complete build, including scoreboard/slap-reason
declarations and both design and implementation notes. The artifact passed fresh
installation, 96 game tests, and TypeScript consumer checks with both stable and
prerelease SDKs. After the user approved the release and completed npm browser
authentication, beta.7 was published under the beta tag. GameHub now pins it and
the obsolete beta.6 patch is removed. The stable latest tag remains at 1.0.0.

The eight-player rules/seat overlap was reproduced: one seat was 29% covered at
1366x768 and 75% at 1024x768 with default rules. Expanded rules now scroll in the
available space above neighboring seats. Edge measurements show no rules/seat
overlap at the six tested laptop/phone viewports with default or all rules.
The normal GameHub build now receives the fix directly from the beta.7 package.
Phone panel assertions also pass at 320, 360, and 390 pixels in both panel sizes.
This does not change the accepted crowding limit on extremely short screens.


A separate clean GameHub checkout using the complete beta.7 tarball and no game
patch passes type checks and all 228 root tests. The source checkout reproduces
the exact reviewed artifact, whose published integrity matches the candidate.
The beta.6 patched build passed all tests before the upgrade; post-upgrade checks
use beta.7 from the registry without a game patch. The new workflow YAML is
validated locally; hosted results are checked after pushing the release changes.


Post-release verification: beta.7 is available from npm with the reviewed artifact
integrity and the beta tag; latest remains 1.0.0. The normal registry installation
and a fresh production npm ci use no game patch and include the corrected
TypeScript declarations and current design/implementation docs. GameHub's 228
root tests, nine SDK tests, Egyptian War's 96 tests, full type checks, and
registry artifact verification pass. Eight-player viewport checks also pass
using the published package. The game resolves the hub's single SDK copy.
See release-testing.md for the subsequent production Docker and live public-join checks.


## Production release smoke test (2026-10-27)

The actual Docker build passed its Linux tests, SDK tests, and registry package
verification using beta.7 without a game patch. The launcher passed Local,
Public, and Public-to-Local transitions in an isolated Compose project. The
first Quick Tunnel attempt returned HTTP 429; a later retry succeeded.

A real Edge guest joined through the public HTTPS invite while the host stayed
on localhost. Eight players started Egyptian War; card play, pause/resume, and
public refresh/rejoin passed without browser errors. Laptop and emulated-phone
checks found no seat/rules overlap or seats crossing the action controls. All
eight audio assets loaded and decoded through the tunnel. Temporary test
containers, network, tunnel, and the test image were removed afterwards.

Physical phones, audible playback, and a complete human-played match still need
manual testing. See [release testing](release-testing.md) for the checklist.


## Phone frame-rate follow-up (2026-10-27)

The reported recovery during resolution animations points to the turn timer,
which stops rendering while hidden. It previously changed width every 100 ms
while Bootstrap applied a 600 ms width transition. The source and beta.7 install
patch now use a left-origin scale transform with a 100 ms linear transition.
Seconds text and accessible percentage values are rewritten only when changed.
No blur, card rendering, server timing, or game rules were changed.

All 97 game tests pass, including unchanged-text mutation and timer fill/reset
regressions. Real Edge checks at 390x844 and 1366x768 confirm the half-full bar
has unchanged layout width, the expected transform/transition, and a working
live countdown. Registry artifact verification applies the patch successfully
to a fresh package installation. Physical-phone frame-rate improvement remains
unconfirmed; compare active play with resolutions on the reporting phone.


The physical-phone follow-up reported substantially smoother play, with an
occasional timer twitch. Repeated 100 ms transitions are now replaced with one
linear browser transform animation over the server-provided remaining time.
Pausing cancels and freezes the fill; resuming uses the remaining duration.
Normal, custom, and the server's four-second final-card slap window share this
code. The inherited gameplay backdrop blur is also disabled for the requested
comparison, leaving lobby blur intact.

All 98 game tests pass. Real Edge checks confirm one persistent 15-second
animation, frozen half-full pause, a 7.5-second resume, the four-second slap
duration, cleanup on unmount, gameplay blur disabled, and lobby blur preserved.
The updated patch applies to a fresh registry installation. The reporting
phone still needs testing for timer smoothness and any benefit from blur removal.


Gameplay blur is now an optional, default-off platform preference in Settings >
Graphics > General Graphics. The tab follows Game and also contains the existing
per-game dropdowns under Game-Specific Graphics. The Egyptian War stylesheet no
longer forces blur off, so users can compare it immediately. The preference is
browser-local, survives reload, and follows cross-tab changes without touching
rule presets or card/table preferences. Client coverage passes all 148 tests;
real Edge checks at widths 320, 360, 390, and 1366 show unclipped tabs, a fitting
graphics panel, gameplay blur toggling, and unchanged lobby blur.


Egyptian War now offers Shadows and glows (Full/Reduced), Flying hands and cards
(On/Off), and Table detail (Textured/Simple) in its existing Graphics dropdown
group. Defaults preserve the current appearance; options apply immediately and
use the existing browser-local display storage. These only change rendering: the
card pile, text, current/winner borders, sound cues, and server timings remain.
All 98 game tests pass, including live display subscription coverage. Real Edge
checks at 390x844 and 1366x768 confirm reduced seat/card shadows, hidden transient
effects, stopped dealing animation, simple felt retaining the chosen color,
visible card/turn feedback, and restoration of full visuals. Generated game
definitions and browser files are included in the beta.7 install patch, which
also passes fresh registry package verification. Phone performance benefit
remains for the user to compare with each setting individually.


The graphics follow-up exposed a menu regression: the newly inserted blur rule
split the shared `#entry-view, #lobby-view` selector and removed the menu's fluid
width/flex declarations. The original shared rule is restored and covered by a
style regression. Real Edge comparisons against the committed pre-graphics
stylesheet show identical menu width and height at 320x640, 390x844, 1024x768,
and 1920x1080, independent of the blur toggle.

At the user's request, Background blur now applies to the main menu, lobby,
games, and Settings button. It remains default-off and browser-local; the
original storage key is retained so existing choices survive. All 152 focused
client/style tests pass, and browser checks confirm all four targets switch
filters without changing menu dimensions.


All five general performance switches are now available in Graphics: reduced
shadows, simple backgrounds, reduced interface motion, disabled game previews,
and reduced transparency. They default off and save independently per browser.
Preview disabling explicitly pauses/unloads old videos and keeps only posters,
including after picker rerenders. Existing OS reduced-motion behavior remains
when videos are re-enabled. Opaque mode bypasses blur while preserving its saved
choice. Keyboard focus rings and the selected settings-tab highlight remain.

All 154 focused client/style tests pass, covering persistence, reload, cross-tab
updates, clearing preferences, preview stop/unload/restoration, and unchanged
menu sizing. Real Edge checks at 320x640, 390x844, and 1366x768 confirm fitting
controls, unchanged menu dimensions, removed interface shadows/gradients/motion,
opaque windows with no blur, and unchanged game dealing animation. Physical
device performance benefits remain for comparison.


Boolean game settings and join approval now reuse the same sliding On/Off
switches as General Graphics. Generated game-rule controls retain their input
IDs, checked values, host-only disabling, and preset/save behavior; descriptions
are associated through aria-describedby. Numeric sliders and dropdowns are
unchanged. The shared switch convention is recorded in AGENTS.md for future
settings. All 154 focused client/style tests pass, including host handoff and
preset regressions.


Join approval's title and description now share the left text column, reserving
a 16px gap before its switch at tested phone and laptop sizes. The description
is linked with aria-describedby. Editable game-rule On/Off labels use dark text
on the light settings modal; disabled controls retain muted labels. Opaque mode
leaves already-opaque modals in their existing light/dark palette rather than
overriding light modal backgrounds with a dark fill.


## Stable release preflight (2026-10-27)

The quick pre-publication pass found that the source client's three graphics
dataset assignments were missing while the installed patch still contained
them. The game test suite caught the mismatch. Restoring the assignments makes
source client/style files match the tested installed package; live display
regressions pass again. GameHub's full preflight passed type checks, 232 root
tests, and nine SDK tests. Publishing is deferred until the corrected stable
artifact passes the remaining checks.


Stable publication completed after npm browser authorization: Egyptian War
1.0.1 is available with the reviewed tarball integrity and the latest tag.
GameHub 1.1.0 now installs that registry version, without a game patch, and
shares the host SDK. Fresh registry artifact verification passes; source and
installed browser/definition files match. The game commit's GitHub verification
passed before preparing the GitHub releases.


Hosted stable-release verification first encountered npm's publication delay:
version metadata appeared before the public tarball became downloadable. A
later uncached, unauthenticated download matched the reviewed integrity, and a
fresh production npm ci passed without game patches. Windows CI then exposed
an LF-only selector matcher in the new menu style regression. The test now
normalizes CRLF before matching; application CSS and layout are unchanged.


## Basic Loaded Roulette prototype verification

The Add 1 scaffold is replaced by real, authoritative roulette reservations,
edits, lock/unlock, timers, once-only draws and settlement, qualifying ties, and
reconnect-safe ownership. Forty-two game tests and hub type checks, 232 root
tests, nine SDK tests, and two-package fresh-consumer verification pass.
Real Edge phone/laptop checks exercise click and actual chip dragging onto seam
targets, wheel reveal, payouts, and cleanup without browser errors or horizontal
overflow. An actual twelve-player hub match passed betting, host pause/resume,
server-result reveal, settlement, and the return to lobby. The production Docker
build and runtime package load also pass. Isolated server/browser resources and
the uniquely named Docker test image were cleaned up.

Chips are monetary representations rather than a finite inventory. A stack
starts at a $1 stake, increases per 10% of settled bankroll to ten chips, and
uses five 20% bands on phones. Exact stakes remain editable before locking.
The complete table fits without scrolling in either orientation. Seats 1-6 sit
below the board, with seats 7-12 above when present; the timer and chip tray
follow the lower seats. The information panel stays right in landscape and below in portrait.
Real Edge checks at five viewport sizes verify the twelve-player ordering and
fit. The ball eases into its pocket, then follows the wheel during one second
of braking; animation regression tests verify continuity and final alignment.

The reviewed private tarball is integrated into normal installation and Docker
without publishing to npm. Physical-phone touch/performance still needs the
user's check. Cards, shops, loans, and late entry remain explicitly unfinished.

The roulette shell now reuses Egyptian War's safe-area-aware full-window frame
with a 100rem width cap. Real-hub resize checks from 1920px through phone sizes
confirm stable game width while outer margins contract, continuous widths at
1400/1200/992px breakpoints, and no page or table scrolling.

Remaining roulette size jumps at compact-width/short-height breakpoints are
removed. Board-relative label and seam sizes include the vertical table; the
chip tray retains one layout while controls and spacing scale continuously.
Checks on both sides of 650px width and 450px height show small continuous
dimension changes with no page or board scrolling.

Roulette's ball now orbits outside its smaller colored ring and moves inward
on capture, with an 800ms startup ramp. Portrait gives the board a 58dvh cap
and larger surrounding controls. The shared Settings button mounts beside the
game actions through an optional toolbar slot; connection status and latency
reuse existing socket events. Real-hub checks confirm no button overlap from
360px to desktop widths, working settings, connected status/ping, return of the
shared toolbar after the match, and a complete twelve-player round. All 42 game
and 232 hub tests pass, along with SDK tests and type checks.

The roulette presentation now includes a spin-clock hand flick, static felt and
rail detail, and raised owner-colored chips with amount labels below the discs.
Outside labels use EVEN/ODD and 2 to 1; red/black wagers use accessible diamonds.
Portrait lets the bet panel fill leftover space beneath the chip tray. Wheel
numbers face inward inside separately bordered outer boxes; the ball crosses
that ring to land in an inner pocket. A pause-safe result zoom centers the
winning slot; reduced motion keeps only its highlight. All 45 roulette tests
pass. Real Edge phone/laptop checks verify hand timing, dragging, payout, and
winning-pocket camera alignment; a twelve-player hub match and multi-size
portrait gap/toolbar checks also pass.

Roulette now offers hover/focus/touch-hold coverage and stake previews, direct
editing from owned chip stacks, green seats with a diagonal LOCKED IN stamp,
and a scrollable per-bet result modal after the winning-pocket zoom. Receipts
include personal stake/return/net totals and can reopen during the match.
Native Escape/focus behavior is retained; phase advancement closes dialogs,
and lifecycle cleanup cancels popup/hold timers. All 50 game tests pass.
Real phone/laptop Edge checks exercise editing, synthetic-click suppression,
readiness, 60-card scrolling, modal reopening and Escape without page overflow;
a twelve-player GameHub round and toolbar/lobby restoration also pass. Sound
cues remain deferred.

Roulette's circular seam markers are replaced by oriented gold split strips,
corner squares, and labeled rectangular edge tabs. Desktop inside decorations
reveal near the pointer or on keyboard focus/drop; touch and hybrid devices
keep them visible. Chips and hit areas never hide. Cached geometry avoids
layout reads on every pointer move. All 51 game tests and fresh-package checks
pass. Real Edge checks verify desktop proximity/focus, touch visibility, chip
persistence, dragging/editing, and per-bet result dialogs without overflow.

## Post-push roulette interaction review

Reproduced and fixed reconnects moving a seat to the end of the player list,
normal state broadcasts dismissing manually reopened summaries, queued close
events clearing a newly reopened editor, canceled touch holds submitting their
synthetic click, and stale winner announcements after the server revokes a
pending win. Regression tests exercise each case. GameHub's shortcut routing
now recognizes native dialogs so Escape dismisses them instead of opening
Settings behind them; verified in the real hub. Type checks, 55 game tests,
232 hub tests, and SDK tests pass. These are targeted lifecycle/input fixes;
round timing, betting rules, saved presets, and published versions are unchanged.

Before committing the review fixes, an actual twelve-player GameHub/Edge session
passed the complete checklist: seat order after a socket-token reconnect,
rapid dialog close/reopen followed by a real edit, native Escape dismissal,
revoking a pending winner after removal, keeping reopened results visible while
another player bets, canceling a touch gesture without placing a wager, a normal
subsequent tap placing its wager, and toolbar restoration on return to lobby.
No browser errors occurred. A separate 250-game randomized lifecycle run covered
10,264 actions and 236 reconnects with valid bankroll/reservation invariants,
stable seats, and exactly one completion per game.
