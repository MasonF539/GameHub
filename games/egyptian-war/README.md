# Egyptian War for GameHub

This directory contains the server-authoritative Egyptian War game plugin for
GameHub and is exported to the `egyptian-war-standalone` branch for release.

Egyptian War is designed to be installed and run by GameHub through the
`@masonf539/game-sdk` contracts. It is independently versioned, but it is not a
standalone web application and depends on GameHub for rooms, networking, the
lobby, shared settings, and browser hosting.

The package owns its rules, state engine, slap arbitration, tests, browser
presentation, game-specific audio, preview media, and design documentation.
GameHub supplies rooms, members, spectators, transport, and shared services.

`src/session.ts` owns the authoritative runtime lifecycle, including turn
timers, slap collection, pause/disconnect recovery, animations, member
removal, and completion. `public/client.js` owns the browser controller and
registers it with GameHub's generic client host.

Game-specific music, effects, and picker previews live under `public/assets`
and are served by GameHub from `/games/egyptian-war`.
The package-owned `public/register.js` registers those sounds with GameHub's
shared audio service.
The game board lives in `public/template.html`, and its presentation lives in
`public/style.css`. GameHub injects the fragment into a package-specific root;
the browser controller scopes its element lookups to that root.
During active play, the stylesheet fixes the board to the available viewport,
accounts for mobile safe areas, and keeps its compact Pause/connection row
below GameHub's Settings shortcut. Full Screen and confirmed Exit/Leave
actions remain platform-owned controls in GameHub's reusable Game tab.

The package consumes an exact `@masonf539/game-sdk` release. Once both packages
are published, GameHub installs an exact Egyptian War version and enables it
through `gamehub.config.json`. GameHub's `npm run verify:packages` command
currently verifies that both packed artifacts work without monorepo source.

## Slap rules and penalties

Slap patterns are validated by the server and configured in the lobby. The
"Three in a Row" pattern checks the latest three cards for an ascending or
descending rank sequence, including Ace-low and Ace-high sequences. The
"Tens" pattern checks only two directly adjacent number cards that total ten;
an Ace counts as one. An active player who false-slaps forfeits the configured
number of cards, up to the number they hold. An eliminated player has no cards
to forfeit, so a false slap instead makes them miss the next card's slap
opportunity. A valid slap can still let an eliminated player re-enter when
their cooldown is clear.

## Independent repository preparation

The package directory includes its own README, license, TypeScript settings,
tests, public assets, and package metadata. Its only GameHub code dependency is
the exact `@masonf539/game-sdk` version declared in `package.json`. A standalone
lockfile will be generated after that SDK version is published so it records
the registry artifact rather than the monorepo workspace link.
