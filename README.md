# GameHub

GameHub is a self-hosted, real-time browser game platform. A host creates a room, players join from their browsers, and the host chooses which game to start.

The server runs locally in Docker and can optionally use a temporary Cloudflare Tunnel so players outside the host's Wi-Fi can connect.

## Current features

- Six-character room codes with hide and reveal controls
- Shared lobby visible to the host and joined players
- Player names and selectable avatars
- Host identification in the player list
- Live player joining and disconnection
- Server-controlled room state
- Host-only game starting
- Real-time communication with Socket.IO
- Responsive Bootstrap interface
- Local and public hosting modes
- PowerShell control menu
- Docker-based setup with no local Node.js installation required

The Reaction Test and Number Guess entries are currently placeholders. Playable game logic will be added next.

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

The public address is copied to the Windows clipboard automatically. Quick Tunnel addresses are temporary and normally change each time the tunnel starts.

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

```text
GameHub/
├── .vscode/
│   └── tasks.json
├── public/
│   ├── client.js
│   ├── index.html
│   └── style.css
├── src/
│   └── server.ts
├── .dockerignore
├── .gitignore
├── compose.yaml
├── Dockerfile
├── GameHub.ps1
├── package.json
├── package-lock.json
├── README.md
├── TODO.md
└── tsconfig.json
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
- Refreshing the host page closes its room.
- Quick Tunnels have no uptime guarantee.
- The public address changes when the tunnel restarts.
- The listed games do not have playable implementations yet.
- Accounts, persistent data, moderation tools, and reconnect support have not been implemented.

## Security model

Players send actions to the server, but the server remains responsible for validating rooms, host permissions, game state, timing, and scores.

Anything delivered to a browser can be inspected by that player. Secret values, correct answers, authoritative timers, and score calculations should remain on the server.