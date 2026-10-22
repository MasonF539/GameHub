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

## Accepted small-screen limit

Eight Egyptian War players and multiple disconnected-seat controls can leave a
very small central pile at 740 by 360 pixels. Further layout redesign is deferred
at the user's request. Normal landscape checks do not establish readability in
that crowded state. See the game's design and implementation documents.
