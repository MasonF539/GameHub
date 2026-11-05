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
6. **Complete match:** finish a two-to-eight-player game. Check challenges, valid/invalid slaps, penalties, scoreboard totals and its reset confirmation. Restart and confirm the new game's chat starts empty.

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
