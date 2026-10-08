# Egyptian War Design

Egyptian War is a versioned game plugin made for GameHub. The package owns the
game-specific server and browser behavior, while GameHub provides the room,
transport, lobby, spectator, and hosting services required to run it.

## Implementation status

This document distinguishes implemented behavior from planned gameplay. A checked item means the behavior exists in the application, not merely that its design has been selected.
Checked implementation items do not imply that every multiplayer interaction has completed manual gameplay testing; automated engine, arbitration, Socket.IO integration, and browser-animation tests run during the Docker build.

### Game availability

- [x] Keep Egyptian War visible so players can read its rules and configure its settings.
- [x] Represent playability in the shared game definition.
- [x] Disable the Start Game button and show a coming-soon status when the selected game is not playable.
- [x] Reject attempts to start an unplayable game on the server.
- [x] Mark Egyptian War playable after its server-authoritative game loop and client interface are implemented.

### Existing configuration

- [x] Support 2–6 players in the game definition.
- [x] Define standard cards and optional Jokers.
- [x] Configure one, two, or three complete decks, defaulting to one; include two Jokers per deck when Jokers are enabled.
- [x] Configure Jokers, doubles, sandwiches, four in a row, top-bottom, tens, and marriage as lobby settings.
- [x] Apply the saved settings to server-side slap validation.
- [x] Configure the false-slap penalty to 1, 2, or 3 cards, defaulting to 2.
- [x] Configure a 5–120 second player timer with a default of 15 seconds using synchronized slider and number controls.
- [x] Reset the active player's timer after they win a valid slap on their own turn.

### Server-authoritative gameplay

- [x] Implement server-side deck creation and cryptographic shuffling.
- [x] Implement face-down dealing and public state without hidden decks.
- [x] Implement random first-player selection.
- [x] Initialize the engine when a live room starts Egyptian War.
- [x] Enforce clockwise turns.
- [x] Implement Jack, Queen, King, Ace, and Joker challenge attempts (Jokers allow 5 attempts).
- [x] Award the pile to the most recent challenge-card player when a challenge fails, except while a valid final-attempt slap window is active.
- [x] Validate slaps on the server and resolve competing slaps fairly.
- [x] Use server receipt time for slap candidates so clients cannot improve their position by delaying timing acknowledgements. Collect requests for 200 ms, assign a fixed server-controlled 25 ms uncertainty to each candidate, compare candidates within the resulting 50 ms window, and select eligible candidates with smooth exponential weighting driven by Node's cryptographically secure random source.
- [x] Finish accepted slap arbitration before honoring a host pause, and allow candidates accepted before a disconnect-triggered pause to resolve instead of silently discarding them.
- [x] Skip players who run out of cards; continue the turn with the next eligible player.
- [x] Pass an unfinished challenge to the next eligible player with the remaining attempts unchanged when its responder runs out of cards.
- [x] Allow eliminated players to reenter through a valid slap.
- [x] Detect when one player owns every card and end the game.
- [x] Return the room to the lobby after the game ends.
- [x] Pause the active game when a player disconnects; allow the host to resume while the player is away, and restore the saved pause preference after they reconnect. Lobby-only disconnects still expire after two minutes.
- [x] Gray out disconnected players' table seats and show a yellow disconnected alert beneath each seat.
- [x] Provide a host-only Close Lobby control in the lobby and keep the gameplay control labeled Exit Game.
- [x] Hide the room code by default for non-host players while showing it by default to the host.
- [x] Preserve a reconnecting active player's remaining turn time and allow one short grace period per turn, capped at the configured turn duration, then continue normal automatic turn play if the timer expires.
- [x] Send recent face-up cards in reconnect snapshots so the board restores the visible pile after reconnecting.
- [x] Reject slap actions when there are no face-up cards available to slap, including immediately after a pile transfer or reconnect.
- [x] Let the host kick a disconnected player during a game; hold their cards face-down until the current pile is awarded, then add them to the next pile.
- [x] Tell a kicked player they were removed after disconnecting if they later try to reconnect, and notify the table when their cards are deferred.
- [x] Play the game-winner animation when kicking opponents leaves the host as the last player.
- [x] Keep slap actions available throughout active play, including for players out of cards, while rejecting actions during server-controlled animations and pauses.
- [x] Penalize an invalid slap by moving the configured number of the player's cards to the bottom of the pile; forfeit any remaining cards if fewer than the configured penalty remain.
- [x] Keep face-down false-slap penalty cards out of slap-pattern validation so repeated penalties cannot manufacture a valid slap.
- [x] End the game when only one player has cards and the face-up pile offers no valid slap for an eliminated player to reenter.
- [x] Allow only the host to pause and resume the game; enforce pause state on the server.
- [x] Support per-game chat capability; validate room membership, message length, and send rate on the server.
- [x] Preserve a final played card and winner state long enough for the win animation before returning to the lobby.
- [x] Enforce the player timer on the server and pause it during host pauses and action animations; add a short reconnect grace period, then auto-play on timeout.
- [x] When the final failed challenge card creates a valid slap, allow slaps until the turn timer expires before awarding the pile to the challenge owner.
- [x] Let the host end an active game and return everyone to the lobby after confirming in the browser.

### Client gameplay

- [x] Render each player's public state without revealing hidden cards.
- [x] Render the central pile and the most recently played card.
- [x] Provide server-validated play-card and slap actions.
- [x] Show turn, challenge, elimination, pile-winner, and game-winner updates.
- [x] Replace the separate player list with a responsive table arena showing each player's avatar, name, and card count around the table.
- [x] Render physical-looking cards and animate played cards into the central pile.
- [x] Place play-card and slap controls immediately below the arena.
- [x] Display action and challenge messages on the table rather than below it.
- [x] Show late joiners in a dedicated in-game spectator list, including connection status and host removal controls.
- [x] Lay out each player avatar beside their name and card count, with an underline beneath the player details.
- [x] Highlight the entire current player's seat.
- [x] Animate cards moving from the pile into the pile winner's area and outline the winner in gold.
- [x] Animate a hand moving from the slapper's seat to the pile for valid and invalid slap attempts.
- [x] Animate and retain the final played card while highlighting the game winner in gold.
- [x] Place a host-only pause/resume button at the upper-right of the gameplay panel.
- [x] Place a host-only Close Lobby control in the lobby and an Exit Game control in gameplay, each with its own in-app confirmation modal.
- [x] Put a host-only Kick button beside a disconnected player's table alert.
- [x] Make the slap-rules list collapsible.
- [x] Show enabled slap patterns and the false-slap penalty in the upper-left of the gameplay panel.
- [x] Keep turn-state messages neutral; do not announce when the current pile matches a slap pattern.
- [x] Show a chat panel only for games whose definitions enable chat.
- [x] Show the synchronized turn countdown below the table while reserving its layout space when hidden.
- [x] Decorate the countdown's uncovered track with a blue gradient and progressively revealed sleep marks, ending with a sleeping bear, without changing authoritative timer behavior.
- [x] Show each browser its latest display-only network round-trip time in the upper-right; never use that client-acknowledged measurement for slap arbitration.
- [x] Show server connection state as a colored dot with status text on the main menu, in the lobby, and beside the gameplay controls.
- [x] Fit active gameplay into the browser viewport without page scrolling; overlay Chat and Spectators in one wide bottom-left tab panel with an explicit viewport-relative Expand/Collapse control; place the timer and same-level action buttons in the open bottom-right area; and show turn text directly above the central pile count.
- [x] Style "Play a Card" and "Slap" buttons as prominent game-action controls, with a secondary "Bring the pain" label and fire accents on Slap.
- [x] Keep slaps available during active play even when no pattern matches; disable them only when no face-up cards are present, the game is paused or finished, or an action animation is in progress.
- [x] Restore active players from a complete reconnect snapshot.
- [x] Reuse the limited public game-state projection for spectators so they receive the visible pile, public player state, timers, and live animations without hidden decks.
- [x] Use game-specific background music and synchronize card, slap, pile-win, and game-win sounds with their corresponding presentation animations.
- [x] Expose persistent, independently adjustable music, player-join, and gameplay volume controls through the personal GameHub Settings Audio tab (0% disables a category), and wait for browser-approved user interaction before starting music.

### Table presentation

- [x] Draw the table with CSS until a project-owned table image is available.
- [x] Give the CSS table a layered casino-felt, wooden-rail, depth, and drop-shadow treatment while retaining its original oval shape.
- [x] Draw cards as accessible HTML/CSS playing-card faces; do not depend on external card image assets.
- [x] Render mirrored card corners, distinct face-card styling, and a Joker with vertical JOKER labels and a decorative center that is distinguishable from a Jack.
- [x] Scale slap hands and their stopping distance with the rendered card size, keep their shadows visually below the hand at every seat rotation, and layer later collected attempts above the official winner.
- [x] Keep the table, player seats, card motion, spectator area, and controls usable on narrow screens and with reduced-motion preferences.
- Offer chat per game rather than requiring it in every game; games that rely on secrecy or fast rounds can opt out, while social multiplayer games can enable it.
