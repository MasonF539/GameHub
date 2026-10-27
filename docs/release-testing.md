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

Loaded Roulette currently remains a scaffold with a documented implementation
plan; roulette gameplay is not available for testing yet.


## Stable graphics release preflight

GameHub 1.1.0 passes type checks, 232 root tests, and nine SDK tests. Egyptian
War 1.0.1 passes type checks and all 98 tests. The pre-publication pass restored
three missing source graphics hooks; the reviewed stable artifact now matches
the tested source client/styles and installs with the stable SDK. Existing
manual checks above remain useful for physical-device comparison.
