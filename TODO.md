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

- [x] Replace the game dropdown with a Bootstrap modal.
- [x] Display each available game as a selectable card.
- [x] Give each card a game name, description, player count, and lightweight animated preview.
- [x] Clearly highlight the currently selected game.
- [x] Allow every player to browse the available games.
- [x] Keep game selection and final game-starting permission restricted to the host.
- [ ] Consider optimized animated WebP or short muted video previews if a future game needs more detail than a CSS preview can provide.
- [ ] Revisit optional non-host voting after the picker and additional games have been tested; voting is not part of the initial picker.

## Architecture requirements

Each playable game should support:

- Live events for changes occurring during the game.
- A complete state snapshot for spectators and reconnecting players.
- Server-side validation of player and spectator actions.
