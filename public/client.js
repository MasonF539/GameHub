const socket = io();

const connectionStatus = document.querySelector("#connection-status");
const gameplayConnectionStatus =
  document.querySelector("#gameplay-connection-status");
const gameHubToastElement =
  document.querySelector("#gamehub-toast");
const gameHubToastMessage =
  document.querySelector("#gamehub-toast-message");

const entryView = document.querySelector("#entry-view");
const lobbyView = document.querySelector("#lobby-view");
const gameplayView = document.querySelector("#gameplay-view");
const gameRoot = document.querySelector("#game-root");
const gameHubAudio = window.GameHubAudio ?? {
  playEffect() {},
  setScene() {}
};
const gameClientHost = new window.GameHubGameClientHost({
  root: gameRoot,
  createContext: (gameId) => ({
    memberId: socket.id ?? "",
    role: isCurrentUserSpectator ? "spectator" : "player",
    isHost: isCurrentUserHost,
    audio: gameHubAudio,
    submitAction: (action) => new Promise((resolve) => {
      if (currentRoomCode === null) {
        resolve({ success: false, message: "You are not in a room." });
        return;
      }

      socket.emit(
        "game-action",
        { roomCode: currentRoomCode, gameId, action },
        resolve
      );
    }),
    requestPause: (isPaused) => new Promise((resolve) => {
      if (currentRoomCode === null) {
        resolve({ success: false, message: "You are not in a room." });
        return;
      }
      socket.emit(
        "toggle-game-pause",
        { roomCode: currentRoomCode, isPaused },
        resolve
      );
    }),
    sendChat: (message) => new Promise((resolve) => {
      if (currentRoomCode === null) {
        resolve({ success: false, message: "You are not in a room." });
        return;
      }
      socket.emit("game-chat-send", { roomCode: currentRoomCode, message }, resolve);
    }),
    removeMember: (memberId) => new Promise((resolve) => {
      if (currentRoomCode === null) {
        resolve({ success: false, message: "You are not in a room." });
        return;
      }
      socket.emit(
        "kick-player",
        { roomCode: currentRoomCode, playerId: memberId },
        resolve
      );
    }),
    requestLeave: () => leaveRoom(),
    notify: showToast,
    requestExit: () => {
      bootstrap.Modal.getOrCreateInstance(exitGameModalElement).show();
    }
  })
});
gameHubAudio.setScene("menu");
const networkPing = document.querySelector("#network-ping");
const confirmCloseLobbyButton =
  document.querySelector("#confirm-close-lobby");
const confirmExitGameButton =
  document.querySelector("#confirm-exit-game");
const closeLobbyModalElement =
  document.querySelector("#close-lobby-modal");
const exitGameModalElement =
  document.querySelector("#exit-game-modal");
const createRoomButton = document.querySelector("#create-room");
const createdRoom = document.querySelector("#created-room");
const toggleRoomCodeButton =
  document.querySelector("#toggle-room-code");
const roomLockStatus =
  document.querySelector("#room-lock-status");
const toggleRoomLockButton =
  document.querySelector("#toggle-room-lock");
const playerList = document.querySelector("#player-list");

const openGamePickerButton =
  document.querySelector("#open-game-picker");
const gamePickerModalElement =
  document.querySelector("#game-picker-modal");
const gamePickerHelp = document.querySelector("#game-picker-help");
const gamePickerGrid = document.querySelector("#game-picker-grid");
const selectedGameName =
  document.querySelector("#selected-game-name");
const selectedGamePlayerCount =
  document.querySelector("#selected-game-player-count");
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
const closeLobbyButton = document.querySelector("#close-lobby");
const leaveRoomButton = document.querySelector("#leave-room");

const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
const playerNameInput = document.querySelector("#player-name");
const previousAvatarButton = document.querySelector("#previous-avatar");
const avatarPreview = document.querySelector("#avatar-preview");
const nextAvatarButton = document.querySelector("#next-avatar");

const gameHubConfigElement = document.querySelector("#gamehub-config");
let avatars = [];
try {
  const configuredAvatars = JSON.parse(
    gameHubConfigElement?.textContent ?? "{}"
  ).avatars;
  if (Array.isArray(configuredAvatars)) {
    avatars = configuredAvatars.filter(
      (avatar) => typeof avatar === "string" && avatar !== ""
    );
  }
} catch {
  avatars = [];
}

let selectedAvatarIndex = 0;
let currentRoomCode = null;
let roomCodeHidden = false;
let isRoomLocked = false;
let gameDefinitions = [];
let isCurrentUserHost = false;
let isCurrentUserSpectator = false;
let selectedGameId = null;
let currentGameSettings = {};
let currentPlayers = [];
let hasReceivedPlayerList = false;
let isRoomRequestPending = false;
let isGameSelectionPending = false;

const lastRoomStorageKey = "gamehub:last-room";

function saveResumeSession(roomCode, resumeToken) {
  localStorage.setItem(
    `gamehub:resume:${roomCode}`,
    resumeToken
  );
  localStorage.setItem(lastRoomStorageKey, roomCode);
}

function clearResumeSession(roomCode = null) {
  const storedRoomCode =
    roomCode ?? localStorage.getItem(lastRoomStorageKey);

  if (storedRoomCode) {
    localStorage.removeItem(`gamehub:resume:${storedRoomCode}`);
  }

  if (
    roomCode === null ||
    localStorage.getItem(lastRoomStorageKey) === roomCode
  ) {
    localStorage.removeItem(lastRoomStorageKey);
  }
}

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

function createKickPlayerButton(player, className) {
  const kickButton = document.createElement("button");
  kickButton.className = className;
  kickButton.type = "button";
  kickButton.textContent = "Kick";
  kickButton.setAttribute("aria-label", `Kick ${player.name}`);
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
        } else if (response.message) {
          showToast(response.message);
        }
      }
    );
  });

  return kickButton;
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
  gameHubAudio.setScene("menu");
  entryView.classList.add("d-none");
  lobbyView.classList.remove("d-none");

  currentRoomCode = roomCode;
  roomCodeHidden = !isHost;
  updateRoomCodeDisplay();

  isCurrentUserHost = isHost;
  isRoomLocked = false;

  closeLobbyButton.classList.toggle("d-none", !isHost);
  leaveRoomButton.classList.toggle("d-none", isHost);
  toggleRoomLockButton.classList.toggle("d-none", !isHost);
  startGameButton.classList.toggle("d-none", !isHost);
  updateGamePicker();

  updateRoomLockDisplay();

  if (
    isHost &&
    selectedGameId === null &&
    gameDefinitions.length > 0
  ) {
    requestGameSelection(gameDefinitions[0].id);
  }
}

function showEntry() {
  gameHubAudio.setScene("menu");
  lobbyView.classList.add("d-none");
  entryView.classList.remove("d-none");
}

function resetRoomState() {
  gameClientHost.unmount();
  currentRoomCode = null;
  roomCodeHidden = false;
  isRoomLocked = false;
  isCurrentUserHost = false;
  selectedGameId = null;
  currentGameSettings = {};
  currentPlayers = [];
  hasReceivedPlayerList = false;
  isCurrentUserSpectator = false;
  isRoomRequestPending = false;
  isGameSelectionPending = false;

  createRoomButton.disabled = false;
  startGameButton.disabled = true;
  joinRoomButton.disabled = false;
  roomCodeInput.disabled = false;
  playerNameInput.disabled = false;
  previousAvatarButton.disabled = false;
  nextAvatarButton.disabled = false;

  howToPlayButton.disabled = true;
  gameSettingsButton.disabled = true;
  selectedGameName.textContent = gameDefinitions.length > 0
    ? "No game selected"
    : "Loading games…";
  selectedGamePlayerCount.textContent = "";
  updateGamePicker();
}

function createGamePreview(game) {
  const preview = document.createElement("span");
  preview.className = "game-picker-preview";
  preview.setAttribute("aria-hidden", "true");

  if (game.preview?.videoPath && game.preview?.posterPath) {
    preview.classList.add("has-media");
    preview.style.backgroundImage = `url("${game.preview.posterPath}")`;
    const previewVideo = document.createElement("video");
    const prefersReducedPreviewMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    previewVideo.className = "game-picker-preview-video";
    previewVideo.src = game.preview.videoPath;
    previewVideo.poster = game.preview.posterPath;
    previewVideo.muted = true;
    previewVideo.defaultMuted = true;
    previewVideo.loop = !prefersReducedPreviewMotion;
    previewVideo.autoplay = !prefersReducedPreviewMotion;
    previewVideo.playsInline = true;
    previewVideo.preload = prefersReducedPreviewMotion
      ? "none"
      : "metadata";
    previewVideo.disablePictureInPicture = true;
    previewVideo.tabIndex = -1;
    preview.appendChild(previewVideo);
  } else {
    preview.textContent = "Preview coming soon";
  }

  return preview;
}

function updateSelectedGameSummary() {
  const selectedGame = gameDefinitions.find(
    (game) => game.id === selectedGameId
  );

  if (!selectedGame) {
    selectedGameName.textContent = gameDefinitions.length > 0
      ? "No game selected"
      : "Loading games…";
    selectedGamePlayerCount.textContent = "";
    return;
  }

  selectedGameName.textContent = selectedGame.name;
  selectedGamePlayerCount.textContent =
    `${selectedGame.minPlayers}–${selectedGame.maxPlayers} players`;
}

function updateGamePicker() {
  openGamePickerButton.disabled = gameDefinitions.length === 0;
  gamePickerHelp.textContent = isCurrentUserHost
    ? "Select a game for everyone in the lobby."
    : "Browse available games. The host chooses what the lobby will play.";
  gamePickerGrid.replaceChildren();

  if (gameDefinitions.length === 0) {
    const loading = document.createElement("p");
    loading.className = "game-picker-loading mb-0";
    loading.textContent = "Loading games…";
    gamePickerGrid.appendChild(loading);
    updateSelectedGameSummary();
    return;
  }

  for (const game of gameDefinitions) {
    const card = document.createElement("button");
    const isSelected = game.id === selectedGameId;
    card.type = "button";
    card.className = "game-picker-card";
    card.dataset.gameId = game.id;
    card.classList.toggle("is-selected", isSelected);
    card.classList.toggle("is-unavailable", !game.isPlayable);
    card.setAttribute("aria-pressed", String(isSelected));

    if (!isCurrentUserHost || !game.isPlayable) {
      card.setAttribute("aria-disabled", "true");
    }

    const preview = createGamePreview(game);
    const body = document.createElement("span");
    body.className = "game-picker-card-body";

    const heading = document.createElement("span");
    heading.className = "game-picker-card-heading";

    const name = document.createElement("strong");
    name.className = "game-picker-card-name";
    name.textContent = game.name;

    const status = document.createElement("span");
    status.className = game.isPlayable
      ? "badge text-bg-success"
      : "badge text-bg-secondary";
    status.textContent = game.isPlayable ? "Ready" : "Coming soon";
    heading.append(name, status);

    const description = document.createElement("span");
    description.className = "game-picker-card-description";
    description.textContent = game.description;

    const footer = document.createElement("span");
    footer.className = "game-picker-card-footer";

    const playerCount = document.createElement("span");
    playerCount.textContent =
      `${game.minPlayers}–${game.maxPlayers} players`;

    const selection = document.createElement("span");
    selection.className = "game-picker-selection-label";
    selection.textContent = isSelected
      ? "Selected"
      : isCurrentUserHost && game.isPlayable
        ? "Choose game"
        : "View only";

    footer.append(playerCount, selection);
    body.append(heading, description, footer);
    card.append(preview, body);

    card.addEventListener("click", () => {
      if (isCurrentUserHost && game.isPlayable) {
        requestGameSelection(game.id);
      }
    });

    gamePickerGrid.appendChild(card);
  }

  updateSelectedGameSummary();
}

function requestGameSelection(gameId) {
  const selectedGame = gameDefinitions.find(
    (game) => game.id === gameId
  );

  if (
    !selectedGame ||
    !selectedGame.isPlayable ||
    !isCurrentUserHost ||
    currentRoomCode === null ||
    isGameSelectionPending ||
    selectedGameId === gameId
  ) {
    return;
  }

  isGameSelectionPending = true;
  gamePickerGrid.classList.add("is-pending");

  socket.emit(
    "select-game",
    {
      roomCode: currentRoomCode,
      gameId
    },
    (response) => {
      isGameSelectionPending = false;
      gamePickerGrid.classList.remove("is-pending");

      if (!response.success) {
        showToast(response.message);
        return;
      }

      bootstrap.Modal.getOrCreateInstance(
        gamePickerModalElement
      ).hide();
    }
  );
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
    settingContainer.className =
      setting.type === "number"
        ? "mb-4"
        : "form-check form-switch mb-4";

    let settingInput;
    let settingControl;

    if (setting.type === "number") {
      const currentValue =
        settings[setting.key] ?? setting.defaultValue;

      if (setting.control === "range") {
        const rangeInput = document.createElement("input");
        rangeInput.className = "form-range flex-grow-1";
        rangeInput.type = "range";
        rangeInput.min = String(setting.min);
        rangeInput.max = String(setting.max);
        rangeInput.step = String(setting.step);
        rangeInput.value = String(currentValue);
        rangeInput.disabled = !isCurrentUserHost;
        rangeInput.setAttribute(
          "aria-label",
          `${setting.label} slider`
        );

        settingInput = document.createElement("input");
        settingInput.className = "form-control game-setting-number";
        settingInput.type = "number";
        settingInput.min = String(setting.min);
        settingInput.max = String(setting.max);
        settingInput.step = String(setting.step);
        settingInput.value = String(currentValue);

        rangeInput.addEventListener("input", () => {
          settingInput.value = rangeInput.value;
        });

        settingInput.addEventListener("input", () => {
          const value = Number(settingInput.value);

          if (Number.isFinite(value)) {
            rangeInput.value = String(value);
          }
        });

        settingInput.addEventListener("change", () => {
          const enteredValue = Number(settingInput.value);
          const clampedValue = Number.isFinite(enteredValue)
            ? Math.min(setting.max, Math.max(setting.min, enteredValue))
            : setting.defaultValue;
          const steppedValue = Math.round(
            (clampedValue - setting.min) / setting.step
          ) * setting.step + setting.min;

          settingInput.value = String(steppedValue);
          rangeInput.value = String(steppedValue);
        });

        settingControl = document.createElement("div");
        settingControl.className =
          "d-flex align-items-center gap-3 mt-2";
        settingControl.append(rangeInput, settingInput);
      } else {
        settingInput = document.createElement("select");
        settingInput.className = "form-select mt-2";

        for (const value of setting.options) {
          const option = document.createElement("option");
          const unit = setting.unit ?? "";
          const unitLabel = unit.length === 0
            ? ""
            : ` ${value === 1 ? unit : `${unit}s`}`;
          option.value = String(value);
          option.textContent = `${value}${unitLabel}`;
          settingInput.appendChild(option);
        }

        settingInput.value = String(currentValue);
        settingControl = settingInput;
      }
    } else {
      settingInput = document.createElement("input");
      settingInput.className = "form-check-input";
      settingInput.type = "checkbox";
      settingInput.checked =
        settings[setting.key] ?? setting.defaultValue;
      settingControl = settingInput;
    }

    settingInput.id = `setting-${setting.key}`;
    settingInput.dataset.settingKey = setting.key;
    settingInput.dataset.settingType =
      setting.type === "number" ? "number" : "boolean";
    settingInput.disabled = !isCurrentUserHost;

    const settingLabel = document.createElement("label");
    settingLabel.className = "form-check-label fw-bold";
    settingLabel.htmlFor = settingInput.id;
    settingLabel.textContent = setting.label;

    const settingDescription = document.createElement("div");
    settingDescription.className = "form-text";
    settingDescription.textContent = setting.description;

    if (setting.type === "number") {
      settingContainer.append(
        settingLabel,
        settingControl,
        settingDescription
      );
    } else {
      settingContainer.append(
        settingControl,
        settingLabel,
        settingDescription
      );
    }

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
  const hasDisconnectedPlayers =
    currentPlayers.some((player) => !player.isConnected);
  const hasTooFewPlayers =
    playerCount < selectedGame.minPlayers;
  const hasTooManyPlayers =
    playerCount > selectedGame.maxPlayers;

  startGameButton.disabled =
    !isCurrentUserHost ||
    hasDisconnectedPlayers ||
    hasTooFewPlayers ||
    hasTooManyPlayers;

  if (hasDisconnectedPlayers) {
    gameStatus.textContent =
      "Wait for disconnected players to reconnect or remove them before starting.";
    return;
  }

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

function resumeSavedRoom(roomCode, resumeToken) {
  socket.emit(
    "resume-room",
    { resumeToken },
    (response) => {
      if (response.success) {
        return;
      }

      if (currentRoomCode === null) {
        clearResumeSession(roomCode);
        showToast(response.message);
      } else {
        showToast("Your room session is already active.");
      }
    }
  );
}

socket.on("connect", () => {
  if (!socket.recovered) {
    const savedRoomCode =
      localStorage.getItem(lastRoomStorageKey);
    const resumeToken = savedRoomCode
      ? localStorage.getItem(`gamehub:resume:${savedRoomCode}`)
      : null;

    if (savedRoomCode && resumeToken) {
      resumeSavedRoom(savedRoomCode, resumeToken);
    } else if (currentRoomCode !== null) {
      resetRoomState();
      showEntry();
      showToast("Your room session could not be restored.");
    }
  }

  connectionStatus.textContent = "Connected to server";

  connectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-danger"
  );

  connectionStatus.classList.add("text-bg-success");
  gameplayConnectionStatus.textContent = "Connected to server";
  gameplayConnectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-danger"
  );
  gameplayConnectionStatus.classList.add("text-bg-success");
});

socket.on("latency-probe", (acknowledge) => {
  if (typeof acknowledge === "function") {
    acknowledge();
  }
});

socket.on("latency-update", ({ rttMs }) => {
  if (Number.isFinite(rttMs) && rttMs >= 0) {
    networkPing.textContent = `Ping: ${Math.round(rttMs)} ms`;
  }
});

socket.on("disconnect", () => {
  isGameSelectionPending = false;
  gamePickerGrid.classList.remove("is-pending");
  networkPing.textContent = "Ping: -- ms";
  connectionStatus.textContent = "Disconnected from server";

  connectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-success"
  );

  connectionStatus.classList.add("text-bg-danger");
  gameplayConnectionStatus.textContent = "Disconnected from server";
  gameplayConnectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-success"
  );
  gameplayConnectionStatus.classList.add("text-bg-danger");

  if (currentRoomCode !== null) {
    showToast(
      "Connection lost. GameHub will restore your room when you reconnect."
    );
  }
});

socket.on("room-resumed", (room) => {
  hasReceivedPlayerList = false;
  selectedGameId = room.selectedGameId;
  currentGameSettings = room.gameSettings ?? {};
  isRoomLocked = room.isLocked;
  isCurrentUserSpectator = room.role === "spectator";
  showLobby(room.roomCode, room.isHost);
  updateRoomLockDisplay();
  if (room.activeGameId !== null) {
    mountGameClient({
      gameId: room.activeGameId,
      chatEnabled: room.chatEnabled,
      settings: room.gameSettings,
      isPaused: room.isPaused
    });
    showToast(
      room.isPaused
        ? "Connection restored. The game is paused."
        : "Connection restored. The game is continuing."
    );
  } else {
    gameStatus.textContent = "Connection restored. You are back in the lobby.";
  }
});

socket.on("room-resume-token", (resumeToken) => {
  if (currentRoomCode !== null) {
    saveResumeSession(currentRoomCode, resumeToken);
  }
});

socket.on("room-resume-failed", (message) => {
  if (message == null) {
    const savedRoomCode =
      localStorage.getItem(lastRoomStorageKey);
    const resumeToken = savedRoomCode
      ? localStorage.getItem(`gamehub:resume:${savedRoomCode}`)
      : null;
    if (savedRoomCode && resumeToken) {
      resumeSavedRoom(savedRoomCode, resumeToken);
      return;
    }
  }

  clearResumeSession();
  resetRoomState();
  showEntry();
  showToast(
    message ?? "Your room session could not be restored."
  );
});

socket.on("room-session-replaced", () => {
  resetRoomState();
  showEntry();
  showToast("This room session was restored in another connection.");
});

socket.on("available-games", (games) => {
  gameDefinitions = games;
  updateGamePicker();

  if (
    isCurrentUserHost &&
    currentRoomCode !== null &&
    selectedGameId === null &&
    gameDefinitions.length > 0
  ) {
    requestGameSelection(gameDefinitions[0].id);
  }
});

socket.on("player-list", (players) => {
  const previousPlayerIds = new Set(
    currentPlayers.map((player) => player.id)
  );
  const previousPlayerSignatures = new Set(
    currentPlayers.map((player) => `${player.name}\u0000${player.avatar}`)
  );
  const hasNewLobbyPlayer =
    hasReceivedPlayerList &&
    players.some((player) =>
      !previousPlayerIds.has(player.id) &&
      !previousPlayerSignatures.has(
        `${player.name}\u0000${player.avatar}`
      )
    );

  currentPlayers = players;
  hasReceivedPlayerList = true;

  if (hasNewLobbyPlayer) {
    gameHubAudio.playEffect("player-join");
  }

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

    if (!player.isConnected) {
      const disconnectedLabel = document.createElement("span");
      disconnectedLabel.className = "badge text-bg-warning";
      disconnectedLabel.textContent = "Disconnected";
      listItem.appendChild(disconnectedLabel);
    }

    if (isCurrentUserHost && !player.isHost) {
      listItem.appendChild(
        createKickPlayerButton(
          player,
          "btn btn-outline-danger btn-sm ms-auto"
        )
      );
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

  howToPlayButton.disabled = false;
  gameSettingsButton.disabled = false;

  displayGameInformation(
    selectedGame,
    currentGameSettings
  );

  updateGamePicker();
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

function mountGameClient(game) {
  if (!gameClientHost.has(game.gameId)) {
    showToast("This game's browser client is not installed.");
    return;
  }

  lobbyView.classList.add("d-none");
  gameplayView.classList.remove("d-none");
  gameClientHost.mount(game.gameId, game);
}

socket.on("game-started", (game) => {
  mountGameClient(game);
});

socket.on("game-state", (envelope) => {
  gameClientHost.receiveState(envelope);
});

socket.on("game-event", (envelope) => {
  gameClientHost.receiveEvent(envelope);
});

socket.on("spectator-list", (spectators) => {
  gameClientHost.receivePlatformEvent({
    type: "spectators",
    payload: spectators
  });
});

socket.on("game-chat-message", (chatMessage) => {
  gameClientHost.receivePlatformEvent({
    type: "chat-message",
    payload: chatMessage
  });
});

socket.on("game-ended", ({ message }) => {
  gameClientHost.unmount();
  gameplayView.classList.add("d-none");
  lobbyView.classList.remove("d-none");
  gameHubAudio.setScene("menu");
  isCurrentUserSpectator = false;
  updateStartGameAvailability();
  gameStatus.textContent = message;
});

socket.on("kicked-from-room", ({ message }) => {
  clearResumeSession();
  resetRoomState();
  showEntry();
  showToast(message);
});

function leaveRoom() {
  return new Promise((resolve) => {
    if (currentRoomCode === null) {
      resolve({ success: false, message: "You are not in a room." });
      return;
    }

    socket.emit("leave-room", { roomCode: currentRoomCode }, (response) => {
      if (response?.success) {
        clearResumeSession();
        resetRoomState();
        showEntry();
        showToast("You left the room.");
      }

      resolve(response ?? { success: false, message: "Unable to leave." });
    });
  });
}

leaveRoomButton.addEventListener("click", async () => {
  const response = await leaveRoom();

  if (!response.success) {
    showToast(response.message);
  }
});

socket.on("room-closed", () => {
  clearResumeSession();
  resetRoomState();
  showEntry();
  showToast("The host closed the room.");
});

confirmCloseLobbyButton.addEventListener("click", () => {
  if (currentRoomCode === null || !isCurrentUserHost) {
    return;
  }

  confirmCloseLobbyButton.disabled = true;
  socket.emit(
    "close-room",
    { roomCode: currentRoomCode },
    (response) => {
      confirmCloseLobbyButton.disabled = false;
      if (!response.success) {
        showToast(response.message);
        return;
      }

      bootstrap.Modal
        .getOrCreateInstance(closeLobbyModalElement)
        .hide();
    }
  );
});

confirmExitGameButton.addEventListener("click", () => {
  if (currentRoomCode === null || !isCurrentUserHost) {
    return;
  }

  confirmExitGameButton.disabled = true;
  socket.emit(
    "close-game-to-lobby",
    { roomCode: currentRoomCode },
    (response) => {
      confirmExitGameButton.disabled = false;
      if (!response.success) {
        showToast(response.message);
        return;
      }

      bootstrap.Modal
        .getOrCreateInstance(exitGameModalElement)
        .hide();
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
      "[data-setting-key]"
    );

  for (const input of settingInputs) {
    settings[input.dataset.settingKey] =
      input.dataset.settingType === "number"
        ? Number(input.value)
        : input.checked;
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
  hasReceivedPlayerList = false;

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
      saveResumeSession(response.roomCode, response.resumeToken);

      createRoomButton.disabled = true;
      startGameButton.disabled = selectedGameId === null;
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
  hasReceivedPlayerList = false;

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
      isCurrentUserSpectator = response.role === "spectator";
      showLobby(response.roomCode, false);
      saveResumeSession(response.roomCode, response.resumeToken);

      if (isCurrentUserSpectator) {
        if (response.activeGameId !== null) {
          mountGameClient({
            gameId: response.activeGameId,
            chatEnabled: response.chatEnabled,
            settings: response.gameSettings,
            isPaused: response.isPaused
          });
        }
        showToast("You joined the game as a spectator.");
      }

      joinRoomButton.disabled = true;
      roomCodeInput.disabled = true;
      playerNameInput.disabled = true;
      previousAvatarButton.disabled = true;
      nextAvatarButton.disabled = true;
    }
  );
});
