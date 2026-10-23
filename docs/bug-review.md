# Current bug review

Review date: 2026-10-22. Findings describe the current unpublished checkout.

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

## Accepted small-screen limit

Eight Egyptian War players and multiple disconnected-seat controls can leave a
very small central pile at 740 by 360 pixels. Further layout redesign is deferred
at the user's request. Normal landscape checks do not establish readability in
that crowded state. See the game's design and implementation documents.
