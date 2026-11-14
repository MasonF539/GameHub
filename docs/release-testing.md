# Release testing

## Automated and live checks completed on 2026-10-27

- GameHub: type checks, 228 root tests, nine SDK tests, and registry artifact verification.
- Egyptian War beta.7: type checks, 96 tests, fresh installations, and TypeScript consumers using stable and prerelease SDK versions.
- Template and Loaded Roulette scaffold: type checks and nine tests each.
- Production Docker build and actual launcher Local/Public transitions.
- Live Cloudflare invite join with a localhost host, eight-player match startup, card play, pause/resume, and browser refresh/rejoin.
- Laptop and emulated-phone layouts, including expanded rules and side-panel controls.
- Eight audio assets fetched and decoded over the public tunnel.

The temporary public tunnel and test containers were removed after verification.
Emulation and audio decoding do not replace physical-device and audible checks.

## Manual checklist

1. **Public joining:** start Public mode, keep the host on localhost, and open Copy Link on a real phone using mobile data. Check the room code prefills, code copying works while hidden, and the guest joins. Return to Local mode and verify newly copied links use the local address.
2. **Phone layout:** try portrait and landscape, ideally with eight players. Show/hide slap rules, scroll long rules, and open/minimize/resize chat. Check seats, turn text, timer, Play, and Slap remain usable. Extremely small screens retain the documented crowding limit.
3. **Sound:** hear music and effects, change volume, mute/unmute, and return to the lobby. Check the appropriate music returns without duplicate playback.
4. **Recovery and saved preferences:** refresh, briefly lose connectivity, open a second tab, and close/reopen a player tab. Verify the intended player reconnects, active tabs are not taken over, and presets, themes, and panel preferences remain saved.
5. **Host controls:** test join approval and locked rooms. Disconnect a player for 60 seconds to check autoplay, and check an existing manual pause stays paused. Disconnect the host to check the 60-second transfer and the new host's pause/resume controls.
6. **Complete match:** finish a two-to-eight-player Egyptian War game. Check challenges, valid/invalid slaps, penalties, and scoreboard totals. Start a new match and confirm its scoreboard resets automatically and its chat starts empty.

Loaded Roulette now has a playable private prototype. Its current checks are
listed below; the historical scaffold results above predate roulette gameplay.


## Stable graphics release preflight

GameHub 1.1.0 passes type checks, 232 root tests, and nine SDK tests. Egyptian
War 1.0.1 passes type checks and all 98 tests. The pre-publication pass restored
three missing source graphics hooks; the reviewed stable artifact now matches
the tested source client/styles and installs with the stable SDK. Existing
manual checks above remain useful for physical-device comparison.


## Loaded Roulette card foundation (2026-10-28)

The private local package now includes 72 card definitions, private inventory,
sorted fans with duplicate counts, and 30-second reward drafts before betting
from round 2. Card effects are inactive, including negative-card penalties.
The normal build uses the refreshed vendor tarball, without npm publication.

Completed: game type checks and 68 tests; fresh-consumer artifact verification;
real Edge checks at 1366x768, 1024x768, 844x390, 390x844, and 360x740 with no page
overflow; real two-player GameHub reward rounds 2-4, private hands, pause/resume,
selection, and Escape dismissal with no browser errors.

To inspect manually, finish the first round, choose a card, and click Check cards.
Rounds 2/3 offer temporaries and round 4 permanents. Check polarity top left,
name top middle, duplicate count top right, and effect underneath. Wide screens
split chips and the fan evenly; portrait stacks them. Effects and payouts do
not interact yet. A connected timeout chooses randomly; an offline player gets
nothing, and reconnect retains previously owned cards.


Card presentation follow-up: real Edge checks at the five sizes above verify
5:7 card proportions, centered titles, separate Neutral/Risky indicators,
no overlap between full-size card rows, immediate hover glow and one-second
single-card enlargement, and fan clicks leaving the collection closed.
Unresolved reward selection has no Close button; Escape and native close
requests cannot dismiss it. Confirmed choices now close immediately. Optional Check cards
inspection keeps Close/Escape, and a server phase transition closes rewards.


Card-front follow-up checks place the type below the title and center effects
within the padded body; short text keeps its normal size while longer effects
shrink as needed. Fronts now have stronger silver/gold/purple colors with metallic
rails and etched borders. Back artwork remains unimplemented.

Texture corrections verified in Edge: clipped opaque card edges and patchy
shine; eight outward-positioned wheel diamonds; separate horizontal/vertical
board rail grain; irregular green felt patches; curved grain on the wheel's
brown rings; blue-gray neutral accents. Existing card readability, selection,
and viewport-fit checks pass at the five sizes above.

Follow-up: diamonds now sit at radius 131, just inward of the wood midpoint.
The colored card stripe is removed. Native CSS layers provide connected cross-hatched shading patches, and the lower card shine has moved inward and softened.
Five-size Edge layout/readability checks and phone/laptop wheel previews pass.

Felt patches now use continuous cross-hatched lines with a faint outward-fading
dark-green gradient. The upper-left card shine is softened and spread out.

Felt patches are now native CSS layers anchored to visible green betting lanes
in each orientation. The SVG texture asset is obsolete and removed. Reward
selection auto-closes on the trusted state confirming a choice; Check cards
remains usable while other players finish choosing.

Reward cards now support clicking the whole card or the separate Choose card
button below it. The scroll area's 32px gutters preserve the category glow
around first/last rows; native keyboard choice and pending-request guards remain.

Surface layering uses the green base, transparent Egyptian War-style felt,
cross-hatching, then betting cells and chips; textures ignore pointers.
Portrait patches are roughly a quarter smaller and scale with board dimensions.
The upper-left patch clears the top rail while extending above the numbered
grid. Card-dialog initial focus goes to its heading, avoiding a false initial
first-card highlight while preserving mouse and keyboard choice.


Loaded Roulette now has a 30-second Final Preparations phase after betting.
Check ready/cancel ready separately in both phases, play cards through Check cards,
and confirm Profit up, More draws, and Double or nothing consume one copy per
accepted play. Free wagers must not reserve or lose cash; results must show
card-adjusted returns and the separate profit gamble. Other cards remain
Preview only. Test pause/resume and refresh during preparations in both board
orientations. The updated private tarball is used by normal GameHub starts.


Call Bank and Last round results share a row below Loaded Roulette's wallet. Test quick amount buttons,
slider/input synchronization, fee previews, once-per-round borrowing, repayment
from available cash only, pause/lock restrictions, reconnect, and private loan
history. Verify that borrowing alone cannot win, and qualifying settlement
pays debt before winner comparison. Check bank scrolling at phone and short
landscape sizes. The bank shell is separate for future shark-mouth artwork.


Shop stage: round 1 stays basic roulette; rewards from round 2 lead into a
30-second shop. Check the striped booth fits without scrolling, with an extra
deal above the seven regular offers, personal before shared and permanent
cards on the right. Buy and inspect cards, verify exact price/stock/copy caps,
and use the bank without dismissing or locking the shop. Test Ready up/Cancel ready,
all-ready and timer advancement, pause/reconnect, spectator privacy, and a Shop
Reroll that affects only its owner. Prices use documented starting-cash/goal/average-net
weights; unsupported effects remain labeled Preview.

Shop verification completed: 101 game tests, 232 hub tests, SDK tests, and
fresh-consumer package/patch checks pass. Five-size Edge checks verify all eight
offers fit without scrolling, purchases and bank return work, and a bought
Profit up card can be played and pays the expected bonus. A real two-player hub
session passed purchases, in-shop borrowing, pause/resume, readiness, and native
Escape returning from Bank to Shop. No browser errors or document overflow
were observed in those checks.


Check cards is now present in Shop and Rewards. Verify a held Reward Reroll can
replace choices before selection without changing the timer or another player's
offers; Back to rewards/Escape must restore the picker. A newly selected copy
must wait for a later draft. Check the clicked card appears on the side sign, shop cards stay still,
and compact-screen taps open readable inspection. Only hand cards lift.

Reward Reroll verification: 108 game tests and fresh-package verification pass.
Edge checked a real owned card reroll, unchanged time and other-player choices,
return from the hand to the required picker, Shop Check cards, and an enlarged
popover above the booth at laptop, short landscape, and phone sizes. Five-size
shop checks still show all eight offers and controls without scrolling. The
hover preview uses full-size typography, not the shop's compact card styles.


Shop pricing now uses 2*startingCash + 2*max(0, averageNet) + goal/2 as its scale.
The average is frozen at Shop entry for all owners and rerolls. Type/rarity rates
are unchanged. Normal and deal prices round to whole units below 20 or nearest
five otherwise, minimum 1. Unit checks cover 2/12-player parity, outstanding
debt, stage refreshes, frozen rerolls, and positive safe integer outputs.


Current shop interaction checks: temporary/permanent dividers leave equal space
around the permanent offer. The discount tag sits on the detail board; only its
bottom area has a Buy card button. Shelf cards have prices beneath them and
support double-click/double-tap purchases (Shift+Enter for keyboard). Reroll is
first in the footer and hidden without an owned copy. Reroll in a compact view,
then widen it: the sign must show current stock. A delayed single click must not
open an obsolete offer. Final review: 124 game tests, 234 hub tests, 9 SDK tests,
eight-size Edge checks, and a real two-player hub session passed.


Public Effects stage: from round 2, Shop must advance to a fresh 30-second public
planning stage, then Betting. Check Ready up/Cancel ready, all-ready and timeout paths,
pause/disconnect/reconnect, hand inspection, spectator read-only state, and fresh
Betting readiness. Chips, purchases, personal/public preview effects, and new
loans must stay unavailable there; unlocked debt repayment is allowed. Round 1
continues to skip card-related stages. Profit Bonus and Profit Cut are implemented in Public Effects; targeted public
effects remain previews.


Card implementation checks: play Profit Bonus/Cut during Public Effects, verify
all players' payouts, cancellation, two-public-card limit, and the 80% reduction
cap. Check expiry next round and persistence after an owner leaves. Play Goal
Grant, Cash Bonus, Loan Relief, and Debt Reduction during Final Preparations;
verify cash versus available cash, original/latest debt capping, oldest-first
reduction, integer rounding, and no cash charge for relief. Useless relief/cash
cards must be retained. Retry each action without duplicate consumption. Winner
checks remain at settlement; modified bets must retain safe payout validation.

Card-effects verification: 141 game tests, type checks, and fresh-package
verification pass. Desktop/phone Edge checks played all six new cards through
the actual reward and hand UI, verified consumed inventory, retry safety, cash
versus debt, and modified public payouts without browser errors.


Card-play presentation: verify a confirmed card pops over the felt in a separate
noninteractive layer, using the same initial animation for every card. Local
public/personal plays close the hand to reveal the board; remote plays do not.
Target records add a second slide/shrink placement animation to the actual spot;
targeted card mechanics remain previews. Test repeated snapshots, duplicate
copies, reconnect baseline, new-round/unmount cleanup, resizing, and reduced
motion. Reroll presentations must not dismiss required Shop/Rewards stages.

Animation verification: 146 game tests and fresh-package verification pass.
Desktop/phone Edge checks verify all six effects pop over real board coordinates
above modal layers without intercepting controls. A simulated future target
record exercises the separate placement animation; this does not enable the
targeted card effect. Local hands close on confirmed plays and board layout
remains unchanged. No browser errors were observed.


Card drag verification: 151 game tests and fresh-package verification pass.
Edge mouse and emulated touch checks dragged all six new effects from the fan
and collection, including outside-drop restoration. Each valid drop submitted
once, consumed the card on the server, and triggered the confirmed board pop.
Preview/paused/ready/wrong-stage cards, rejected drops, pointer cancellation,
phase changes, synthetic clicks, and unmount cleanup have regression coverage.


Current public presentation behavior supersedes earlier all-card animation notes:
only public cards animate or issue play alerts. A shared server animation record
is sent to all players/spectators, including reconnects during the presentation.
The Public Effects clock is preserved and additional plays/readiness are blocked
for 1.4 seconds. Verify the hold does not clear manual/disconnect pauses, reset
the countdown, or survive disposal/game end. Personal cards/rerolls apply silently.
Purchased shelf/detail/inspection cards show diagonal gold SOLD OUT stamps,
while price text stays unchanged and accessible stock labels remain available.

Verification: 155 game tests and fresh-package verification passed. A three-view
Edge check (two players plus a phone spectator) verified shared animations,
sequential public plays, a frozen/resuming server/client clock, silent personal
application, and the gold -18-degree sold-out overlay without browser errors.


Animation audience correction: public cards still animate for all viewers and
hold the shared clock; personal/reroll cards now animate only for their owner,
with personal success alerts still disabled. Public animations are no longer
discarded in hidden tabs, and a missing initial board layout retains the play
until resize/visibility/ResizeObserver can present it. Delayed presentation uses
elapsed server-record time instead of restarting old animations.

Verification: 158 game tests and fresh-package checks pass. A real GameHub
Socket.IO browser run used two players and a phone spectator: both public plays
appeared on all three screens with the countdown held, while a personal Goal
Grant animated only for its owner and emitted no play alert. No browser errors.


Stage ribbons: Public Effects, Betting, and Final Preparations show a full-width
brief introduction on entry. Verify each accent/title, automatic dismissal,
repeat snapshots without replay, and no blocking of controls or game clocks.
Reduced motion shows stationary feedback. Other phases and unmount clear it.
Verification: 160 game tests and fresh-package checks passed; four-size Edge
checks covered desktop, short landscape, and 390/360px phones. All three ribbons
fit without scrolling and allowed pointer events through, with reduced motion
and cleanup passing and no browser errors.


Complete roulette catalogue pass: all 73 defined catalogue entries except Type
Reversal are active in the local package. Check passive bonuses/penalties,
public number targeting and effect removal/movement, private theft/trade
choices, generators, free betting rounds, and capped tax receipts. Type Reversal
must remain clearly labelled Preview only. Paid Sticky Fingers/Trade up choices
cannot be dismissed; unspent target selections can be cancelled. Test utility
cards during the spin, not just planning, and reconnect during a pending choice.

Verification: 226 game tests, type checks, and fresh-consumer package checks
passed. Real GameHub sockets with two players and a phone spectator confirmed
private target choice prompts, shared targeted public animations/held timer,
owner-only personal animation, and no personal-play alerts. Edge checks at
1366x768, 844x390, 390x844, and 360x740 verified choice dialogs, required drafts,
and no page overflow. Phone screenshots caught and corrected small/clipped
choice-card text. No browser errors were observed. Real-device performance and
full catalogue balance still need human playtesting.


Short Changed timing correction: winning bets earn 20% less profit during the
next round only, even when other losses make that round unprofitable. It does
not affect its acquisition round and expires after the affected round with
no wins, no bets, or suppression. Cold Streak still waits for its first winning
round. The reversed Short Changed rule is +20% with the same fixed duration;
Type Reversal itself remains a preview. Verified 229 game tests, type checks,
and fresh-consumer package checks; the local archive includes the correction.


Type Reversal is now active. Verify odd/even copy parity, +20% for the first
copy (maximum +100%), Negative to Positive exemption/current-polarity
suppression, retained growth/assignments, and unchanged committed effects.
Former positive temporary cards become automatic penalties at their applicable
stage; former negative personal cards become held playable positives.
Cross out's reversed Free Entry grants each participant one free straight-up
bet at 5% of their cash when Betting opens. Reversed Forced Sale offers one
temporary card from three choices. Reversed theft/interception must explain
who gave the recipient a card without leaking their hand or message publicly.

Verification: 264 game tests, type checks, and fresh-consumer package checks.
A real GameHub two-player/one-spectator Edge run verified random-recipient blind
gift choice, owner-only cause messages, a shared reversed placement animation,
Free Entry grants for both players, and phone/landscape viewport fit without
page overflow or browser errors. Regression coverage includes automatic public
queues resuming after host pause and committed effects retaining their sign.


Reversal follow-up review: stale paid theft selections now refresh only their
original still-held options, or immediately close if no options remain. The
private update is sent even when the chosen action fails; removed option IDs
are rejected. The reveal cost stays paid and no replacement hidden cards are
exposed. Two real-action regressions cover empty and partially valid choices.
Game verification now totals 266 tests, plus type/fresh-package checks.

Live verification of the stale-choice correction used actual GameHub sockets with two players and a spectator. The source spent the offered card while a phone recipient's reversed Go Fish prompt was open. Selecting the stale option immediately closed the phone dialog and restored Ready; the spectator received no private messages and no browser errors occurred.


Cross out follow-up: 270 game tests cover sequential host/guest plays,
shared-animation blocking, player-specific readiness, private disabled reasons,
and passive labels for negative permanents. Disabled manual-card controls now
show their actual blocker instead of always naming the required phase.
The previously reported persistent player-two block was not reproduced; if it
recurs, record the displayed reason. The local roulette archive includes these
changes.

Final refreshed-package browser check: host and phone guest both played normal Cross out; the guest's Ready blocker updated in the open card window, Cancel ready restored play, and the shared animation released correctly. A spectator also received the shared state; all three browsers reported no errors. Fresh-consumer package verification passed.


Direct targeting checks: eligible player cards and board spaces glow and accept
click/keyboard selection; cancellation clears all highlights. Blind theft shows
matching shuffled order to both participants, card faces only to the owner, and
backs only to the chooser. The owner cannot choose/cancel, and spectators must
receive neither identities nor options. Verify completion and reconnect cleanup.
276 game tests cover these paths alongside prior regressions.

Live verification passed with two players and a spectator: direct player targeting, a multi-card shared shuffled fan, owner-only faces, chooser-only selection, and cleanup on both clients. Phone layout had no page overflow or browser errors. Actual visible card-back proportions and owner-card opacity were checked. Direct Cross out targeting also passed for both players. Type checks, 276 game tests, and fresh package checks passed; GameHub's local archive is refreshed.

Card backs now automatically follow the hand owner's public player color. Optional card-back style metadata, controls, and generated style previews were removed. The shared approved design retains white borders; no rule/preset changes or saved preference are required. 277 game tests cover owner-color selection and live updates without rebuilding the chooser. Live multiplayer verification checks the victim's color is used on the thief's screen, alongside existing privacy and phone-layout checks.

Approved card fronts are now installed: temporary silver checkers with nested diamonds, public purple slashes with a framed diamond, and permanent gold cross-hatching with a center diamond plus eight smaller matching symbols. The legacy base selector was corrected so temporary cards use the approved texture inside the game. Both temporary HTML preview files were removed. 277 game tests, type checks, and fresh-package verification pass. Live two-player/one-spectator checks covered rewards, long permanent descriptions, shop texture/typography, hand inspection, owner-colored backs, theft privacy, and phone fit with no browser errors.


TODO implementation pass: 290 Loaded Roulette tests pass. Live two-player plus
spectator Edge checks verify first-round Betting -> Rolling, actual E/B/F/number
shortcuts, shark bank open/close, masked player/spot targeting, drag-to-prompt
without early animation, outside-spot Cross out, and a persistent winner summary
for every viewer after the room returns to the lobby. No page overflow or
browser errors were observed at 1366x768, 390x844, and 844x390. Audio registration
and cue delivery cover rolling wheel/ball, stage changes, hand hover, plays,
selection, bets, and victory; purchases use the same confirmed-action hook.
Original WAV assets and music are generated by the game repository's script.
Real-device listening remains necessary for subjective sound/volume feedback.

The hub now permits only explicitly opted-in native-game-dialog shortcuts and
persists opted-in game completion dialogs. Regression tests cover text entry,
ordinary/external/application modal guards, summary label uniqueness, and style
cleanup. Loaded Roulette TODO items 1-9 are checked; item 10 remains pending at
the user's request. The user's TODO remains a local untracked file.


Ending follow-up: the authoritative finished state holds for three seconds with
only the winner and net balance on the board. The lobby then opens a separate
most-used-card review. The closed review is marked only after final content is
ready and the marker is cleared when a new game mounts. Verified all three real
browser clients (two players and one spectator) receive both steps without errors.
R readies/cancels Ready, F opens last results, and the place-chip binding is removed.
The Shop permits R. All 294 game tests and five focused Hub dialog/router tests pass;
the local package consumer verification passes. No npm release was made.


Follow-up fixes: toasts now use a manual top-layer popover inside the active
native dialog's focus scope and follow native dialog open/close events. Real
browser hit testing and clicking verified an alert above the bank; all three
multiplayer clients completed the theft flow without console errors. Stealing
fan hover preserves the right-hand cards' stacking order. Specialist selections
are required after Shop and resolve on deadline. Third Times the Charm permits
paid stakes above its free coverage. A 20,000 even-money win is verified to return
40,000 before a separately recorded 31,250 debt repayment. Payout receipts now
show base return/card adjustment and summary tax/fee adjustments. 301 game tests
and 155 focused Hub tests passed before the final full Hub run.


Final activation-alert follow-up: owner-only messages cover Third Times the Charm,
More Cards, More Choices, and More the Merrier on their active schedules. Constant
passives remain quiet. Multiple messages in one snapshot are grouped; repeated
snapshots and pause/resume do not replay notices. Final local package verification
passed with 306 game tests; the full Hub suite passed all 239 tests. No publish,
commit, or push was performed for this work.


Free-stake recheck: regression coverage now includes placing all 32,000 without
any owned cards, another participant's active Third Times the Charm, a non-owner
receiving Free Entry bets, and the client's Max action with free bets already on
the table. All four pass; all 310 game tests pass. The removed free-round-limit
error is absent from source, built output, and the installed package. Source and
installed client/session files match. A running Node process or Docker image
started before the fix must be restarted/rebuilt to replace the old validation.


Stolen-card reveal: private transfer receipts now drive a back-to-front card
reveal for the recipient, including random steals and intercepted rewards.
Receipts survive immediate consumption of negative cards and are bounded to eight
per recipient. Tests cover privacy, exact identity, repeated snapshots, and no
history replay on mount. All 313 game tests and local package verification pass.
The live two-player-plus-spectator browser check confirmed the exact received card
appeared for the thief while neither the victim nor spectator received that
private reveal; no console errors or horizontal overflow were observed.


Inventory follow-up: instant-effect card plays keep the collection open, with a
server-confirmed name/effect message inside it. Play animations remain on the
board behind the inventory; target/continuation prompts still close the collection.
Received-card reveals remain distinct. All 317 game tests and local package checks
pass. Real desktop (1366x768) and phone (390x844) browser checks confirmed the open
inventory, visible success feedback, and animation layering without console errors.


Wheel/hover follow-up: the last 750 ms of the existing six-second Rolling stage
is a stationary winning-pocket reveal. Motion and rolling sound cues finish
before that interval, and settlement updates balances only afterward. The real
browser run verified finished rotor animations, the displayed/highlighted winning
pocket, unchanged cash during the hold, and the subsequent payout. It also checked
a readable hover preview from the bottom hand and no such overlay from inventory
cards. All 320 game tests and installed-package verification pass; the three live
clients reported no console errors. No release or Git push was performed.


Double or Nothing result presentation now stays inside the original winning-bet
boxes. Each explains the roulette win followed by the gamble win/loss, and labels
bet profit before the gamble. The round summary explicitly says the profit was
doubled or removed. The separate gamble receipt box is removed. Regression checks
cover both gamble outcomes and free bets; all 322 game tests and installed-package
verification pass. No payout rules were changed by this presentation update.


Remaining agreed cards: Split Decision, Street Hustle, Clean Slate, Good Standing,
Publicity, Reassignment, Quick Sale, On Hold, and Reseller are implemented and
included in the normal local package. All 341 game tests and package-consumer
checks pass. Real desktop/phone players successfully used On Hold and carried an
offer into the next Shop at its locked price/discount, sold cards through Reseller,
and bought the held offer. Shops kept eight offers with no horizontal overflow;
all three clients reported no console errors. Quick Sale supports negative cards;
Reseller excludes currently negative cards. Approved utility reversal behavior is
documented and tested. Type Reversal's "including the first copy" phrase is removed.
No package release, commit, or push was performed during this implementation.

## Late joining, catch-up and reward-choice verification (2026-11-04)

- Spectators enter only at a normal round boundary when enabled by the host,
  with configured or inherited entry cash and a distinct active seat color.
  Capacity stays twelve; tiebreakers admit no new contenders.
- Returning participants keep money, debt, cards and stable ownership. Half of
  missed normal temporary/permanent rewards, rounded up separately, become
  private two-choice drafts at the next connected reward stage. More Cards
  bonuses are excluded; unchosen assistance survives another disconnect.
- Timeout rechecks ownership caps, preventing a traded-for capped card from
  silently consuming an ordinary or catch-up reward. Required paid card choices
  block early Shop entry but still resolve at the existing deadline.
- Real socket tests cover promotion permissions, room lists and reconnecting as
  a player. Three-client Edge checks with production timers verified next-round
  admission, phone catch-up selection and inventory access without remounting,
  horizontal overflow or JavaScript errors.
- All 365 roulette tests and 244 GameHub tests pass. Packed-consumer verification
  passes, including the reviewed local game tarball and stable Egyptian War patch.


## Imported MP3 audio and playback verification (2026-11-04)

- Betting uses three bet-chips variations; card plays use two card-play clips.
  Random choices avoid immediate repeats. Picking and hovering use their own
  card-pick and card-hover clips; purchase/stage/winner cues use buy-card,
  stage-change and game-win MP3s. Both games use background-music.mp3.
- Original remaining WAV placeholders were converted to actual MP3, with browser
  decoding checks. The generator requires Python lameenc and leaves imported
  effect recordings untouched. User-trimmed wheel/ball clips are included.
- Card animations emit one sound, including repeated snapshots. Spin clips start
  once and stop at pause, landing, phase exit, hiding and unmount; resume starts
  a fresh playback. Hovering replaces the preceding longer hover clip.
- Optional platform stop handles are idempotent. Active effects follow live
  category volume, stop when muted/hidden, and release tracking on completion,
  load error or rejected playback. Older plugins may ignore the return value.
- Three-client browser checks verified spin playback, pause/resume and landing
  cleanup; nine imported MP3s decoded successfully. Tone and loudness remain
  subjective listening checks. Targeted audio regressions and package checks pass.
- The stable Egyptian War patch renames its existing music file and registration
  together; it applies on fresh package-consumer installation.


## Shared scoreboard shortcut and roulette totals

- General Scoreboard defaults to Tab. It opens game-owned scoreboards for players
  and spectators while dialogs, typing, menus and Shift+Tab keep normal focus.
- Both games use a Scoreboard heading and place server-measured ping in the
  rightmost column, with Offline/Left states and no stale ping sorting.
- Roulette has a bottom-right access button and room-persistent wins, cash gained,
  cash spent, bets won, committed cards played and biggest single-bet profit.
  Spent cash includes stakes, purchases, repayments, fees and deductions; canceled
  reservations are excluded. Borrowing/starting cash do not inflate income, and
  debt incurred is not counted again before cash repayment.
- Biggest bet profit uses max aggregation across matches; normal counters accept
  positive integer amounts. Invalid numeric values are ignored by the host.
- All 369 roulette tests and 247 GameHub tests passed. Targeted Egyptian War tests
  passed, as did fresh package-consumer installation and patch verification.
- Live desktop and 390px phone checks verified Tab and button access, actual RTT
  values, bottom-right placement, settled cash-spending updates, safe text, and
  no horizontal page overflow or JavaScript errors. Roulette's secondary
  explanatory text was removed; detailed field meanings remain in game docs.


## Egyptian War scoreboard modal

- The panel keeps only Chat and Spectators as pages; its Scoreboard button and
  the general Tab shortcut open a separate native modal without expanding chat.
- Close/Escape restore focus, and leaving the game closes the modal. Host reset
  confirmation stays accessible above the game; canceling returns to the scores.
  The same reset-confirmation fix applies to the roulette scoreboard.
- All 23 Egyptian War layout tests and both targeted roulette scoreboard tests
  pass. Fresh package-consumer verification passes with the refreshed patch.
- Real-browser checks at 1366x768 and 390x844 verified both openers, ping columns,
  reset/cancel, no horizontal page overflow and no JavaScript errors.


## Match scoreboard lifecycle and card-hover audio

- Both games have no Reset totals button or manual-reset action. Scoreboards
  update live, retain the current match through reconnects, and clear on the next
  game start. Failed starts restore the previous scoreboard.
- Roulette restarts card-hover audio on each newly entered hand/theft card,
  including rapid movement; nested elements in the same card do not retrigger it.
- This supersedes the earlier cross-match totals and reset-confirmation behavior.
- Verification passed: 370 roulette tests, 22 Egyptian War layout checks, 144 hub
  UI checks, the full server integration suite and fresh package-consumer checks.
  Live desktop/phone checks confirm both scoreboard modals have no reset action.


## Browser-client startup recovery

- Start checks browser-module registration before asking the server to start.
  Missing modules show a refresh instruction without creating an active match.
- A missing or throwing client after a server start returns the host's match to
  the lobby, or releases a guest's seat. Start stays disabled while the room is
  active. Other clients' healthy matches are not closed by a guest load failure.
- HTML is rebuilt from the current shell and installed game templates on each
  page request, with no-store caching, avoiding startup-cached markup paired with
  newly installed scripts. Restart the running server to adopt this host fix,
  then reload existing browser tabs.
- Verification: 148 browser-controller tests and targeted HTTP/lifecycle tests
  pass. Real-browser failed-script/mount recovery and normal starts for both
  installed games pass, including desktop/phone scoreboard access.


## Fresh-install client registration and final scoreboard UI

- Regenerated the Egyptian War patch with surrounding context. Zero-context
  insertions had incorrectly scoped scoreboard helpers in fresh Docker installs.
  The verifier now executes freshly installed classic scripts against their own
  markup and checks browser-module registration, reproducing the old failure.
- Roulette columns are Bets won, Money gained, Money spent, Cards played,
  Biggest bet win, then Ping. Match wins are omitted. Both games remove their
  old in-game status dots; disconnected rows show an accessible unplugged-cables
  icon in the Ping column, while former participants still show Left.
- Docker build passed 245 hub tests, 9 SDK tests and fresh-consumer verification.
  Live tests against the rebuilt container passed both game starts, scoreboards,
  exact Roulette headings, removed dots, a real disconnected row, and no browser
  errors on desktop and phone.


## Public-card picker responsiveness and scoreboard toggle

- Public target dimming batches geometry reads and SVG writes. Pending card plays
  disable existing inventory controls instead of rebuilding the whole inventory;
  the prompt closes that inventory before refreshing the hand.
- A 40-card, all-spot browser scenario at 4x CPU throttling fell from roughly
  117 ms to 31 ms for prompt processing; mask layout fell from 80 ms to 5 ms.
  These are local simulated-device measurements, not physical-phone timings.
- All 371 Roulette tests pass, including delayed acknowledgement/Cancel behavior.
  Combined hub UI and Egyptian War layout checks pass (170 tests).
- Tab toggles both scoreboards; Shift+Tab navigates their controls, Escape closes
  them, and other dialogs keep normal Tab behavior. Settings explains this.
- The rebuilt Docker image passed its hub/SDK tests and fresh-install client
  verification. Live desktop/phone checks against the running container passed
  Tab open/close/reopen and preserved Shift+Tab behavior for both scoreboards.


## Cross-game review isolation, shop performance and phone details (2026-11-10)

- A completed game can clone only its own lobby review. Old Roulette review
  markers clear on mount/unmount; Egyptian War must not open that review.
- Shop snapshots/pending requests preserve existing stock and selected-card DOM.
  Changed stock/prices and viewport changes still update. Text fitting batches
  layout work, and hidden hand refresh is deferred while the shop covers it.
- Narrow phones and short touch landscape get a collapsed wallet tray; its
  centered tab expands details full-screen. Collapse/Escape restore it, and
  Bank/Scoreboard/choices remain accessible without duplicate controls.
- 377 Roulette tests and 149 hub UI tests pass. Desktop, small-phone and landscape
  browser checks pass, including shop inspection and rotation. The reported
  white panel was not reproduced; check the affected iPhone/browser again.

Live installed-build verification also passed a two-player round through rewards,
shop, bank access and Public Effects, then a Roulette review followed by Egyptian
War completion. The old review did not reappear; no browser errors occurred.


## Ongoing Roulette optimization audit (2026-11-10)

The browser retains unchanged player seats, chip stacks, full bet lists,
card-activity rows and loan-history rows. Public-effect labels no longer
accumulate across snapshots, and closed scoreboards defer table construction.
Server reservations are summed once per snapshot without changing action checks
or defensive copies. Timing, broadcast frequency, visual simplification and
protocol changes remain proposals in roulette-optimization-review.md.

- Follow-up updates retain unaffected individual seats and chip locations during
  changing wagers, cache immutable card-definition lookups, and preserve target
  keyboard focus. All 383 game tests passed. Differential testing across eight
  twelve-player matches compared 11,247 actions and 19,296 viewer snapshots with
  identical results after opaque ID normalization. No phase timing, RNG order,
  money rules, broadcast frequency, or payload contract was changed.


## Roulette payout rebalance and document consolidation (2026-11-11)

Winning paid-bet percentage modifiers now apply to the full base return,
including the stake. Positive payout bonus values, growth and caps are halved;
negative card magnitudes stay unchanged. Fractional percentage rates remain
exact until whole-money settlement. Non-payout grants, debt relief, refunds,
taxes, prices, free-stake coverage and round-wide profit gambles keep their rules.
Type Reversal flips each revised value without resetting accumulated progress.

The 80% reduction cap now applies to base payout; matching wagers can therefore
have negative net profit. Taxes, Debt Collector and biggest-win reporting guard
against treating those negative profits as a payment or relief in reverse.

Verification: 391 game tests and type checks passed. Equal 360-stake coverage
with red/black, three dozens or all 36 nonzero straight-ups returns 396 under a
uniform +10% payout bonus; zero loses all three. The same nonzero comparison
passed against GameHub's actual installed package. Fresh-consumer verification
and the live shop/review browser smoke check passed. The local vendor package
is refreshed; no registry publication is needed for this development change.

The game design replaces resolved bracket prompts with current behavior and
collects deferred choices. The implementation reference now describes actual
modules and current lifecycle rules rather than retaining duplicate dated plans.
Card values, reversal descriptions and README terminology match the new formula.


## Card Theft stage and shop availability (2026-11-11)

From round 2 the order is Rewards -> Shop -> Card Theft -> Public Effects ->
Betting -> Final Preparations. Card Theft has 30 seconds, reversible readiness,
its own banner, and no chip dock. All seven theft/swap cards, including Sleight
of Hand and reversed thefts, use it. Other card plays wait. Discard, Trade up,
and Roll down work in the other planning phases, but not Rolling or Results.
Already-maxed offers use diagonal ribbons without moving their card/price rows.

Type checks and 427 Roulette tests passed. Fresh package verification and
installed payout regressions passed. Browser checks cover two connected clients,
phone/desktop stage transitions and four shop layouts. A fresh installed-package
24-match lifecycle simulation checked 55,798 actions and 126,845 snapshots
without ledger or privacy failures. Physical Safari/phone performance and a
public tunnel remain outside these local checks.

For a manual playtest, try a blind steal and Sleight of Hand during Card Theft,
confirm the victim cannot discard/trade to dodge it, let a paid choice time out,
and check that normal utilities become available again in Public Effects.


## Bank cap and flat-chip markings (2026-11-12)

The loan cap uses starting cash and average participant net rather than goal:
50% of starting cash + 25% of nonnegative average net, rounded down and frozen
per round. Default 100,000 starting/average cash gives a 75,000 cap. Tests cover
round changes, overspending, debt, offline/departed players and negative-net
flooring. Flat chip faces retain eight identical edge inserts across tray,
board and drag visuals, with readable centered amounts.

Validation: all 439 game tests and type checks, normal local-package update and
fresh consumer verification, desktop/phone browser checks and an installed-bank
boundary/surcharge smoke test passed. Real-device performance remains unmeasured.


Final pre-commit checks on 2026-11-12 passed 440 Roulette, 246 Hub and 9 SDK
tests plus type checks and fresh package verification. The added shop regression
preserves a purchased deal's price and discount when a later modifier is played.


## Continued bug review (2026-11-13)

Fixed purchased shop quotes being recalculated after personal price modifiers
changed, bank debt previews differing from exact server rounding at very large
balances, and controls advertising actions while required card choices blocked
them. Optional card targeting also disables readiness until completed or
cancelled. Bank percentage presets now floor exactly rather than occasionally
rounding a 75% repayment up by one dollar near the safe-integer limit.

Validation: 448 Roulette tests and type checks pass. The normal package refresh
and fresh-consumer verification pass. An expanded 60-match installed-game simulation
passed 129,086 actions and 294,704 snapshots, covering all 87 card types with
the final preset correction included. A clean production Docker build and live
two-player create/join, loan limit/privacy, round cap, and Shop -> Card Theft ->
Public Effects -> Betting checks passed before that preset-only correction.
Physical phone performance and public tunnel behavior remain untested here.

Egyptian War also passed its type checks and all 99 regression tests without
source changes during this review.

A second 60-match low-cash simulation passed 95,446 actions and 251,870 state
checks, again covering all 87 card types. Real-Edge renderer checks passed at
1366x768, 768x1024, 390x844 and 360x740 with all 157 targets present, no page
scrolling, and working Bank/Shop dialogs without JavaScript errors. Renderer
checks use stubbed platform services; see the optimization review for scope
and the full-inventory measurement left for review.


## Card-choice cancellation follow-up (2026-11-13)

Reproduced and fixed a stale cancellation dismissing a newer optional prompt
in the same phase. A supplied selection ID must now match the current prompt;
legacy callers that omit it retain their existing behavior.

Also reproduced enabled Cancel buttons during pause. Board and dialog Cancel
controls now share the pause, public-animation and pending-request guards used
by their choices. Escape obeys those restrictions too. Required prompts remain
non-cancellable. New regressions failed before each fix and pass afterward.

All 451 Roulette tests, type checks, the normal local package update, and
fresh-consumer verification pass. No gameplay values or card ordering changed.


## Interrupted chip-drag follow-up (2026-11-13)

Reproduced a chip ghost and active gesture surviving browser focus loss. The
existing blur handler now cancels chip dragging as well as card dragging. A
second failing check showed that the cancelled drag's trailing click could
still place a wager; moving chip cancellation now suppresses that click using
the existing 350ms drop guard. Ordinary chip selection and valid drops retain
their behavior.

All 452 Roulette tests, type checks, normal local-package integration and
fresh-consumer verification pass. A real-Edge mouse-input check confirmed the
ghost disappears on blur and releasing over the board submits no wager. The
four viewport and Bank/Shop checks also pass with the installed package.


## Automatic-results dialog follow-up (2026-11-13)

Reproduced the delayed results popup opening over a scoreboard or Bank panel
that the player had just opened. The automatic opener now respects all open
native dialogs as well as platform modals, instead of checking only the card
inventory. Results remain available manually; normal automatic opening works
when no dialog is open. Both interrupted-panel regressions failed before the
guard and pass afterward.

All 454 Roulette tests, type checks, normal local-package integration and
fresh-consumer verification pass.


## Departure-choice fixes and commit checkpoint (2026-11-13)

A permanently departed player no longer resolves an unfinished paid theft at a
later phase deadline. Removing a player also closes selections already bound
to that player as victim or reversed-gift source, with a private explanation.
This prevents impossible required pickers from blocking readiness. Paid costs
remain paid; unpaid cards stay owned. Temporary disconnects preserve prompts.

Regressions cover normal Go Fish and Sticky Fingers, both reversed recipient
choices, the departure-time theft, and disconnect/reconnect preservation. All
459 Roulette tests, type checks, normal package refresh and fresh-consumer
verification pass.

The final installed-game stress run passed 18 games, 38,852 actions and 88,141
state checks across all 87 card types. Roulette source checkpoint: d5923f9.


## Cross-project review (2026-11-14)

The game template now recovers from rejected action promises instead of leaving
the action button locked. Late failures from a destroyed instance do not notify
or change its replacement. Immediate pause events disable scoring while waiting
for the next snapshot, and resume does not override server permissions. Three
new regressions failed before these fixes; all 12 template tests and type checks
now pass. The template is not a configured runtime game, so no game archive or
registry version changed for these template fixes.

Hub game-context initialization failures now use existing unmount cleanup,
hiding package markup and disabling game CSS before retry. The regression
failed before the cleanup guard; all 247 Hub and 9 SDK tests and type checks
pass. Egyptian War also passed its 99 tests and type checks without source
changes in this pass.

Roulette also passed all 459 tests and type checks in this cross-project pass.
The current manual checklist now checks automatic scoreboard reset; the removed
Reset Totals confirmation is no longer a testing step.


Sensitive-file follow-up: Git and Docker exclusions now cover `.env`, `.env.*`,
`*.pem` and `secrets/` in all four repositories, with nested Docker rules. No
matching tracked filenames were found. Synthetic fixtures verified all eight
root/nested paths per repository in Git and real Docker exports. Agent guidance
records no reads of those paths and no automatic fetching/embedding of external
images. No actual secret contents, permission profiles or application rendering
settings were read or changed. See `docs/security-boundaries.md` for limits.
