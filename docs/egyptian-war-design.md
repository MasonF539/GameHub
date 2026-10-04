# Egyptian War Design

## Implementation status

This document distinguishes implemented behavior from planned gameplay. A checked item means the behavior exists in the application, not merely that its design has been selected.

### Game availability

- [x] Keep Egyptian War visible so players can read its rules and configure its settings while gameplay is under development.
- [x] Represent playability in the shared game definition.
- [x] Disable the Start Game button and show a coming-soon status when the selected game is not playable.
- [x] Reject attempts to start an unplayable game on the server.
- [ ] Mark Egyptian War playable only after its complete server-authoritative game loop and client interface are implemented.

### Existing configuration

- [x] Support 2–6 players in the game definition.
- [x] Define standard cards and optional Jokers.
- [x] Configure Jokers, doubles, sandwiches, four in a row, top-bottom, tens, and marriage as lobby settings.
- [ ] Apply the saved settings to server-side slap validation.

### Server-authoritative gameplay

- [x] Implement and test server-side deck creation and cryptographic shuffling.
- [x] Implement and test face-down dealing and public state without hidden decks.
- [x] Implement and test random first-player selection.
- [ ] Initialize the engine when a live room starts Egyptian War.
- [ ] Enforce clockwise turns.
- [ ] Implement Jack, Queen, King, and Ace challenge attempts.
- [ ] Award the pile when a challenge fails.
- [ ] Validate slaps on the server and resolve competing slaps fairly.
- [ ] Eliminate players who run out of cards and allow reentry through a valid slap.
- [ ] Detect when one player owns every card and end the game.
- [ ] Return the room to the lobby after the game ends.

### Client gameplay

- [ ] Render each player's public state without revealing hidden cards.
- [ ] Render the central pile and the most recently played card.
- [ ] Provide server-validated play-card and slap actions.
- [ ] Show turn, challenge, elimination, pile-winner, and game-winner updates.
- [ ] Support a complete state snapshot for reconnection and future spectators.
