# GameHub

GameHub is a self-hosted, real-time browser game platform. A host creates a room, players join from their browsers, and the host chooses which game to start.

The server runs locally in Docker and can optionally use a temporary Cloudflare Tunnel so players outside the host's Wi-Fi can connect.

## Current features

- Cryptographically generated six-character room codes with hide/reveal controls and invalid-join throttling
- Shared lobby visible to the host and joined players
- Player names and a centrally validated set of broadly supported selectable avatars
- Host identification in the player list
- Live player joining and disconnection
- Server-controlled room state
- Host-only game starting
- Real-time communication with Socket.IO
- Responsive Bootstrap interface
- Local and public hosting modes
- PowerShell control menu
- Docker-based setup with no local Node.js installation required
- Reusable game rules and settings panels
- Game-specific minimum and maximum player limits
- Twelve-player lobby capacity
- Host-controlled lobby locking and unlocking
- Host-controlled player removal, plus a Leave Room button for everyone else
- Synchronized game selection and settings
- Bootstrap game picker with responsive cards and an optimized Egyptian War gameplay preview
- Egyptian War rules with configurable decks, slap patterns, false-slap penalties, and a turn timer
- Playable, server-authoritative Egyptian War with challenges, slap arbitration, turn timers, pausing, and reconnect recovery
- Late-game joining as a read-only spectator, with live public state, spectator reconnect support, in-game chat, voluntary return to the lobby, and a lobby action for spectating again while the game remains active
- Display-only network ping indicator that does not influence gameplay arbitration
- Viewport-fitted Egyptian War interface with a casino-style table, responsive player seats and controls, a full-width numeric turn timer with a stationary seconds label, a tabbed chat/spectator overlay, stable mobile positioning, and a compact in-game Settings shortcut
- A responsive tabbed GameHub Settings panel with reusable Game actions for full screen, pausing, and exiting, plus persistent, independent music, lobby alert, and gameplay volume controls; setting an audio category to 0% disables it

Game events and game-specific sounds are sent only to people currently viewing the active board. A lobby member therefore cannot hear a delayed game-win effect. When a game ends, people already waiting in the lobby hear a separate GameHub completion chime; returning participants are not mistaken for new joins and do not trigger the player-join sound.

GameHub's replaceable platform sound files live in `public/assets/audio`. The lobby completion alert is `public/assets/audio/effects/game-finished.mp3`.

Egyptian War is the first playable game. Its hidden decks, turns, challenges, slap validation, server-receipt-time arbitration, penalties, pile awards, timers, and win conditions are controlled by the server. An eliminated player who false-slaps must skip the next card's slap opportunity before trying again.

## Requirements

The host computer needs:

- Windows
- Docker Desktop
- WSL 2 for Docker's Linux containers
- Visual Studio Code for development

Players only need a modern web browser.

## Starting GameHub

Open the project in Visual Studio Code and press:

```text
Ctrl+Shift+B
```

This opens the GameHub control menu:

```text
1. Start locally
2. Start publicly
3. Show status
4. Show recent logs
5. Stop GameHub
Q. Exit controls
```

### Local mode

Local mode starts GameHub at:

```text
http://localhost:3000
```

This mode is intended for development and testing on the host computer.

### Public mode

Public mode starts GameHub and requests a temporary Cloudflare Quick Tunnel.

The host uses:

```text
http://localhost:3000
```

Players use the generated address:

```text
https://example.trycloudflare.com
```

The complete public address is copied to the Windows clipboard and verified before the browser opens. Quick Tunnel addresses are temporary and normally change each time the tunnel starts.

## Manual Docker commands

Start locally:

```powershell
docker compose up --build
```

Start with public access:

```powershell
docker compose --profile public up --build
```

Stop and remove the containers and network:

```powershell
docker compose --profile public down
```

## Project structure

GameHub currently uses npm workspaces so the plugin boundary remains testable
until published packages replace the local game workspace. `packages/game-sdk` contains
the shared contracts that connect GameHub to every game plugin. It is reusable
GameHub platform code—not a playable game—and therefore lives under
`packages/` rather than `games/`. It will remain owned and versioned by
GameHub while Egyptian War is developed in its own repository.

`games/egyptian-war` is the temporary workspace copy of the independently
maintained Egyptian War repository. It owns the game engine, tests,
documentation, package metadata, preview media, game-specific audio, HTML
fragment, stylesheet, browser controller, and authoritative server session.
GameHub loads enabled game packages from
`gamehub.config.json` (or the `GAMEHUB_GAME_PACKAGES` environment override)
and communicates through the SDK contracts.

```text
GameHub/
├── .vscode/
│   └── tasks.json
├── docs/
│   ├── game-plugin-architecture.md
│   └── plugin-extraction-progress.md
├── games/
│   └── egyptian-war/
│       ├── docs/
│       ├── public/
│       ├── src/
│       ├── test/
│       ├── LICENSE
│       ├── package.json
│       ├── tsconfig.json
│       └── tsconfig.test.json
├── public/
│   ├── assets/
│   │   ├── audio/
│   │   │   ├── effects/
│   │   │   └── music/
│   ├── audio.js
│   ├── client.js
│   ├── index.html
│   └── style.css
├── packages/
│   └── game-sdk/
│       ├── src/
│       ├── LICENSE
│       ├── package.json
│       ├── tsconfig.json
│       └── tsconfig.test.json
├── src/
│   ├── failedAttemptLimiter.ts
│   ├── server.integration.test.ts
│   └── server.ts
├── scripts/
│   └── verify-package-artifacts.mjs
├── test/
│   ├── fixtures/
│   │   └── minimal-game-plugin/
│   ├── audio.test.js
│   ├── gameHost.test.js
│   └── gamePicker.test.js
├── .dockerignore
├── .gitignore
├── compose.yaml
├── Dockerfile
├── GameHub.ps1
├── gamehub.config.json
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── TODO.md
├── tsconfig.json
└── tsconfig.test.json
```

## Technologies

- TypeScript
- Node.js
- Express
- Socket.IO
- HTML
- JavaScript
- Bootstrap
- Custom CSS
- Docker and Docker Compose
- Cloudflare Quick Tunnels
- PowerShell

## Development dependencies

Dependencies are installed inside Docker when GameHub builds.

To give Visual Studio Code access to TypeScript definitions and autocomplete without installing Node.js directly on Windows, run:

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:24-alpine npm ci
```

The resulting `node_modules` folder is excluded from Git.

## Current limitations

- Rooms are stored in memory and disappear when the server stops.
- Active-game reconnect recovery is temporary and remains in memory only.
- Quick Tunnels have no uptime guarantee.
- The public address changes when the tunnel restarts.
- Egyptian War is currently the only playable game.
- Accounts, persistent data, and moderation tools have not been implemented.
- If the host disconnects for two minutes, the room is closed, even during a game.

## Security model

Players send actions to the server, but the server remains responsible for validating rooms, host permissions, game state, timing, and scores.

Anything delivered to a browser can be inspected by that player. Secret values, correct answers, authoritative timers, and score calculations should remain on the server. The public game state therefore does not say whether the pile can currently be slapped.

Other protections:

- Failed join attempts, room creation, and per-connection requests are rate limited, and the number of rooms is capped.
- Saved room sessions (resume tokens) expire after 24 hours.
- Player names must be unique within a room and cannot contain invisible or direction-override characters.
- Pages are served with a Content-Security-Policy and other security headers.

### Settings

These can be set as environment variables (the Docker compose file passes them through):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GAMEHUB_TRUST_CLOUDFLARE_IP` | `false` | Use Cloudflare's `cf-connecting-ip` header to identify visitors. The launcher's Public mode turns this on. Only enable it when GameHub is reached through the tunnel and untrusted people cannot reach port 3000 directly, because otherwise the header can be forged. |
| `GAMEHUB_MAX_ROOMS` | `200` | Maximum number of rooms the server holds at once. |
| `CLOUDFLARED_VERSION` | `latest` | Cloudflare tunnel image tag. Set it to a specific release to pin the tunnel version. |
