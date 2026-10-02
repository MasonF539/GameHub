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

## Architecture requirements

Each playable game should support:

- Live events for changes occurring during the game.
- A complete state snapshot for spectators and reconnecting players.
- Server-side validation of player and spectator actions.