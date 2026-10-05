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
const egyptianWarTurnTimer =
  document.querySelector("#egyptian-war-turn-timer");
const egyptianWarTurnTimerBar =
  document.querySelector("#egyptian-war-turn-timer-bar");
const egyptianWarTurnTimerValue =
  document.querySelector("#egyptian-war-turn-timer-value");
const egyptianWarChallenge =
  document.querySelector("#egyptian-war-challenge");
const egyptianWarPileCount =
  document.querySelector("#egyptian-war-pile-count");
const egyptianWarTopCard =
  document.querySelector("#egyptian-war-top-card");
const egyptianWarPlayers =
  document.querySelector("#egyptian-war-players");
const egyptianWarArena =
  document.querySelector("#egyptian-war-arena");
const egyptianWarPileStack =
  document.querySelector("#egyptian-war-pile-stack");
const egyptianWarPlayCardButton =
  document.querySelector("#egyptian-war-play-card");
const egyptianWarSlapButton =
  document.querySelector("#egyptian-war-slap");
const egyptianWarPauseButton =
  document.querySelector("#egyptian-war-pause");
const egyptianWarHostControls =
  document.querySelector("#egyptian-war-host-controls");
const confirmCloseLobbyButton =
  document.querySelector("#confirm-close-lobby");
const confirmExitGameButton =
  document.querySelector("#confirm-exit-game");
const closeLobbyModalElement =
  document.querySelector("#close-lobby-modal");
const exitGameModalElement =
  document.querySelector("#exit-game-modal");
const egyptianWarSlapRulesList =
  document.querySelector("#egyptian-war-slap-rules-list");
const toggleSlapRulesButton =
  document.querySelector("#toggle-slap-rules");
const egyptianWarMessage =
  document.querySelector("#egyptian-war-message");
const egyptianWarVictory =
  document.querySelector("#egyptian-war-victory");
const egyptianWarAnimationLayer =
  document.querySelector("#egyptian-war-animation-layer");
const egyptianWarChat =
  document.querySelector("#egyptian-war-chat");
const egyptianWarChatForm =
  document.querySelector("#egyptian-war-chat-form");
const egyptianWarChatInput =
  document.querySelector("#egyptian-war-chat-input");
const egyptianWarChatMessages =
  document.querySelector("#egyptian-war-chat-messages");

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
const closeLobbyButton = document.querySelector("#close-lobby");

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
let previousEgyptianWarState = null;
let visibleEgyptianWarCards = [];
let activeEgyptianWarAnimation = null;
let lastEgyptianWarAnimationId = 0;
let egyptianWarAnimationTimeout = null;
let egyptianWarTransferTimeout = null;
let egyptianWarTimerDurationMs = 15000;
let egyptianWarTimerRemainingMs = null;
let egyptianWarTimerDeadline = null;

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

function renderEgyptianWarSlapRules(settings) {
  const rules = [
    settings.includeJokers && "Joker: always slappable",
    settings.allowDoubles && "Doubles: matching consecutive ranks",
    settings.allowSandwiches && "Sandwich: matching ranks with one between",
    settings.allowFourInARow && "Four in a row: ascending/descending sequence",
    settings.allowTopBottom && "Top-bottom: newest matches the first card",
    settings.allowTens && "Tens: number cards total 10",
    settings.allowMarriage && "Marriage: King and Queen consecutively"
  ].filter(Boolean);

  egyptianWarSlapRulesList.replaceChildren();

  for (const rule of rules) {
    const item = document.createElement("li");
    item.textContent = rule;
    egyptianWarSlapRulesList.appendChild(item);
  }

  if (rules.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No slap patterns are enabled.";
    egyptianWarSlapRulesList.appendChild(item);
  }

  const penalty = settings.falseSlapPenaltyCards ?? 2;
  const penaltyItem = document.createElement("li");
  penaltyItem.textContent =
    `False slap: forfeit up to ${penalty} ` +
    `${penalty === 1 ? "card" : "cards"}.`;
  egyptianWarSlapRulesList.appendChild(penaltyItem);
}

function setEgyptianWarTimerHidden(isHidden) {
  egyptianWarTurnTimer.classList.toggle("is-hidden", isHidden);
  egyptianWarTurnTimer.setAttribute(
    "aria-hidden",
    String(isHidden)
  );
}

function renderEgyptianWarTurnTimer() {
  if (egyptianWarTurnTimer.classList.contains("is-hidden")) {
    return;
  }

  const remainingMs = egyptianWarTimerDeadline === null
    ? egyptianWarTimerRemainingMs
    : Math.max(0, egyptianWarTimerDeadline - performance.now());

  if (remainingMs === null) {
    setEgyptianWarTimerHidden(true);
    return;
  }

  const percentRemaining = egyptianWarTimerDurationMs > 0
    ? Math.max(0, Math.min(100,
      remainingMs / egyptianWarTimerDurationMs * 100))
    : 0;
  const secondsRemaining = Math.ceil(remainingMs / 1000);

  egyptianWarTurnTimerBar.style.width = `${percentRemaining}%`;
  egyptianWarTurnTimerValue.textContent = `${secondsRemaining}s`;
  const progress = egyptianWarTurnTimerBar.parentElement;
  progress.setAttribute("aria-valuenow", String(Math.round(percentRemaining)));
}

function showEgyptianWarGame(game) {
  lobbyView.classList.add("d-none");
  gameplayView.classList.remove("d-none");
  previousEgyptianWarState = null;
  visibleEgyptianWarCards = [];
  activeEgyptianWarAnimation = null;
  lastEgyptianWarAnimationId = 0;
  clearTimeout(egyptianWarAnimationTimeout);
  clearTimeout(egyptianWarTransferTimeout);
  egyptianWarAnimationLayer.replaceChildren();
  egyptianWarVictory.hidden = true;
  setEgyptianWarTimerHidden(true);
  egyptianWarTimerRemainingMs = null;
  egyptianWarTimerDeadline = null;
  egyptianWarHostControls.classList.toggle(
    "d-none",
    !isCurrentUserHost
  );
  egyptianWarPauseButton.textContent =
    game.isPaused ? "Resume" : "Pause";
  egyptianWarPauseButton.setAttribute(
    "aria-pressed",
    String(game.isPaused === true)
  );
  currentGameSettings = game.settings ?? currentGameSettings;
  renderEgyptianWarSlapRules(currentGameSettings);
  egyptianWarChat.hidden = !game.chatEnabled;
  egyptianWarChatMessages.replaceChildren();
}

function updateEgyptianWarTurnTimer(state) {
  egyptianWarTimerDurationMs = state.turnTimerSeconds * 1000;
  egyptianWarTimerRemainingMs = state.turnTimeRemainingMs;
  egyptianWarTimerDeadline =
    state.status === "playing" &&
      !state.isPaused &&
      !state.isAnimating &&
      state.turnTimeRemainingMs !== null
      ? performance.now() + state.turnTimeRemainingMs
      : null;
  setEgyptianWarTimerHidden(
    state.status !== "playing" ||
    state.isAnimating ||
    state.turnTimeRemainingMs === null
  );
  renderEgyptianWarTurnTimer();
}

setInterval(renderEgyptianWarTurnTimer, 100);

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
  entryView.classList.add("d-none");
  lobbyView.classList.remove("d-none");

  currentRoomCode = roomCode;
  roomCodeHidden = !isHost;
  updateRoomCodeDisplay();

  isCurrentUserHost = isHost;
  isRoomLocked = false;

  closeLobbyButton.classList.toggle("d-none", !isHost);
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
  previousEgyptianWarState = null;
  visibleEgyptianWarCards = [];
  activeEgyptianWarAnimation = null;
  lastEgyptianWarAnimationId = 0;
  clearTimeout(egyptianWarAnimationTimeout);
  clearTimeout(egyptianWarTransferTimeout);
  egyptianWarAnimationLayer.replaceChildren();
  gameplayView.classList.add("d-none");

  createdRoom.textContent = "";
  gameStatus.textContent = "";
  playerList.replaceChildren();
  egyptianWarPlayers.replaceChildren();
  egyptianWarTurn.textContent = "";
  setEgyptianWarTimerHidden(true);
  egyptianWarTimerRemainingMs = null;
  egyptianWarTimerDeadline = null;
  egyptianWarChallenge.textContent = "";
  egyptianWarPileCount.textContent = "0 cards";
  egyptianWarTopCard.hidden = false;
  egyptianWarPileStack.querySelectorAll(".playing-card").forEach(
    (card) => card.remove()
  );
  egyptianWarMessage.textContent = "";
  egyptianWarPlayCardButton.disabled = true;
  egyptianWarSlapButton.disabled = true;
  egyptianWarHostControls.classList.add("d-none");
  closeLobbyButton.classList.add("d-none");
  egyptianWarPauseButton.textContent = "Pause";
  egyptianWarPauseButton.setAttribute("aria-pressed", "false");
  egyptianWarVictory.hidden = true;
  egyptianWarVictory.textContent = "";
  egyptianWarChat.hidden = true;
  egyptianWarChatMessages.replaceChildren();

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

function createEgyptianWarCard(card, offset = 0) {
  const rankLabels = {
    jack: "J",
    queen: "Q",
    king: "K",
    ace: "A",
    joker: "JOKER"
  };
  const suitSymbols = {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠"
  };
  const rankLabel = rankLabels[card.rank] ?? card.rank;
  const suitSymbol = card.suit === null ? "★" : suitSymbols[card.suit];
  const description = card.suit === null
    ? "Joker"
    : `${rankLabel} of ${card.suit}`;
  const cardElement = document.createElement("div");

  cardElement.className = "playing-card";
  cardElement.dataset.cardId = card.id;
  cardElement.setAttribute("role", "img");
  cardElement.setAttribute("aria-label", description);
  cardElement.style.setProperty("--stack-x", `${offset * 12}px`);
  cardElement.style.setProperty("--stack-y", `${Math.abs(offset) * 2}px`);
  cardElement.style.setProperty(
    "--stack-rotation",
    `${offset * 5}deg`
  );

  if (card.suit === "diamonds" || card.suit === "hearts") {
    cardElement.classList.add("is-red");
  }

  if (card.suit === null) {
    cardElement.classList.add("is-joker");
  }

  const corner = document.createElement("span");
  corner.className = "playing-card-corner";
  corner.textContent = `${rankLabel}\n${suitSymbol}`;

  const center = document.createElement("span");
  center.className = "playing-card-center";
  center.textContent = suitSymbol;
  cardElement.append(corner, center);
  return cardElement;
}

function getEgyptianWarCenter(element, within) {
  const rect = element.getBoundingClientRect();
  const parentRect = within.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2 - parentRect.left,
    y: rect.top + rect.height / 2 - parentRect.top
  };
}

function animateEgyptianWarOutcome(animation) {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  egyptianWarAnimationLayer.replaceChildren();
  const arena = document.querySelector("#egyptian-war-arena");
  const center = getEgyptianWarCenter(
    egyptianWarPileStack,
    arena
  );
  const actorSeat = egyptianWarPlayers.querySelector(
    `[data-player-id="${CSS.escape(animation.actorId)}"]`
  );
  const winnerSeat = animation.winnerId
    ? egyptianWarPlayers.querySelector(
      `[data-player-id="${CSS.escape(animation.winnerId)}"]`
    )
    : null;
  const actorCenter = actorSeat
    ? getEgyptianWarCenter(actorSeat, arena)
    : center;
  const winnerCenter = winnerSeat
    ? getEgyptianWarCenter(winnerSeat, arena)
    : center;

  const slapAttempts =
    Array.isArray(animation.slapAttempts) &&
      animation.slapAttempts.length > 0
      ? animation.slapAttempts
      : [
        {
          playerId: animation.actorId,
          delayMs: 0,
          isWinner: true
        }
      ];

  if (animation.action === "slap") {
    slapAttempts.forEach((attempt, index) => {
      const playerId = attempt.playerId;
      const playerSeat = egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(playerId)}"]`
      );

      if (!playerSeat) {
        return;
      }

      const playerCenter = getEgyptianWarCenter(
        playerSeat,
        arena
      );

      const directionX = center.x - playerCenter.x;
      const directionY = center.y - playerCenter.y;

      const distance =
        Math.hypot(directionX, directionY) || 1;

      const normalizedX = directionX / distance;
      const normalizedY = directionY / distance;

      // Leave each hand slightly toward its player's table position.
      const pileOffset = 24;
      const destinationX =
        center.x - normalizedX * pileOffset;
      const destinationY =
        center.y - normalizedY * pileOffset;

      const rotation =
        Math.atan2(directionY, directionX) *
        (180 / Math.PI) +
        90;

      const hand = document.createElement("span");
      hand.className = "egyptian-war-flying-hand";
      hand.textContent = "🖐️";

      hand.style.left = `${playerCenter.x}px`;
      hand.style.top = `${playerCenter.y}px`;
      hand.style.zIndex = String(5 + index);
      const delayMs =
        !prefersReducedMotion && Number.isFinite(attempt.delayMs)
          ? Math.max(0, attempt.delayMs)
          : 0;

      hand.style.animationDelay = `${delayMs}ms`;

      hand.style.setProperty(
        "--hand-x",
        `${destinationX - playerCenter.x}px`
      );

      hand.style.setProperty(
        "--hand-y",
        `${destinationY - playerCenter.y}px`
      );

      hand.style.setProperty(
        "--hand-rotation",
        `${rotation}deg`
      );

      egyptianWarAnimationLayer.appendChild(hand);
    });
  }

  const transferCount = animation.isFinalWin
    ? 24
    : Math.min(
      animation.transferCardCount > 0
        ? animation.transferCardCount
        : animation.penaltyCardCount,
      8
    );
  const isPileTransfer = animation.transferCardCount > 0;
  const source = isPileTransfer
    ? center
    : actorCenter;
  const destination = isPileTransfer
    ? winnerCenter
    : center;

  const showTransfer = () => {
    for (let index = 0; index < transferCount; index += 1) {
      const back = document.createElement("span");
      back.className =
        animation.isFinalWin
          ? "egyptian-war-flying-card is-final-card"
          : isPileTransfer
            ? "egyptian-war-flying-card is-transferring"
            : "egyptian-war-flying-card is-penalty-card";
      back.textContent = animation.isFinalWin ? "★" : "";
      back.style.left = `${source.x + (index % 5) * 3}px`;
      back.style.top = `${source.y + (index % 7) * 2}px`;
      back.style.setProperty(
        "--card-x",
        `${destination.x - source.x}px`
      );
      back.style.setProperty(
        "--card-y",
        `${destination.y - source.y}px`
      );
      back.style.animationDelay = prefersReducedMotion
        ? "0ms"
        : `${animation.isFinalWin ? index * 45 : index * 35}ms`;
      egyptianWarAnimationLayer.appendChild(back);
    }
  };

  const latestSlapDelay = slapAttempts.reduce(
    (latestDelay, attempt) =>
      Math.max(
        latestDelay,
        Number.isFinite(attempt.delayMs)
          ? Math.max(0, attempt.delayMs)
          : 0
      ),
    0
  );

  const lastHandLandingDelay =
    prefersReducedMotion ? 1 : latestSlapDelay + 520;

  const transferDelay = animation.transferCardCount > 0
    ? prefersReducedMotion
      ? 0
      : animation.action === "slap"
        ? lastHandLandingDelay + 250
        : animation.playedCard
          ? 700
          : 350
    : 0;

  clearTimeout(egyptianWarTransferTimeout);

  if (transferCount > 0 && transferDelay > 0) {
    egyptianWarTransferTimeout = setTimeout(
      showTransfer,
      transferDelay
    );
  } else if (transferCount > 0) {
    showTransfer();
  }

  if (winnerSeat) {
    winnerSeat.classList.add("is-pile-winner");
  }

  if (animation.isFinalWin) {
    const winner = animation.winnerId
      ? animation.players?.find(
        (player) => player.id === animation.winnerId
      )
      : null;
    egyptianWarVictory.hidden = false;
    const collected = document.createElement("span");
    collected.className = "egyptian-war-victory-heading";
    collected.textContent = "ALL CARDS COLLECTED";

    const winnerMessage = document.createElement("span");
    winnerMessage.className = "egyptian-war-victory-winner";
    winnerMessage.textContent = winner
      ? `${winner.name} wins!`
      : "Game won!";

    egyptianWarVictory.replaceChildren(collected, winnerMessage);
  }

  const duration = animation.isFinalWin
    ? 3600
    : animation.transferCardCount > 0
      ? 2400
      : animation.action === "slap"
        ? 1050
        : animation.playedCard
          ? 650
          : 450;
  const presentationDuration = prefersReducedMotion
    ? 100
    : duration;

  clearTimeout(egyptianWarAnimationTimeout);
  egyptianWarAnimationTimeout = setTimeout(() => {
    egyptianWarAnimationLayer.replaceChildren();
    clearTimeout(egyptianWarTransferTimeout);
    egyptianWarPlayers
      .querySelectorAll(".is-pile-winner")
      .forEach((seat) => seat.classList.remove("is-pile-winner"));
    activeEgyptianWarAnimation = null;
    if (!animation.isFinalWin) {
      egyptianWarVictory.hidden = true;
    }
  }, presentationDuration);
}

function renderEgyptianWarState(state) {
  const previousState = previousEgyptianWarState;
  const animation = activeEgyptianWarAnimation;
  const currentPlayer = state.players.find(
    (player) => player.id === state.currentPlayerId
  );
  const winner = state.players.find(
    (player) => player.id === state.winnerId
  );
  const isNewAnimation =
    animation !== null &&
    animation.id !== lastEgyptianWarAnimationId;
  const isShowingCollectedPile =
    state.isAnimating &&
    animation?.transferCardCount > 0;

  if (previousState === null) {
    visibleEgyptianWarCards = state.recentCards.map((card) => ({
      card,
      playerId: null
    }));
  }

  updateEgyptianWarTurnTimer(state);

  egyptianWarTurn.textContent = state.isPaused
    ? state.pauseMessage ?? "Game is paused"
    : winner
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

  const displayedPileCardCount = isShowingCollectedPile
    ? animation.pileCardCountBeforeTransfer
    : state.pileCardCount;

  egyptianWarPileCount.textContent =
    `${displayedPileCardCount} ${displayedPileCardCount === 1 ? "card" : "cards"}`;

  const pileWasCollected =
    previousState !== null &&
    state.pileCardCount < previousState.pileCardCount;

  if (
    !isShowingCollectedPile &&
    (
      state.pileCardCount === 0 ||
      pileWasCollected ||
      !state.hasFaceUpCards
    )
  ) {
    visibleEgyptianWarCards = [];
  }

  const playedCard =
    animation?.playedCard ??
    state.topCard;

  const hasNewCard =
    playedCard !== null &&
    playedCard !== undefined &&
    animation?.playedCard !== null &&
    animation?.playedCard !== undefined &&
    (isNewAnimation || (
      state.pileCardCount > 0 &&
      (previousState === null ||
        (
          state.pileCardCount > previousState.pileCardCount &&
          state.topCard?.id !== previousState.topCard?.id
        ))
    ));

  if (hasNewCard) {
    visibleEgyptianWarCards.push({
      card: playedCard,
      playerId: animation?.actorId ??
        previousState?.currentPlayerId ??
        null
    });

    if (visibleEgyptianWarCards.length > 5) {
      visibleEgyptianWarCards.shift();
    }
  }

  egyptianWarPlayers.replaceChildren();

  const playerCount = state.players.length;

  state.players.forEach((player, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / playerCount;
    const seat = document.createElement("div");
    seat.className = "egyptian-war-seat";
    seat.dataset.playerId = player.id;
    seat.classList.toggle("is-current", player.isCurrentPlayer);
    seat.classList.toggle("is-eliminated", player.isEliminated);
    seat.classList.toggle("is-disconnected", !player.isConnected);
    seat.classList.toggle(
      "is-pile-winner",
      animation?.winnerId === player.id
    );
    seat.style.left = `${50 + Math.cos(angle) * 40}%`;
    seat.style.top = `${50 + Math.sin(angle) * 37}%`;

    const avatar = document.createElement("span");
    avatar.className = "player-avatar";
    avatar.textContent = player.avatar;

    const details = document.createElement("div");
    details.className = "egyptian-war-seat-details";

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;

    const cardCount = document.createElement("span");
    cardCount.className = "egyptian-war-card-count";
    cardCount.textContent =
      `${player.cardCount} ${player.cardCount === 1 ? "card" : "cards"}`;
    details.append(name, cardCount);

    if (player.isEliminated) {
      const eliminated = document.createElement("span");
      eliminated.className = "badge text-bg-secondary";
      eliminated.textContent = "Out";
      details.appendChild(eliminated);
    }

    seat.append(avatar, details);
    if (!player.isConnected) {
      const disconnectedActions = document.createElement("div");
      disconnectedActions.className =
        "egyptian-war-disconnected-actions";

      const disconnectedAlert = document.createElement("span");
      disconnectedAlert.className = "badge text-bg-warning";
      disconnectedAlert.textContent = "Disconnected";
      disconnectedActions.appendChild(disconnectedAlert);

      if (isCurrentUserHost) {
        disconnectedActions.appendChild(
          createKickPlayerButton(
            player,
            "btn btn-outline-danger btn-sm"
          )
        );
      }

      seat.appendChild(disconnectedActions);
    }
    egyptianWarPlayers.appendChild(seat);
  });

  egyptianWarPileStack
    .querySelectorAll(".playing-card")
    .forEach((card) => card.remove());

  visibleEgyptianWarCards.forEach((visibleCard, index) => {
    const cardElement = createEgyptianWarCard(
      visibleCard.card,
      index - (visibleEgyptianWarCards.length - 1) / 2
    );
    cardElement.style.zIndex = String(index + 1);

    const isLatestCard =
      index === visibleEgyptianWarCards.length - 1 && hasNewCard;

    if (isLatestCard) {
      cardElement.classList.add("is-dealing");
    }

    egyptianWarPileStack.appendChild(cardElement);

    if (isLatestCard && visibleCard.playerId !== null) {
      const sourceSeat = egyptianWarPlayers.querySelector(
        `[data-player-id="${CSS.escape(visibleCard.playerId)}"]`
      );

      if (sourceSeat) {
        const sourceCenter = getEgyptianWarCenter(
          sourceSeat,
          egyptianWarArena
        );
        const targetCenter = getEgyptianWarCenter(
          egyptianWarPileStack,
          egyptianWarArena
        );
        cardElement.style.setProperty(
          "--fly-x",
          `${sourceCenter.x - targetCenter.x}px`
        );
        cardElement.style.setProperty(
          "--fly-y",
          `${sourceCenter.y - targetCenter.y}px`
        );
      }
    }
  });

  egyptianWarTopCard.hidden = visibleEgyptianWarCards.length > 0;
  egyptianWarMessage.textContent =
    state.status === "finished" ? "" : state.activityMessage;
  egyptianWarPlayCardButton.disabled =
    state.status !== "playing" ||
    state.isPaused ||
    state.isAnimating ||
    state.isSlapWindow ||
    state.currentPlayerId !== socket.id;
  egyptianWarSlapButton.disabled =
    state.status !== "playing" ||
    state.isPaused ||
    state.isAnimating ||
    !state.hasFaceUpCards;
  egyptianWarHostControls.classList.toggle(
    "d-none",
    !isCurrentUserHost || state.status !== "playing"
  );
  egyptianWarPauseButton.textContent =
    state.isPaused ? "Resume" : "Pause";
  egyptianWarPauseButton.setAttribute(
    "aria-pressed",
    String(state.isPaused)
  );

  if (isNewAnimation) {
    lastEgyptianWarAnimationId = animation.id;
    animateEgyptianWarOutcome({
      ...animation,
      players: state.players
    });
  }

  previousEgyptianWarState = state;
}

toggleRoomCodeButton.addEventListener("click", () => {
  roomCodeHidden = !roomCodeHidden;
  updateRoomCodeDisplay();
});

toggleSlapRulesButton.addEventListener("click", () => {
  const isExpanded =
    toggleSlapRulesButton.getAttribute("aria-expanded") !== "true";
  toggleSlapRulesButton.setAttribute(
    "aria-expanded",
    String(isExpanded)
  );
  toggleSlapRulesButton.textContent = isExpanded ? "Hide" : "Show";
  egyptianWarSlapRulesList.hidden = !isExpanded;
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

socket.on("latency-probe", (acknowledge) => {
  if (typeof acknowledge === "function") {
    acknowledge();
  }
});

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
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "Disconnected from server";

  connectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-success"
  );

  connectionStatus.classList.add("text-bg-danger");

  if (currentRoomCode !== null) {
    showToast(
      "Connection lost. GameHub will restore your room when you reconnect."
    );
  }
});

socket.on("room-resumed", (room) => {
  selectedGameId = room.selectedGameId;
  currentGameSettings = room.gameSettings ?? {};
  isRoomLocked = room.isLocked;
  gameSelect.value = room.selectedGameId ?? "";
  showLobby(room.roomCode, room.isHost);
  updateRoomLockDisplay();
  if (room.activeGameId === "egyptian-war") {
    showEgyptianWarGame({
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
  egyptianWarChat.hidden = !selectedGame.chatEnabled;

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

  showEgyptianWarGame(game);
});

socket.on("egyptian-war-animation", (animation) => {
  activeEgyptianWarAnimation = animation;
});

socket.on("egyptian-war-state", (state) => {
  renderEgyptianWarState(state);
});

socket.on("game-ended", ({ message }) => {
  clearTimeout(egyptianWarAnimationTimeout);
  clearTimeout(egyptianWarTransferTimeout);
  activeEgyptianWarAnimation = null;
  egyptianWarAnimationLayer.replaceChildren();
  egyptianWarVictory.hidden = true;
  setEgyptianWarTimerHidden(true);
  egyptianWarTimerRemainingMs = null;
  egyptianWarTimerDeadline = null;
  gameplayView.classList.add("d-none");
  egyptianWarChat.hidden = true;
  egyptianWarHostControls.classList.add("d-none");
  lobbyView.classList.remove("d-none");
  updateStartGameAvailability();
  gameStatus.textContent = message;
});

socket.on("egyptian-war-pause-changed", ({ isPaused }) => {
  egyptianWarPauseButton.textContent = isPaused ? "Resume" : "Pause";
  egyptianWarPauseButton.setAttribute(
    "aria-pressed",
    String(isPaused)
  );
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    animateEgyptianWarOutcome
  };
}

socket.on("game-chat-message", (chatMessage) => {
  const item = document.createElement("li");
  item.className = "egyptian-war-chat-message";

  const name = document.createElement("strong");
  name.textContent = `${chatMessage.senderName}: `;

  const message = document.createElement("span");
  message.textContent = chatMessage.message;

  item.append(name, message);
  egyptianWarChatMessages.appendChild(item);
  egyptianWarChatMessages.scrollTop =
    egyptianWarChatMessages.scrollHeight;
});

socket.on("kicked-from-room", ({ message }) => {
  clearResumeSession();
  resetRoomState();
  showEntry();
  showToast(message);
});

socket.on("room-closed", () => {
  clearResumeSession();
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

egyptianWarPauseButton.addEventListener("click", () => {
  if (currentRoomCode === null || !isCurrentUserHost) {
    return;
  }

  const isPaused =
    egyptianWarPauseButton.getAttribute("aria-pressed") !== "true";

  socket.emit(
    "toggle-game-pause",
    { roomCode: currentRoomCode, isPaused },
    (response) => {
      if (!response.success) {
        showToast(response.message);
      }
    }
  );
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

egyptianWarChatForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (currentRoomCode === null) {
    return;
  }

  const message = egyptianWarChatInput.value.trim();

  socket.emit(
    "game-chat-send",
    { roomCode: currentRoomCode, message },
    (response) => {
      if (!response.success) {
        showToast(response.message);
        return;
      }

      egyptianWarChatInput.value = "";
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
      saveResumeSession(response.roomCode, response.resumeToken);

      joinRoomButton.disabled = true;
      roomCodeInput.disabled = true;
      playerNameInput.disabled = true;
      previousAvatarButton.disabled = true;
      nextAvatarButton.disabled = true;
    }
  );
});
