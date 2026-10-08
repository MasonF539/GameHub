# Egyptian War for GameHub

The server-authoritative Egyptian War game plugin. This workspace is the
staging boundary for the independent Egyptian War repository.

The package owns its rules, state engine, slap arbitration, tests, browser
presentation, game-specific audio, preview media, and design documentation.
GameHub supplies rooms, members, spectators, transport, and shared services.

Game-specific music, effects, and picker previews live under `public/assets`
and are served by GameHub from `/games/egyptian-war`.
The package-owned `public/register.js` registers those sounds with GameHub's
shared audio service.
The game board lives in `public/template.html`, and its presentation is isolated
in `public/style.css`. GameHub injects the fragment into its generic game root.
