# GameHub Development Notes

## Planned features

### Spectator mode for games in progress

- [x] Allow people to join a room after a game has started.
- [x] Assign late joiners the `spectator` role.
- [x] Send spectators a snapshot of the current game state.
- [x] Continue sending spectators live game updates.
- [x] Prevent spectators from submitting game actions.
- [x] Enforce spectator restrictions on the server, not only in the browser.
- [x] Allow spectators to become players when the room returns to the lobby.
- [ ] Let each additional game define the information included in its spectator snapshot before that game becomes playable.

### Visual game selection

- [x] Replace the game dropdown with a Bootstrap modal.
- [x] Display each available game as a selectable card.
- [x] Give each card a game name, description, player count, and lightweight animated preview.
- [x] Clearly highlight the currently selected game.
- [x] Allow every player to browse the available games.
- [x] Keep game selection and final game-starting permission restricted to the host.
- [x] Replace the temporary Egyptian War CSS animation with an optimized, muted, looping MP4 and a static reduced-motion poster.
- [ ] Consider optimized animated WebP or short muted video previews when future games need more detail than a CSS preview can provide.
- [ ] Consider explicit game-card audio-preview buttons later; avoid automatic hover sounds that can trigger accidentally and do not translate well to touch controls.
- [ ] Revisit optional non-host voting after the picker and additional games have been tested; voting is not part of the initial picker.

## Architecture requirements

### Installable game plugins

- [x] Define versioned server, client, and manifest contracts in the initial GameHub game SDK.
- [x] Validate registered manifests and reject incompatible versions, duplicate game IDs, and malformed settings.
- [x] Register the embedded Egyptian War definition through the plugin registry without changing gameplay.
- [x] Add generic game state, event, and action envelopes and migrate the built-in browser client to them.
- [x] Move active room state and game actions behind the generic `GameSession` lifecycle.
- [x] Remove the temporary Egyptian-War-specific Socket.IO compatibility events after introducing the session adapter.
- [x] Add a generic browser game host and route active `GameClientModule` state and events through it.
- [x] Establish independently buildable GameHub SDK and Egyptian War workspaces with package-name imports.
- [x] Move Egyptian War preview media and game-specific audio into its package-owned public directory.
- [x] Move Egyptian War markup, styles, previews, and game audio into its package boundary.
- [x] Load installed game packages and their browser resources from explicit administrator-controlled configuration.
- [ ] Extract Egyptian War into its own repository and reinstall it as a pinned package dependency.
- [ ] Add a minimal second plugin to prove that GameHub contains no Egyptian War assumptions.

Each playable game should support:

- [x] Live events for changes occurring during the game.
- [x] A complete public state snapshot for spectators and reconnecting players.
- [x] Server-side validation of player and spectator actions.
