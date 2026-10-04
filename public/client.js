const socket = io();

const connectionStatus = document.querySelector("#connection-status");
const gameHubToastElement =
  document.querySelector("#gamehub-toast");
const gameHubToastMessage =
  document.querySelector("#gamehub-toast-message");

const entryView = document.querySelector("#entry-view");
const lobbyView = document.querySelector("#lobby-view");
const gameplayView = document.querySelector("#gameplay-view");
const egyptianWarTurn = document.querySelector("#egyptian-war-turn");
const egyptianWarChallenge =
  document.querySelector("#egyptian-war-challenge");
const egyptianWarPileCount =
  document.querySelector("#egyptian-war-pile-count");
const egyptianWarTopCard =
  document.querySelector("#egyptian-war-top-card");
const egyptianWarPlayers =
  document.querySelector("#egyptian-war-players");
const egyptianWarPlayCardButton =
  document.querySelector("#egyptian-war-play-card");
const egyptianWarSlapButton =
  document.querySelector("#egyptian-war-slap");
const egyptianWarMessage =
  document.querySelector("#egyptian-war-message");

const createRoomButton = document.querySelector("#create-room");
const createdRoom = document.querySelector("#created-room");
const toggleRoomCodeButton =
  document.querySelector("#toggle-room-code");
const roomLockStatus =
  document.querySelector("#room-lock-status");
const toggleRoomLockButton =
  document.querySelector("#toggle-room-lock");
const playerList = document.querySelector("#player-list");

const gameSelect = document.querySelector("#game-select");
const howToPlayButton = document.querySelector("#how-to-play");
const gameSettingsButton = document.querySelector("#game-settings");
const rulesModalTitle = document.querySelector("#rules-modal-title");
const rulesModalBody = document.querySelector("#rules-modal-body");
const settingsModalElement =
  document.querySelector("#settings-modal");
const settingsModalTitle =
  document.querySelector("#settings-modal-title");
const settingsModalBody =
  document.querySelector("#settings-modal-body");
const saveGameSettingsButton =
  document.querySelector("#save-game-settings");
const startGameButton = document.querySelector("#start-game");
const gameStatus = document.querySelector("#game-status");

const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
const playerNameInput = document.querySelector("#player-name");
const previousAvatarButton = document.querySelector("#previous-avatar");
const avatarPreview = document.querySelector("#avatar-preview");
const nextAvatarButton = document.querySelector("#next-avatar");

const avatars = [
  "🐱",
  "🐶",
  "🦊",
  "🐸",
  "🐼",
  "🐯",
  "🐵",
  "🐙",
  "🦄",
  "🐲",
  "🤖",
  "👻",
  "👽",
  "🥷",
  "🧙"
];

let selectedAvatarIndex = 0;
let currentRoomCode = null;
let roomCodeHidden = false;
let isRoomLocked = false;
let gameDefinitions = [];
let isCurrentUserHost = false;
let selectedGameId = null;
let currentGameSettings = {};
let currentPlayers = [];
let isRoomRequestPending = false;

function setRoomRequestPending(isPending) {
  isRoomRequestPending = isPending;

  createRoomButton.disabled = isPending;
  joinRoomButton.disabled = isPending;
  roomCodeInput.disabled = isPending;
  playerNameInput.disabled = isPending;
  previousAvatarButton.disabled = isPending;
  nextAvatarButton.disabled = isPending;
}

function updateAvatarPreview() {
  const selectedAvatar = avatars[selectedAvatarIndex];

  avatarPreview.textContent = selectedAvatar;
  avatarPreview.setAttribute(
    "aria-label",
    `Selected avatar: ${selectedAvatar}`
  );
}

previousAvatarButton.addEventListener("click", () => {
  selectedAvatarIndex =
    (selectedAvatarIndex - 1 + avatars.length) % avatars.length;

  updateAvatarPreview();
});

nextAvatarButton.addEventListener("click", () => {
  selectedAvatarIndex =
    (selectedAvatarIndex + 1) % avatars.length;

  updateAvatarPreview();
});

updateAvatarPreview();

function showToast(message) {
  gameHubToastMessage.textContent = message;

  const toast = bootstrap.Toast.getOrCreateInstance(
    gameHubToastElement
  );

  toast.show();
}

function updateRoomCodeDisplay() {
  createdRoom.textContent = roomCodeHidden
    ? "Room code: ••••••"
    : `Room code: ${currentRoomCode}`;

  toggleRoomCodeButton.classList.toggle(
    "room-code-hidden",
    roomCodeHidden
  );

  const action = roomCodeHidden
    ? "Show room code"
    : "Hide room code";

  toggleRoomCodeButton.setAttribute("aria-label", action);
  toggleRoomCodeButton.title = action;
}

function updateRoomLockDisplay() {
  roomLockStatus.textContent = isRoomLocked
    ? "Lobby Locked"
    : "Lobby Open";

  roomLockStatus.classList.remove(
    "text-bg-success",
    "text-bg-danger"
  );

  roomLockStatus.classList.add(
    isRoomLocked
      ? "text-bg-danger"
      : "text-bg-success"
  );

  toggleRoomLockButton.textContent = isRoomLocked
    ? "Unlock Lobby"
    : "Lock Lobby";
}

function showLobby(roomCode, isHost) {
  entryView.classList.add("d-none");
  lobbyView.classList.remove("d-none");

  currentRoomCode = roomCode;
  roomCodeHidden = false;
  updateRoomCodeDisplay();

  isCurrentUserHost = isHost;
  isRoomLocked = false;

  gameSelect.disabled = !isHost;
  toggleRoomLockButton.classList.toggle("d-none", !isHost);
  startGameButton.classList.toggle("d-none", !isHost);

  updateRoomLockDisplay();

  if (
    isHost &&
    selectedGameId === null &&
    gameDefinitions.length > 0
  ) {
    gameSelect.value = gameDefinitions[0].id;
    gameSelect.dispatchEvent(new Event("change"));
  }
}

function showEntry() {
  lobbyView.classList.add("d-none");
  entryView.classList.remove("d-none");
}

function resetRoomState() {
  currentRoomCode = null;
  roomCodeHidden = false;
  isRoomLocked = false;
  isCurrentUserHost = false;
  selectedGameId = null;
  currentGameSettings = {};
  currentPlayers = [];
  isRoomRequestPending = false;
  gameplayView.classList.add("d-none");

  createdRoom.textContent = "";
  gameStatus.textContent = "";
  playerList.replaceChildren();
  egyptianWarPlayers.replaceChildren();
  egyptianWarTurn.textContent = "";
  egyptianWarChallenge.textContent = "";
  egyptianWarPileCount.textContent = "0";
  egyptianWarTopCard.textContent = "No card played yet";
  egyptianWarMessage.textContent = "";
  egyptianWarPlayCardButton.disabled = true;
  egyptianWarSlapButton.disabled = true;

  createRoomButton.disabled = false;
  startGameButton.disabled = true;
  joinRoomButton.disabled = false;
  roomCodeInput.disabled = false;
  playerNameInput.disabled = false;
  previousAvatarButton.disabled = false;
  nextAvatarButton.disabled = false;

  howToPlayButton.disabled = true;
  gameSettingsButton.disabled = true;
}

function displayGameInformation(game, settings) {
  rulesModalTitle.textContent = `${game.name}: How to Play`;
  rulesModalBody.replaceChildren();

  const description = document.createElement("p");
  description.textContent = game.description;

  const playerCount = document.createElement("p");
  playerCount.className = "fw-bold";
  playerCount.textContent =
    `Players: ${game.minPlayers}–${game.maxPlayers}`;

  const ruleList = document.createElement("ol");

  for (const rule of game.rules) {
    const listItem = document.createElement("li");
    listItem.className = "mb-2";
    listItem.textContent = rule;
    ruleList.appendChild(listItem);
  }

  rulesModalBody.append(description, playerCount, ruleList);

  settingsModalTitle.textContent = `${game.name} Settings`;
  settingsModalBody.replaceChildren();

  for (const setting of game.settings) {
    const settingContainer = document.createElement("div");
    settingContainer.className = "form-check form-switch mb-4";

    const settingInput = document.createElement("input");
    settingInput.className = "form-check-input";
    settingInput.type = "checkbox";
    settingInput.id = `setting-${setting.key}`;
    settingInput.dataset.settingKey = setting.key;
    settingInput.checked =
      settings[setting.key] ?? setting.defaultValue;
    settingInput.disabled = !isCurrentUserHost;

    const settingLabel = document.createElement("label");
    settingLabel.className = "form-check-label fw-bold";
    settingLabel.htmlFor = settingInput.id;
    settingLabel.textContent = setting.label;

    const settingDescription = document.createElement("div");
    settingDescription.className = "form-text";
    settingDescription.textContent = setting.description;

    settingContainer.append(
      settingInput,
      settingLabel,
      settingDescription
    );

    settingsModalBody.appendChild(settingContainer);
  }

  saveGameSettingsButton.classList.toggle(
    "d-none",
    !isCurrentUserHost
  );
}

function updateStartGameAvailability() {
  const selectedGame = gameDefinitions.find(
    (game) => game.id === selectedGameId
  );

  if (!selectedGame) {
    startGameButton.disabled = true;
    return;
  }

  if (!selectedGame.isPlayable) {
    startGameButton.disabled = true;
    gameStatus.textContent =
      `${selectedGame.name} gameplay is still under development.`;
    return;
  }

  const playerCount = currentPlayers.length;
  const hasTooFewPlayers =
    playerCount < selectedGame.minPlayers;
  const hasTooManyPlayers =
    playerCount > selectedGame.maxPlayers;

  startGameButton.disabled =
    !isCurrentUserHost ||
    hasTooFewPlayers ||
    hasTooManyPlayers;

  if (hasTooFewPlayers) {
    const playersNeeded =
      selectedGame.minPlayers - playerCount;

    gameStatus.textContent =
      `${selectedGame.name} needs at least ` +
      `${playersNeeded} more ` +
      `${playersNeeded === 1 ? "player" : "players"}.`;
    return;
  }

  if (hasTooManyPlayers) {
    const extraPlayers =
      playerCount - selectedGame.maxPlayers;

    gameStatus.textContent =
      `${selectedGame.name} cannot start because ` +
      `${extraPlayers} extra ` +
      `${extraPlayers === 1 ? "player is" : "players are"} ` +
      `in the lobby. Maximum Players: ${selectedGame.maxPlayers}.`;
    return;
  }

  gameStatus.textContent =
    `${selectedGame.name} is ready to start.`;
}

function renderEgyptianWarState(state) {
  const currentPlayer = state.players.find(
    (player) => player.id === state.currentPlayerId
  );
  const winner = state.players.find(
    (player) => player.id === state.winnerId
  );

  egyptianWarTurn.textContent = winner
    ? `${winner.name} wins!`
    : currentPlayer
      ? `${currentPlayer.name}'s turn`
      : "Game complete";

  if (state.challenge) {
    const challenger = state.players.find(
      (player) => player.id === state.challenge.challengerId
    );
    const responder = state.players.find(
      (player) => player.id === state.challenge.responderId
    );

    egyptianWarChallenge.textContent =
      `${challenger?.name ?? "A player"} challenged ` +
      `${responder?.name ?? "the next player"}: ` +
      `${state.challenge.attemptsRemaining} ` +
      `${state.challenge.attemptsRemaining === 1 ? "attempt" : "attempts"} remaining.`;
  } else {
    egyptianWarChallenge.textContent = "";
  }

  egyptianWarPileCount.textContent = String(state.pileCardCount);

  if (state.topCard === null) {
    egyptianWarTopCard.textContent = "No card played yet";
    egyptianWarTopCard.classList.remove("is-red");
  } else {
    const suitSymbols = {
      clubs: "♣",
      diamonds: "♦",
      hearts: "♥",
      spades: "♠"
    };
    const rank = state.topCard.rank;
    const displayRank = rank[0].toUpperCase() + rank.slice(1);
    const suit = state.topCard.suit === null
      ? ""
      : ` ${suitSymbols[state.topCard.suit]}`;

    egyptianWarTopCard.textContent = `${displayRank}${suit}`;
    egyptianWarTopCard.classList.toggle(
      "is-red",
      state.topCard.suit === "diamonds" ||
        state.topCard.suit === "hearts"
    );
  }

  egyptianWarPlayers.replaceChildren();

  for (const player of state.players) {
    const listItem = document.createElement("li");
    listItem.className =
      "list-group-item d-flex align-items-center gap-3 egyptian-war-player";
    listItem.classList.toggle("is-current", player.isCurrentPlayer);
    listItem.classList.toggle("is-eliminated", player.isEliminated);

    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = player.avatar;

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;

    const cardCount = document.createElement("span");
    cardCount.className = "ms-auto text-body-secondary";
    cardCount.textContent =
      `${player.cardCount} ${player.cardCount === 1 ? "card" : "cards"}`;

    listItem.append(avatar, name, cardCount);

    if (player.isEliminated) {
      const eliminated = document.createElement("span");
      eliminated.className = "badge text-bg-secondary";
      eliminated.textContent = "Out";
      listItem.appendChild(eliminated);
    }

    egyptianWarPlayers.appendChild(listItem);
  }

  egyptianWarMessage.textContent = state.activityMessage;
  egyptianWarPlayCardButton.disabled =
    state.status !== "playing" ||
    state.currentPlayerId !== socket.id;
  egyptianWarSlapButton.disabled =
    state.status !== "playing" ||
    !state.isSlappable;
}

toggleRoomCodeButton.addEventListener("click", () => {
  roomCodeHidden = !roomCodeHidden;
  updateRoomCodeDisplay();
});

toggleRoomLockButton.addEventListener("click", () => {
  if (!isCurrentUserHost) {
    return;
  }

  socket.emit(
    "set-room-locked",
    {
      roomCode: currentRoomCode,
      isLocked: !isRoomLocked
    },
    (response) => {
      if (!response.success) {
        showToast(response.message);
      }
    }
  );
});

socket.on("connect", () => {
  connectionStatus.textContent = "Connected to server";

  connectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-danger"
  );

  connectionStatus.classList.add("text-bg-success");
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "Disconnected from server";

  connectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-success"
  );

  connectionStatus.classList.add("text-bg-danger");

  resetRoomState();
  showEntry();
});

socket.on("available-games", (games) => {
  gameDefinitions = games;
  gameSelect.replaceChildren();

  for (const game of gameDefinitions) {
    const option = document.createElement("option");

    option.value = game.id;
    option.textContent =
      `${game.name} (${game.minPlayers}–${game.maxPlayers} players)` +
      `${game.isPlayable ? "" : " — Coming soon"}`;

    gameSelect.appendChild(option);
  }
});

socket.on("player-list", (players) => {
  currentPlayers = players;
  playerList.replaceChildren();

  for (const player of players) {
    const listItem = document.createElement("li");

    listItem.className =
      "list-group-item d-flex align-items-center gap-3";

    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = player.avatar;
    avatar.setAttribute(
      "aria-label",
      `${player.name}'s avatar: ${player.avatar}`
    );

    const playerName = document.createElement("span");
    playerName.className = "player-name";
    playerName.textContent = player.name;

    listItem.append(avatar, playerName);

    if (player.isHost) {
      const hostLabel = document.createElement("span");
      hostLabel.className = "host-label";
      hostLabel.textContent = "(Host)";

      listItem.appendChild(hostLabel);
    }

    if (isCurrentUserHost && !player.isHost) {
      const kickButton = document.createElement("button");

      kickButton.className =
        "btn btn-outline-danger btn-sm ms-auto";
      kickButton.type = "button";
      kickButton.textContent = "Kick";
      kickButton.setAttribute(
        "aria-label",
        `Kick ${player.name}`
      );

      kickButton.addEventListener("click", () => {
        socket.emit(
          "kick-player",
          {
            roomCode: currentRoomCode,
            playerId: player.id
          },
          (response) => {
            if (!response.success) {
              showToast(response.message);
            }
          }
        );
      });

      listItem.appendChild(kickButton);
    }

    playerList.appendChild(listItem);
  }

  updateStartGameAvailability();
});

socket.on("room-lock-changed", ({ isLocked }) => {
  isRoomLocked = isLocked;
  updateRoomLockDisplay();
});

socket.on("game-selected", ({ gameId, settings }) => {
  const selectedGame = gameDefinitions.find(
    (game) => game.id === gameId
  );

  if (!selectedGame) {
    return;
  }

  selectedGameId = gameId;
  currentGameSettings = settings;

  gameSelect.value = gameId;
  howToPlayButton.disabled = false;
  gameSettingsButton.disabled = false;

  displayGameInformation(
    selectedGame,
    currentGameSettings
  );

  updateStartGameAvailability();
});

socket.on(
  "game-settings-updated",
  ({ gameId, settings }) => {
    if (gameId !== selectedGameId) {
      return;
    }

    const selectedGame = gameDefinitions.find(
      (game) => game.id === gameId
    );

    if (!selectedGame) {
      return;
    }

    currentGameSettings = settings;

    displayGameInformation(
      selectedGame,
      currentGameSettings
    );
  }
);

socket.on("game-started", (game) => {
  if (game.gameId !== "egyptian-war") {
    return;
  }

  lobbyView.classList.add("d-none");
  gameplayView.classList.remove("d-none");
});

socket.on("egyptian-war-state", (state) => {
  renderEgyptianWarState(state);
});

socket.on("game-ended", ({ message }) => {
  gameplayView.classList.add("d-none");
  lobbyView.classList.remove("d-none");
  updateStartGameAvailability();
  gameStatus.textContent = message;
});

socket.on("kicked-from-room", ({ message }) => {
  resetRoomState();
  showEntry();
  showToast(message);
});

socket.on("room-closed", () => {
  resetRoomState();
  showEntry();
  showToast("The host closed the room.");
});

gameSelect.addEventListener("change", () => {
  const selectedGame = gameDefinitions.find(
    (game) => game.id === gameSelect.value
  );

  if (!selectedGame || !isCurrentUserHost) {
    return;
  }

  socket.emit(
    "select-game",
    {
      roomCode: currentRoomCode,
      gameId: selectedGame.id
    },
    (response) => {
      if (!response.success) {
        showToast(response.message);
      }
    }
  );
});

egyptianWarPlayCardButton.addEventListener("click", () => {
  if (currentRoomCode === null) {
    return;
  }

  socket.emit(
    "play-card",
    { roomCode: currentRoomCode },
    (response) => {
      if (!response.success) {
        showToast(response.message);
      }
    }
  );
});

egyptianWarSlapButton.addEventListener("click", () => {
  if (currentRoomCode === null) {
    return;
  }

  socket.emit(
    "slap",
    { roomCode: currentRoomCode },
    (response) => {
      if (!response.success) {
        showToast(response.message);
      }
    }
  );
});

settingsModalElement.addEventListener(
  "hidden.bs.modal",
  () => {
    const selectedGame = gameDefinitions.find(
      (game) => game.id === selectedGameId
    );

    if (!selectedGame) {
      return;
    }

    displayGameInformation(
      selectedGame,
      currentGameSettings
    );
  }
);

saveGameSettingsButton.addEventListener("click", () => {
  if (!isCurrentUserHost || selectedGameId === null) {
    return;
  }

  const settings = {};

  const settingInputs =
    settingsModalBody.querySelectorAll(
      "input[data-setting-key]"
    );

  for (const input of settingInputs) {
    settings[input.dataset.settingKey] = input.checked;
  }

  socket.emit(
    "update-game-settings",
    {
      roomCode: currentRoomCode,
      settings
    },
    (response) => {
      if (!response.success) {
        showToast(response.message);
        return;
      }

      const settingsModal =
        bootstrap.Modal.getOrCreateInstance(
          settingsModalElement
        );

      settingsModal.hide();
    }
  );
});

createRoomButton.addEventListener("click", () => {
  if (isRoomRequestPending || currentRoomCode !== null) {
    return;
  }

  const playerName = playerNameInput.value.trim();
  const selectedAvatar = avatars[selectedAvatarIndex];

  setRoomRequestPending(true);

  socket.emit(
    "create-room",
    {
      playerName,
      avatar: selectedAvatar
    },
    (response) => {
      if (!response.success) {
        setRoomRequestPending(false);
        showToast(response.message);
        return;
      }

      isRoomRequestPending = false;
      showLobby(response.roomCode, true);

      createRoomButton.disabled = true;
      startGameButton.disabled = gameSelect.value === "";
    }
  );
});

startGameButton.addEventListener("click", () => {
  if (currentRoomCode === null) {
    showToast("Create a room first.");
    return;
  }

  socket.emit(
    "start-game",
    {
      roomCode: currentRoomCode,
    },
    (response) => {
      if (!response.success) {
        showToast(response.message);
      }
    }
  );
});

joinRoomButton.addEventListener("click", () => {
  if (isRoomRequestPending || currentRoomCode !== null) {
    return;
  }

  const roomCode = roomCodeInput.value.trim().toUpperCase();
  const playerName = playerNameInput.value.trim();
  const selectedAvatar = avatars[selectedAvatarIndex];

  setRoomRequestPending(true);

  socket.emit(
    "join-room",
    {
      roomCode,
      playerName,
      avatar: selectedAvatar
    },
    (response) => {
      if (!response.success) {
        setRoomRequestPending(false);
        showToast(response.message);
        return;
      }

      isRoomRequestPending = false;
      showLobby(response.roomCode, false);

      joinRoomButton.disabled = true;
      roomCodeInput.disabled = true;
      playerNameInput.disabled = true;
      previousAvatarButton.disabled = true;
      nextAvatarButton.disabled = true;
    }
  );
});
