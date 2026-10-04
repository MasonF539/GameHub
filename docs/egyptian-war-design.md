# Egyptian War Design

## Implementation status

This document distinguishes implemented behavior from planned gameplay. A checked item means the behavior exists in the application, not merely that its design has been selected.

### Game availability

- [x] Keep Egyptian War visible so players can read its rules and configure its settings.
- [x] Represent playability in the shared game definition.
- [x] Disable the Start Game button and show a coming-soon status when the selected game is not playable.
- [x] Reject attempts to start an unplayable game on the server.
- [x] Mark Egyptian War playable after its server-authoritative game loop and client interface are implemented.

### Existing configuration

- [x] Support 2–6 players in the game definition.
- [x] Define standard cards and optional Jokers.
- [x] Configure Jokers, doubles, sandwiches, four in a row, top-bottom, tens, and marriage as lobby settings.
- [x] Apply the saved settings to server-side slap validation.

### Server-authoritative gameplay

- [x] Implement and test server-side deck creation and cryptographic shuffling.
- [x] Implement and test face-down dealing and public state without hidden decks.
- [x] Implement and test random first-player selection.
- [x] Initialize the engine when a live room starts Egyptian War.
- [x] Enforce clockwise turns.
- [x] Implement Jack, Queen, King, and Ace challenge attempts.
- [x] Award the pile when a challenge fails.
- [x] Validate slaps on the server and resolve competing slaps fairly.
- [x] Eliminate players who run out of cards and allow reentry through a valid slap.
- [x] Detect when one player owns every card and end the game.
- [x] Return the room to the lobby after the game ends.
- [x] Stop the current game and return players to the lobby if a participant disconnects.

### Client gameplay

- [x] Render each player's public state without revealing hidden cards.
- [x] Render the central pile and the most recently played card.
- [x] Provide server-validated play-card and slap actions.
- [x] Show turn, challenge, elimination, pile-winner, and game-winner updates.
- [ ] Support a complete state snapshot for reconnection and future spectators.
