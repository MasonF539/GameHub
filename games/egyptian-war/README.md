# Egyptian War for GameHub

The server-authoritative Egyptian War game plugin. This workspace is the
staging boundary for the independent Egyptian War repository.

Egyptian War is designed to be installed and run by GameHub through the
`@gamehub/game-sdk` contracts. It is independently versioned, but it is not a
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

When the package moves to its independent repository, it will consume an exact
`@gamehub/game-sdk` release and publish as a public npm package. GameHub can
then install an exact Egyptian War version and enable it through
`gamehub.config.json`.

Before the split, GameHub's `npm run verify:packages` command packs the SDK and
this game, installs both archives into a clean temporary project, and confirms
that the installed plugin and public directory work without monorepo source.

## Standalone repository preparation

The package directory includes its own README, license, TypeScript settings,
tests, public assets, package metadata, and ignore rules. Its only GameHub code
dependency is the exact `@gamehub/game-sdk` package version declared in
`package.json`. A standalone lockfile should be generated after that SDK
version is published, so it records the real registry artifact rather than a
monorepo workspace link.
