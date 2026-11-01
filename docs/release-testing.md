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
