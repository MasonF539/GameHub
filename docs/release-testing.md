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

To inspect manually, finish the first round, choose a card, and click Open cards.
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
requests cannot dismiss it. Confirmed choices now close immediately. Optional Open cards
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
selection auto-closes on the trusted state confirming a choice; Open cards
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
