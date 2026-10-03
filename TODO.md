# GameHub Development Notes

## Planned features

### Spectator mode for games in progress

- Allow people to join a room after a game has started.
- Assign late joiners the `spectator` role.
- Send spectators a snapshot of the current game state.
- Continue sending spectators live game updates.
- Prevent spectators from submitting game actions.
- Enforce spectator restrictions on the server, not only in the browser.
- Allow spectators to become players when the room returns to the lobby.
- Let each game define the information included in its spectator snapshot.

### Visual game selection

- Replace the game dropdown with a Bootstrap modal.
- Display each available game as a selectable card.
- Give each card a game name, description, and animated preview.
- Prefer optimized animated WebP or short muted video previews over large GIF files.
- Clearly highlight the currently selected game.
- Allow every player to browse the available games.
- Decide whether non-host players can vote for games.
- Keep final game-starting permission restricted to the host.

## Architecture requirements

Each playable game should support:

- Live events for changes occurring during the game.
- A complete state snapshot for spectators and reconnecting players.
- Server-side validation of player and spectator actions.