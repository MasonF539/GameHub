# GameHub Development Notes

## Planned features

### Egyptian War gameplay

- [x] Create and shuffle the card deck on the server.
- [x] Deal all cards face down between 2–6 players.
- [x] Randomly select the first player.
- [x] Implement clockwise turns and face-card challenges.
- [x] Validate slap combinations using the saved game settings.
- [x] Handle simultaneous slaps and internet latency fairly.
- [x] Eliminate players who run out of cards.
- [x] Allow eliminated players to reenter by winning a valid slap.
- [x] Detect when one player has collected every card.
- [x] Return the room to the lobby after the game ends.
- [x] Add a configurable false-slap penalty (1–3 cards, default 2).
- [x] Skip players who run out of cards; pass any remaining challenge attempts to the next player with cards.
- [x] Add server-authoritative host pause/resume.
- [x] Keep slap actions available during active play and animate each attempt.
- [x] Animate pile transfers and game-winning card plays before ending the game.
- [x] Add per-game chat capability and enable chat for Egyptian War.

### Egyptian War presentation

- [x] Position player name and card count beside the avatar with an underline below the details.
- [x] Illuminate the full current-player seat.
- [x] Add gold winner highlighting and card-transfer animations.
- [x] Animate a hand slapping from the player's seat to the central pile.
- [x] Add a host-only pause control in the upper-right of the gameplay panel.
- [x] Add an in-game chat panel for games that enable chat.

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
