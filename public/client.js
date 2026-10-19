const socket = io();

const connectionStatus = document.querySelector("#connection-status");
const gameplayConnectionStatus =
  document.querySelector("#gameplay-connection-status");
const gameHubToastElement =
  document.querySelector("#gamehub-toast");
const gameHubToastMessage =
  document.querySelector("#gamehub-toast-message");
const fullscreenButton =
  document.querySelector("#app-game-fullscreen-toggle");
const fullscreenIconPath =
  document.querySelector("#app-game-display-icon-path");
const appGamePauseButton =
  document.querySelector("#app-game-pause-toggle");
const appGameExitButton =
  document.querySelector("#app-game-exit");
const appGameExitLabel =
  document.querySelector("#app-game-exit-label");
const appSettingsModalElement =
  document.querySelector("#app-settings-modal");
const appUtilityControls =
  document.querySelector(".app-utility-controls");
const gameKeybindSections =
  document.querySelector("#game-keybind-sections");

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
    input: createGameInput(gameId),
    display: createGameDisplay(gameId),
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
    requestPause: requestGamePause,
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
    requestLeave: showLeaveGameConfirmation,
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
const confirmLeaveGameButton =
  document.querySelector("#confirm-leave-game");
const confirmLeaveSpectatorButton =
  document.querySelector("#confirm-leave-spectator");
const closeLobbyModalElement =
  document.querySelector("#close-lobby-modal");
const exitGameModalElement =
  document.querySelector("#exit-game-modal");
const leaveGameModalElement =
  document.querySelector("#leave-game-modal");
const leaveSpectatorModalElement =
  document.querySelector("#leave-spectator-modal");
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
const spectateGameButton = document.querySelector("#spectate-game");
const gameStatus = document.querySelector("#game-status");
const closeLobbyButton = document.querySelector("#close-lobby");
const leaveLobbyButton = document.querySelector("#leave-lobby");

const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
let inviteRoomCode = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase();
if (/^[A-Z0-9]{6}$/.test(inviteRoomCode ?? "")) roomCodeInput.value = inviteRoomCode;
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
let roomCodeHidden = true;
let publicInviteUrl = null;
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
let currentActiveGameId = null;
let activeGameIsPaused = false;
let activeGameIsBusy = false;
let roomHasActiveGame = false;
let currentSpectators = [];
let returningGameMemberIds = new Set();

const lastRoomStorageKey = "gamehub:last-room";
const keybindStorageKey = "gamehub:keybinds";
const generalKeybindDefinition = {
  id: "general",
  name: "General",
  keybinds: [
    {
      id: "settings",
      label: "Settings",
      description: "Open or close GameHub settings.",
      defaultKey: "Escape"
    }
  ]
};
const keybindSubscriptions = new Map();
const bindingChangeListeners = new Set();
const keyboardMedia = window.matchMedia("(any-pointer: fine)");
let keyboardSeen = false;
keyboardMedia.addEventListener?.("change", () => {
  for (const listener of bindingChangeListeners) listener();
});
document.addEventListener("keydown", (event) => {
  const editing = event.target?.closest?.("input, textarea, select, [contenteditable='true']");
  if (!keyboardSeen && event.code && !event.isComposing && !editing) {
    keyboardSeen = true;
    for (const listener of bindingChangeListeners) listener();
  }
});
let keybindOverrides = loadKeybindOverrides();
let pendingKeybindCapture = null;
const expandedKeybindGroupIds = new Set(["general"]);
const notifiedKeybindConflicts = new Set();
const assignableSpecialKeyCodes = new Set([
  "Escape", "Space", "Enter",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Backquote", "Minus", "Equal", "BracketLeft", "BracketRight",
  "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash",
  "NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide",
  "NumpadDecimal", "NumpadEnter", "NumpadEqual", "NumpadComma"
]);

function isAllowedKeybindCode(code) {
  if (typeof code !== "string") return false;
  if (/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code)) return true;
  return assignableSpecialKeyCodes.has(code);
}

function isStandaloneModifierCode(code) {
  return /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code);
}

function loadKeybindOverrides() {
  try {
    const saved = JSON.parse(localStorage.getItem(keybindStorageKey) ?? "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      const sanitized = Object.create(null);
      for (const [groupId, bindings] of Object.entries(saved)) {
        if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
          continue;
        }
        for (const [actionId, code] of Object.entries(bindings)) {
          if (code !== null && !isAllowedKeybindCode(code)) continue;
          sanitized[groupId] ??= Object.create(null);
          sanitized[groupId][actionId] = code;
        }
      }
      return sanitized;
    }
  } catch {
    // Invalid local preferences should fall back to package defaults.
  }
  return Object.create(null);
}

function saveKeybindOverrides() {
  for (const listener of bindingChangeListeners) listener();
  try {
    localStorage.setItem(keybindStorageKey, JSON.stringify(keybindOverrides));
    return true;
  } catch {
    return false;
  }
}

function getKeybindDefinitions() {
  return [
    generalKeybindDefinition,
    ...gameDefinitions
      .filter((game) => Array.isArray(game.keybinds) && game.keybinds.length > 0)
      .map((game) => ({ id: game.id, name: game.name, keybinds: game.keybinds }))
  ];
}

function getKeybindDefinition(groupId, actionId) {
  return getKeybindDefinitions()
    .find((group) => group.id === groupId)
    ?.keybinds.find((keybind) => keybind.id === actionId) ?? null;
}

function getAssignedKey(groupId, keybind) {
  const override = keybindOverrides[groupId]?.[keybind.id];
  if (override === null) return null;
  return typeof override === "string" && override !== ""
    ? override
    : keybind.defaultKey;
}

function formatKeyCode(code) {
  const labels = {
    null: "Unbound",
    Escape: "Esc",
    Space: "Space",
    Enter: "Enter",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    NumpadAdd: "Numpad +",
    NumpadSubtract: "Numpad -",
    NumpadMultiply: "Numpad *",
    NumpadDivide: "Numpad /",
    NumpadDecimal: "Numpad .",
    NumpadEnter: "Numpad Enter",
    NumpadEqual: "Numpad =",
    NumpadComma: "Numpad ,"
  };
  if (labels[code]) return labels[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Numpad ${code.slice(6)}`;
  return code;
}

function setKeybind(groupId, actionId, code) {
  const definition = getKeybindDefinition(groupId, actionId);
  if (!definition || (code !== null && !isAllowedKeybindCode(code))) return false;

  if (code === definition.defaultKey) {
    delete keybindOverrides[groupId]?.[actionId];
    if (Object.keys(keybindOverrides[groupId] ?? {}).length === 0) {
      delete keybindOverrides[groupId];
    }
  } else {
    keybindOverrides[groupId] ??= Object.create(null);
    keybindOverrides[groupId][actionId] = code;
  }
  notifiedKeybindConflicts.clear();
  return saveKeybindOverrides();
}

function createGameInput(gameId) {
  return {
    hasKeyboard: () => keyboardSeen || keyboardMedia.matches,
    getBinding(actionId) {
      const definition = getKeybindDefinition(gameId, actionId);
      const code = definition ? getAssignedKey(gameId, definition) : null;
      return code ? formatKeyCode(code) : null;
    },
    onBindingsChanged(handler) {
      bindingChangeListeners.add(handler);
      return () => bindingChangeListeners.delete(handler);
    },
    onAction(actionId, handler) {
      if (typeof handler !== "function") {
        throw new TypeError("A game input action handler must be a function.");
      }
      if (!getKeybindDefinition(gameId, actionId)) {
        throw new Error(
          `Unknown keybind action "${actionId}" for game "${gameId}".`
        );
      }
      let gameActions = keybindSubscriptions.get(gameId);
      if (!gameActions) {
        gameActions = new Map();
        keybindSubscriptions.set(gameId, gameActions);
      }
      let handlers = gameActions.get(actionId);
      if (!handlers) {
        handlers = new Set();
        gameActions.set(actionId, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) gameActions.delete(actionId);
        if (gameActions.size === 0) keybindSubscriptions.delete(gameId);
      };
    }
  };
}

function keybindConflictId(groupId, actionId) {
  return `${groupId}\u0000${actionId}`;
}

function findKeybindConflicts(groups) {
  const conflicts = new Set();
  const markDuplicates = (group) => {
    const actionsByCode = new Map();
    for (const keybind of group.keybinds) {
      const code = getAssignedKey(group.id, keybind);
      if (code === null) continue;
      const actions = actionsByCode.get(code) ?? [];
      actions.push(keybind.id);
      actionsByCode.set(code, actions);
    }
    for (const actionIds of actionsByCode.values()) {
      if (actionIds.length < 2) continue;
      for (const actionId of actionIds) {
        conflicts.add(keybindConflictId(group.id, actionId));
      }
    }
  };

  for (const group of groups) markDuplicates(group);

  const general = groups.find((group) => group.id === "general");
  if (general) {
    for (const generalKeybind of general.keybinds) {
      const generalCode = getAssignedKey(general.id, generalKeybind);
      if (generalCode === null) continue;
      for (const group of groups) {
        if (group.id === general.id) continue;
        for (const keybind of group.keybinds) {
          if (getAssignedKey(group.id, keybind) !== generalCode) continue;
          conflicts.add(keybindConflictId(general.id, generalKeybind.id));
          conflicts.add(keybindConflictId(group.id, keybind.id));
        }
      }
    }
  }

  return conflicts;
}

function createKeybindSection(group, expanded, conflicts) {
  const section = document.createElement("section");
  section.className = "game-keybind-section";

  const headingId = `keybind-heading-${group.id}`;
  const bodyId = `keybind-body-${group.id}`;
  const toggle = document.createElement("button");
  toggle.className = "game-keybind-section-toggle";
  toggle.type = "button";
  toggle.id = headingId;
  toggle.setAttribute("aria-controls", bodyId);
  toggle.setAttribute("aria-expanded", String(expanded));

  const title = document.createElement("span");
  title.textContent = group.name;
  const chevron = document.createElement("span");
  chevron.className = "game-keybind-section-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.classList.toggle("is-expanded", expanded);
  toggle.append(title, chevron);

  const body = document.createElement("div");
  body.className = "game-keybind-section-body";
  body.id = bodyId;
  body.setAttribute("aria-labelledby", headingId);
  body.hidden = !expanded;

  for (const keybind of group.keybinds) {
    const row = document.createElement("div");
    row.className = "game-keybind-row";

    const copy = document.createElement("div");
    copy.className = "game-keybind-copy";
    const label = document.createElement("strong");
    label.className = "d-block";
    label.textContent = keybind.label;
    copy.appendChild(label);
    if (keybind.description) {
      const description = document.createElement("small");
      description.className = "game-keybind-description";
      description.textContent = keybind.description;
      copy.appendChild(description);
    }

    const keyButton = document.createElement("button");
    keyButton.className = "game-keybind-button btn btn-outline-light btn-sm";
    keyButton.type = "button";
    keyButton.textContent = formatKeyCode(getAssignedKey(group.id, keybind));
    keyButton.setAttribute(
      "aria-label",
      `Change ${group.name} ${keybind.label} keybind`
    );

    const hasConflict = conflicts.has(keybindConflictId(group.id, keybind.id));
    const control = document.createElement("div");
    control.className = "game-keybind-control";
    const warning = document.createElement("span");
    warning.className = "game-keybind-warning";
    warning.textContent = "!";
    warning.hidden = !hasConflict;
    warning.setAttribute("aria-hidden", "true");
    control.append(warning, keyButton);
    if (hasConflict) {
      control.classList.add("has-conflict");
      keyButton.classList.remove("btn-outline-light");
      keyButton.classList.add("btn-outline-danger");
      keyButton.setAttribute(
        "aria-label",
        `Conflict: change ${group.name} ${keybind.label} keybind`
      );
      keyButton.title = "This key overlaps another binding.";
    }
    keyButton.addEventListener("click", () => {
      pendingKeybindCapture?.cancel();
      const originalText = keyButton.textContent;
      keyButton.textContent = "Press a key";
      keyButton.classList.add("is-listening");
      const cancelButton = document.createElement("button");
      cancelButton.className = "game-keybind-cancel btn btn-outline-secondary btn-sm";
      cancelButton.type = "button";
      cancelButton.textContent = "Cancel";
      cancelButton.setAttribute("aria-label", `Cancel changing ${keybind.label}`);
      control.appendChild(cancelButton);
      pendingKeybindCapture = {
        groupId: group.id,
        actionId: keybind.id,
        button: keyButton,
        cancel() {
          keyButton.textContent = originalText;
          keyButton.classList.remove("is-listening");
          cancelButton.remove();
          if (pendingKeybindCapture?.button === keyButton) {
            pendingKeybindCapture = null;
          }
        }
      };
      cancelButton.addEventListener("click", () => {
        pendingKeybindCapture?.cancel();
      });
    });

    row.append(copy, control);
    body.appendChild(row);
  }

  const actions = document.createElement("div");
  actions.className = "game-keybind-actions";
  const resetButton = document.createElement("button");
  resetButton.className = "btn btn-outline-secondary btn-sm";
  resetButton.type = "button";
  resetButton.textContent = "Reset defaults";
  resetButton.addEventListener("click", () => {
    delete keybindOverrides[group.id];
    notifiedKeybindConflicts.clear();
    if (!saveKeybindOverrides()) {
      showToast("Keybind preferences could not be saved.");
    }
    renderKeybindSettings();
  });
  actions.appendChild(resetButton);
  body.appendChild(actions);

  toggle.addEventListener("click", () => {
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isExpanded));
    body.hidden = isExpanded;
    chevron.classList.toggle("is-expanded", !isExpanded);
    if (isExpanded) expandedKeybindGroupIds.delete(group.id);
    else expandedKeybindGroupIds.add(group.id);
  });

  section.append(toggle, body);
  return section;
}

function renderKeybindSettings() {
  pendingKeybindCapture?.cancel();
  gameKeybindSections.replaceChildren();
  const groups = getKeybindDefinitions();
  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "game-keybind-empty mb-0";
    empty.textContent = "No configurable keybinds are installed.";
    gameKeybindSections.appendChild(empty);
    return;
  }
  const conflicts = findKeybindConflicts(groups);
  for (const group of groups) {
    gameKeybindSections.appendChild(
      createKeybindSection(group, expandedKeybindGroupIds.has(group.id), conflicts)
    );
  }
}

function isTextEntryTarget(target) {
  return Boolean(target && typeof target.closest === "function" &&
    target.closest("input, textarea, select, [contenteditable='true']")
  );
}

function toggleAppSettings() {
  const modal = bootstrap.Modal.getOrCreateInstance(appSettingsModalElement);
  if (appSettingsModalElement.classList.contains("show")) modal.hide();
  else modal.show();
}

document.addEventListener("keydown", (event) => {
  if (pendingKeybindCapture) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) {
      showToast("Key combinations with Ctrl, Alt, or Command are reserved.");
      return;
    }
    if (event.code === "Backspace") {
      const capture = pendingKeybindCapture;
      if (!setKeybind(capture.groupId, capture.actionId, null)) {
        showToast("Keybind preferences could not be saved.");
      }
      renderKeybindSettings();
      return;
    }
    if (!isAllowedKeybindCode(event.code)) {
      const reason = isStandaloneModifierCode(event.code)
        ? "Modifier keys cannot be assigned by themselves."
        : "That key is reserved. Choose a letter, number, arrow, Space, Enter, Escape, or punctuation key.";
      showToast(reason);
      return;
    }
    const capture = pendingKeybindCapture;
    if (!setKeybind(capture.groupId, capture.actionId, event.code)) {
      showToast("Keybind preferences could not be saved.");
    }
    renderKeybindSettings();
    return;
  }

  if (event.repeat || isTextEntryTarget(event.target)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const generalSettings = generalKeybindDefinition.keybinds[0];
  if (event.code === getAssignedKey("general", generalSettings)) {
    const otherModalIsOpen = document.querySelector(
      ".modal.show:not(#app-settings-modal)"
    );
    if (!otherModalIsOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleAppSettings();
    }
    return;
  }

  if (
    currentActiveGameId === null ||
    isCurrentUserSpectator ||
    document.querySelector(".modal.show")
  ) {
    return;
  }

  const game = gameDefinitions.find((candidate) => candidate.id === currentActiveGameId);
  const keybind = game?.keybinds?.find(
    (candidate) => getAssignedKey(game.id, candidate) === event.code
  );
  if (!keybind) return;

  const conflicts = findKeybindConflicts(getKeybindDefinitions());
  if (conflicts.has(keybindConflictId(game.id, keybind.id))) {
    event.preventDefault();
    const conflictId = keybindConflictId(game.id, keybind.id);
    if (!notifiedKeybindConflicts.has(conflictId)) {
      notifiedKeybindConflicts.add(conflictId);
      showToast(
        `${formatKeyCode(event.code)} has overlapping keybinds. ` +
        "Resolve the conflict before using it."
      );
    }
    return;
  }

  const handlers = keybindSubscriptions.get(game.id)?.get(keybind.id);
  if (!handlers || handlers.size === 0) return;
  event.preventDefault();
  for (const handler of [...handlers]) handler();
}, true);

renderKeybindSettings();

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

function requestGamePause(isPaused) {
  return new Promise((resolve) => {
    if (currentRoomCode === null) {
      resolve({ success: false, message: "You are not in a room." });
      return;
    }

    socket.emit(
      "toggle-game-pause",
      { roomCode: currentRoomCode, isPaused },
      resolve
    );
  });
}

function setRoomRequestPending(isPending) {
  isRoomRequestPending = isPending;

  createRoomButton.disabled = isPending;
  joinRoomButton.disabled = isPending;
  roomCodeInput.disabled = isPending;
  playerNameInput.disabled = isPending;
  previousAvatarButton.disabled = isPending;
  nextAvatarButton.disabled = isPending;
  if (!isPending) {
    delete joinRoomButton.dataset.awaitingApproval;
    joinRoomButton.textContent = "Join Room";
  }
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

function getFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

function updateFullscreenButton() {
  if (!supportsFullscreen) {
    fullscreenButton.disabled = true;
    fullscreenButton.textContent = "Unavailable";
    return;
  }

  const isFullscreen = getFullscreenElement() !== null;
  const label = isFullscreen ? "Exit full screen" : "Enter full screen";

  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
  fullscreenButton.title = label;
  fullscreenButton.textContent = isFullscreen ? "Windowed" : "Full Screen";
  fullscreenIconPath.setAttribute(
    "d",
    isFullscreen
      ? "M8 3v3a2 2 0 0 1-2 2H3 M21 8h-3a2 2 0 0 1-2-2V3 M3 16h3a2 2 0 0 1 2 2v3 M16 21v-3a2 2 0 0 1 2-2h3"
      : "M9 3H3v6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6"
  );
}

function updateGameSettingsControls() {
  const hasActiveGame = currentActiveGameId !== null;

  appGamePauseButton.textContent = activeGameIsPaused ? "Resume" : "Pause";
  appGamePauseButton.disabled =
    !hasActiveGame || !isCurrentUserHost || activeGameIsBusy;

  const exitLabel = !hasActiveGame || isCurrentUserHost
    ? "Exit Game"
    : isCurrentUserSpectator
      ? "Stop Spectating"
      : "Leave Game";
  appGameExitLabel.textContent = exitLabel;
  appGameExitButton.textContent = !hasActiveGame || isCurrentUserHost
    ? "Exit"
    : "Leave";
  appGameExitButton.disabled = !hasActiveGame;
}

function showLeaveGameConfirmation() {
  const modalElement = isCurrentUserSpectator
    ? leaveSpectatorModalElement
    : leaveGameModalElement;
  bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

function updateLobbyGameAction() {
  const canSpectate =
    currentRoomCode !== null &&
    !isCurrentUserHost &&
    !isCurrentUserSpectator &&
    roomHasActiveGame &&
    currentActiveGameId === null;

  spectateGameButton.classList.toggle("d-none", !canSpectate);
  spectateGameButton.disabled = !canSpectate;
}

function placeAppUtilityControls(inGameplay = false) {
  if (inGameplay) {
    gameplayView.append(appUtilityControls);
    return;
  }

  document.body.prepend(appUtilityControls);
}

async function toggleFullscreen() {
  try {
    if (getFullscreenElement() !== null) {
      const exitFullscreen =
        document.exitFullscreen ?? document.webkitExitFullscreen;
      await exitFullscreen.call(document);
    } else {
      const requestFullscreen =
        document.documentElement.requestFullscreen ??
        document.documentElement.webkitRequestFullscreen;
      await requestFullscreen.call(document.documentElement);
    }
  } catch {
    showToast("Full screen could not be changed in this browser.");
  }
}

const supportsFullscreen = Boolean(
  document.documentElement.requestFullscreen ??
  document.documentElement.webkitRequestFullscreen
);
fullscreenButton.disabled = !supportsFullscreen;
fullscreenButton.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);
updateFullscreenButton();

appGamePauseButton.addEventListener("click", async () => {
  if (appGamePauseButton.disabled) return;
  const response = await requestGamePause(!activeGameIsPaused);
  if (!response.success) showToast(response.message);
});

appGameExitButton.addEventListener("click", () => {
  if (appGameExitButton.disabled) return;

  bootstrap.Modal.getOrCreateInstance(appSettingsModalElement).hide();
  const confirmationModal = isCurrentUserHost
    ? exitGameModalElement
    : isCurrentUserSpectator
      ? leaveSpectatorModalElement
      : leaveGameModalElement;
  bootstrap.Modal.getOrCreateInstance(confirmationModal).show();
});

appSettingsModalElement.addEventListener(
  "show.bs.modal",
  updateGameSettingsControls
);
appSettingsModalElement.addEventListener("hidden.bs.modal", () => {
  pendingKeybindCapture?.cancel();
  expandedKeybindGroupIds.clear();
  expandedKeybindGroupIds.add("general");
  renderKeybindSettings();
});
updateGameSettingsControls();

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
  if (inviteRoomCode != null) {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(window.history.state, "", url);
  }
  inviteRoomCode = null;
  placeAppUtilityControls(false);
  currentActiveGameId = null;
  activeGameIsPaused = false;
  activeGameIsBusy = false;
  gameHubAudio.setScene("menu");
  entryView.classList.add("d-none");
  lobbyView.classList.remove("d-none");

  currentRoomCode = roomCode;
  roomCodeHidden = true;
  updateRoomCodeDisplay();

  isCurrentUserHost = isHost;
  document.querySelector("#room-join-controls").hidden = !isHost;
  document.querySelector("#review-joiners").classList.toggle("d-none", !isHost || Number(document.querySelector("#join-request-count").textContent) === 0);
  isRoomLocked = false;

  closeLobbyButton.classList.toggle("d-none", !isHost);
  leaveLobbyButton.classList.toggle("d-none", isHost);
  toggleRoomLockButton.classList.toggle("d-none", !isHost);
  startGameButton.classList.toggle("d-none", !isHost);
  updateLobbyGameAction();
  updateGamePicker();

  updateRoomLockDisplay();
  updateGameSettingsControls();

  if (
    isHost &&
    selectedGameId === null &&
    gameDefinitions.length > 0
  ) {
    requestGameSelection(gameDefinitions[0].id);
  }
}

function showEntry() {
  document.querySelector("#room-join-controls").hidden = true;
  document.querySelector("#join-request-count").textContent = "0";
  document.querySelector("#pending-join-requests").replaceChildren();
  document.querySelector("#require-join-approval").checked = false;
  placeAppUtilityControls(false);
  currentActiveGameId = null;
  activeGameIsPaused = false;
  activeGameIsBusy = false;
  roomHasActiveGame = false;
  currentSpectators = [];
  returningGameMemberIds.clear();
  updateGameSettingsControls();
  gameHubAudio.setScene("menu");
  gameplayView.classList.add("d-none");
  lobbyView.classList.add("d-none");
  entryView.classList.remove("d-none");
}

function showLobbyAfterLeavingGame(hasActiveGame = true, wasSpectator = false) {
  placeAppUtilityControls(false);
  currentActiveGameId = null;
  activeGameIsPaused = false;
  activeGameIsBusy = false;
  updateGameSettingsControls();
  gameClientHost.unmount();
  gameplayView.classList.add("d-none");
  entryView.classList.add("d-none");
  lobbyView.classList.remove("d-none");
  gameHubAudio.setScene("menu");
  isCurrentUserSpectator = false;
  roomHasActiveGame = hasActiveGame;
  updateLobbyGameAction();
  gameStatus.textContent = wasSpectator
    ? "You stopped spectating and returned to the lobby."
    : "You left the game and returned to the lobby.";
}

function resetRoomState() {
  gameClientHost.unmount();
  currentRoomCode = null;
  roomCodeHidden = true;
  isRoomLocked = false;
  isCurrentUserHost = false;
  selectedGameId = null;
  currentGameSettings = {};
  currentPlayers = [];
  hasReceivedPlayerList = false;
  isCurrentUserSpectator = false;
  isRoomRequestPending = false;
  isGameSelectionPending = false;
  currentActiveGameId = null;
  activeGameIsPaused = false;
  activeGameIsBusy = false;
  roomHasActiveGame = false;
  currentSpectators = [];
  returningGameMemberIds.clear();
  updateGameSettingsControls();

  createRoomButton.disabled = false;
  startGameButton.disabled = true;
  spectateGameButton.classList.add("d-none");
  spectateGameButton.disabled = true;
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

    if (savedRoomCode && resumeToken &&
        (!/^[A-Z0-9]{6}$/.test(inviteRoomCode ?? "") || savedRoomCode === inviteRoomCode)) {
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
  if (gameplayConnectionStatus) {
    gameplayConnectionStatus.textContent = "Connected to server";
    gameplayConnectionStatus.classList.remove(
      "text-bg-warning",
      "text-bg-danger"
    );
    gameplayConnectionStatus.classList.add("text-bg-success");
  }
});

socket.on("latency-probe", (acknowledge) => {
  if (typeof acknowledge === "function") {
    acknowledge();
  }
});

socket.on("latency-update", ({ rttMs }) => {
  if (networkPing && Number.isFinite(rttMs) && rttMs >= 0) {
    networkPing.textContent = `${Math.round(rttMs)} ms`;
  }
});

socket.on("disconnect", () => {
  if (currentRoomCode === null) setRoomRequestPending(false);
  isGameSelectionPending = false;
  gamePickerGrid.classList.remove("is-pending");
  connectionStatus.textContent = "Disconnected from server";

  connectionStatus.classList.remove(
    "text-bg-warning",
    "text-bg-success"
  );

  connectionStatus.classList.add("text-bg-danger");
  if (gameplayConnectionStatus) {
    gameplayConnectionStatus.textContent = "Disconnected from server";
    gameplayConnectionStatus.classList.remove(
      "text-bg-warning",
      "text-bg-success"
    );
    gameplayConnectionStatus.classList.add("text-bg-danger");
  }
  if (networkPing) networkPing.textContent = "-- ms";

  if (currentRoomCode !== null) {
    showToast(
      "Connection lost. GameHub will restore your room when you reconnect."
    );
  }
});

socket.on("room-resumed", (room) => {
  hasReceivedPlayerList = false;
  returningGameMemberIds.clear();
  selectedGameId = room.selectedGameId;
  currentGameSettings = room.gameSettings ?? {};
  isRoomLocked = room.isLocked;
  isCurrentUserSpectator = room.role === "spectator";
  roomHasActiveGame = room.hasActiveGame === true || room.activeGameId !== null;
  showLobby(room.roomCode, room.isHost);
  updateRoomLockDisplay();
  if (room.activeGameId !== null) {
    mountGameClient({
      gameId: room.activeGameId,
      chatEnabled: room.chatEnabled,
      chatHistory: room.chatHistory,
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
    if (savedRoomCode && resumeToken &&
        (!/^[A-Z0-9]{6}$/.test(inviteRoomCode ?? "") || savedRoomCode === inviteRoomCode)) {
      resumeSavedRoom(savedRoomCode, resumeToken);
      return;
    }
  }

  if (currentRoomCode === null && /^[A-Z0-9]{6}$/.test(inviteRoomCode ?? "") && message == null) return;
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
  renderDisplayOptions();
  updateGamePicker();
  renderKeybindSettings();

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
      !returningGameMemberIds.has(player.id) &&
      !previousPlayerIds.has(player.id) &&
      !previousPlayerSignatures.has(
        `${player.name}\u0000${player.avatar}`
      )
    );

  currentPlayers = players;
  hasReceivedPlayerList = true;
  returningGameMemberIds = new Set(
    [...returningGameMemberIds].filter(
      (memberId) => !players.some((player) => player.id === memberId)
    )
  );

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
  placeAppUtilityControls(true);
  currentActiveGameId = game.gameId;
  roomHasActiveGame = true;
  activeGameIsPaused = game.isPaused === true;
  activeGameIsBusy = false;
  updateGameSettingsControls();
  gameClientHost.mount(game.gameId, game);
  for (const message of game.chatHistory ?? []) {
    gameClientHost.receivePlatformEvent({
      type: "chat-message",
      payload: { ...message, isHistory: true }
    });
  }
  gameClientHost.receivePlatformEvent({
    type: "spectators",
    payload: currentSpectators
  });
  updateLobbyGameAction();
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

socket.on("game-lifecycle", ({ gameId, isPaused, isBusy }) => {
  if (gameId !== currentActiveGameId) return;
  activeGameIsPaused = isPaused === true;
  activeGameIsBusy = isBusy === true;
  updateGameSettingsControls();
});

socket.on("spectator-list", (spectators) => {
  currentSpectators = spectators;
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

socket.on("game-ended", ({ message, returningMemberIds = [] }) => {
  const wasWaitingInLobby = currentActiveGameId === null;
  returningGameMemberIds = new Set(
    Array.isArray(returningMemberIds) ? returningMemberIds : []
  );
  if (wasWaitingInLobby) {
    gameHubAudio.playEffect("game-finished");
  }
  placeAppUtilityControls(false);
  currentActiveGameId = null;
  activeGameIsPaused = false;
  activeGameIsBusy = false;
  roomHasActiveGame = false;
  currentSpectators = [];
  updateGameSettingsControls();
  gameClientHost.unmount();
  gameplayView.classList.add("d-none");
  lobbyView.classList.remove("d-none");
  gameHubAudio.setScene("menu");
  isCurrentUserSpectator = false;
  updateLobbyGameAction();
  updateStartGameAvailability();
  gameStatus.textContent = message;
});

socket.on("kicked-from-room", ({ message }) => {
  clearResumeSession();
  resetRoomState();
  showEntry();
  showToast(message);
});

function leaveActiveGame(confirmButton, modalElement) {
  if (currentRoomCode === null || isCurrentUserHost) {
    return;
  }

  const wasSpectator = isCurrentUserSpectator;
  confirmButton.disabled = true;
  socket.emit(
    "leave-game",
    { roomCode: currentRoomCode },
    (response) => {
      confirmButton.disabled = false;
      if (!response.success) {
        showToast(response.message);
        return;
      }

      bootstrap.Modal
        .getOrCreateInstance(modalElement)
        .hide();
      showLobbyAfterLeavingGame(
        response.hasActiveGame !== false,
        wasSpectator
      );
    }
  );
}

confirmLeaveGameButton.addEventListener("click", () => {
  leaveActiveGame(confirmLeaveGameButton, leaveGameModalElement);
});

confirmLeaveSpectatorButton.addEventListener("click", () => {
  leaveActiveGame(confirmLeaveSpectatorButton, leaveSpectatorModalElement);
});

leaveLobbyButton.addEventListener("click", () => {
  if (currentRoomCode === null || isCurrentUserHost) {
    return;
  }

  leaveLobbyButton.disabled = true;
  socket.emit(
    "leave-lobby",
    { roomCode: currentRoomCode },
    (response) => {
      leaveLobbyButton.disabled = false;

      if (!response.success) {
        showToast(response.message);
        return;
      }

      clearResumeSession(currentRoomCode);
      resetRoomState();
      showEntry();
    }
  );
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

spectateGameButton.addEventListener("click", () => {
  if (
    currentRoomCode === null ||
    isCurrentUserHost ||
    !roomHasActiveGame ||
    currentActiveGameId !== null
  ) {
    return;
  }

  spectateGameButton.disabled = true;
  socket.emit(
    "spectate-game",
    { roomCode: currentRoomCode },
    (response) => {
      if (!response.success) {
        spectateGameButton.disabled = false;
        showToast(response.message);
        return;
      }

      isCurrentUserSpectator = true;
      updateLobbyGameAction();
      showToast("You joined the game as a spectator.");
    }
  );
});

joinRoomButton.addEventListener("click", () => {
  if (joinRoomButton.dataset.awaitingApproval) {
    socket.emit("cancel-join-request", {}, () => setRoomRequestPending(false));
    return;
  }
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
    finishJoiningRoom
  );
});

function finishJoiningRoom(response) {
  if (response.pendingApproval) {
    joinRoomButton.dataset.awaitingApproval = "true";
    joinRoomButton.disabled = false;
    joinRoomButton.textContent = "Cancel Request";
    showToast("Waiting for the host to approve your join request (up to 60 seconds).");
    return;
  }
  if (!response.success) {
    setRoomRequestPending(false);
    showToast(response.message);
    return;
  }

  isRoomRequestPending = false;
  delete joinRoomButton.dataset.awaitingApproval;
  joinRoomButton.textContent = "Join Room";
  isCurrentUserSpectator = response.role === "spectator";
  roomHasActiveGame = response.activeGameId !== null;
  showLobby(response.roomCode, false);
  saveResumeSession(response.roomCode, response.resumeToken);

  if (isCurrentUserSpectator) {
    if (response.activeGameId !== null) {
      mountGameClient({
        gameId: response.activeGameId,
        chatEnabled: response.chatEnabled,
        chatHistory: response.chatHistory,
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

socket.on("join-request-result", (response) => {
  finishJoiningRoom(response);
  if (response.success) showToast("The host accepted your join request.");
});
socket.on("room-approval-changed", ({ requiresJoinApproval }) => {
  document.querySelector("#require-join-approval").checked = requiresJoinApproval === true;
});
socket.on("join-requests", (requests) => {
  const list = document.querySelector("#pending-join-requests");
  const previousCount = Number(document.querySelector("#join-request-count").textContent);
  document.querySelector("#join-request-count").textContent = String(requests.length);
  document.querySelector("#review-joiners").classList.toggle("d-none", requests.length === 0);
  list.replaceChildren();
  if (requests.length > previousCount) showToast("A join request is waiting.\nOpen Settings → Game → Joining to review it.");
  if (!requests.length) list.textContent = "No join requests waiting.";
  for (const request of requests) {
    const row = document.createElement("div");
    row.className = "game-setting-row join-request-row";
    const name = document.createElement("span");
    name.textContent = request.avatar + " " + request.name;
    row.append(name);
    const actions = document.createElement("div");
    actions.className = "d-flex gap-2 ms-auto flex-shrink-0";
    for (const accept of [true, false]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-sm " + (accept ? "btn-success" : "btn-outline-danger");
      button.textContent = accept ? "Accept" : "Decline";
      button.setAttribute("aria-label", button.textContent + " " + request.name);
      button.addEventListener("click", () => {
        socket.emit("review-join-request", { memberId: request.id, accept }, (response) => {
          if (!response.success) showToast(response.message);
        });
      });
      actions.append(button);
    }
    row.append(actions);
    list.append(row);
  }
});
document.querySelector("#review-joiners").addEventListener("click", () => {
  bootstrap.Tab.getOrCreateInstance(document.querySelector("#app-settings-game-tab")).show();
});
document.querySelector("#require-join-approval").addEventListener("change", (event) => {
  socket.emit("set-room-approval", { enabled: event.target.checked }, (response) => {
    if (!response.success) { event.target.checked = !event.target.checked; showToast(response.message); }
  });
});
async function copyRoomInvite() {
  const roomCode = currentRoomCode;
  if (!roomCode) return;
  const invite = new URL(publicInviteUrl ?? window.location.href);
  invite.search = "";
  invite.hash = "";
  invite.searchParams.set("room", roomCode);
  try {
    await window.navigator.clipboard.writeText(invite.href);
    showToast("Invite link copied.");
  } catch {
    window.prompt("Copy this invite link:", invite.href);
  }
}
socket.on("public-invite-url", (url) => { publicInviteUrl = url; });
async function copyRoomCode() {
  if (!currentRoomCode) return;
  try {
    await window.navigator.clipboard.writeText(currentRoomCode);
    showToast("Room code copied.");
  } catch {
    window.prompt("Copy this room code:", currentRoomCode);
  }
}
document.querySelector("#copy-invite-link").addEventListener("click", copyRoomInvite);
document.querySelector("#copy-room-code").addEventListener("click", copyRoomCode);

const displayStorageKey = "gamehub:display-options";
const displayChangeListeners = new Map();
let displayPreferences = {};
try {
  const saved = JSON.parse(localStorage.getItem(displayStorageKey) ?? "{}");
  if (saved && typeof saved === "object" && !Array.isArray(saved)) displayPreferences = saved;
} catch { /* Browsing without storage still supports temporary preferences. */ }

function displayValue(gameId, option) {
  const saved = displayPreferences[gameId]?.[option.key];
  return option.choices.some((choice) => choice.value === saved) ? saved : option.defaultValue;
}
function createGameDisplay(gameId) {
  return {
    get(key) {
      const option = gameDefinitions.find((game) => game.id === gameId)?.displayOptions?.find((option) => option.key === key);
      return option ? displayValue(gameId, option) : null;
    },
    onChange(handler) {
      if (!displayChangeListeners.has(gameId)) displayChangeListeners.set(gameId, new Set());
      const listeners = displayChangeListeners.get(gameId);
      listeners.add(handler);
      return () => listeners.delete(handler);
    }
  };
}
function renderDisplayOptions() {
  const container = document.querySelector("#game-display-sections");
  container.replaceChildren();
  for (const game of gameDefinitions.filter((game) => game.displayOptions?.length)) {
    const section = document.createElement("details");
    section.className = "game-display-options";
    const heading = document.createElement("summary");
    heading.textContent = game.name;
    section.append(heading);
    for (const option of game.displayOptions) {
      const row = document.createElement("div");
      row.className = "game-display-option";
      const label = document.createElement("label");
      label.textContent = option.label;
      const select = document.createElement("select");
      select.className = "form-select form-select-sm";
      select.id = "display-" + game.id + "-" + option.key;
      label.htmlFor = select.id;
      for (const choice of option.choices) select.add(new window.Option(choice.label, choice.value));
      select.value = displayValue(game.id, option);
      const image = document.createElement("img");
      image.className = "game-display-preview";
      const updatePreview = () => {
        const choice = option.choices.find((choice) => choice.value === select.value);
        image.hidden = !choice?.previewPath;
        image.alt = choice ? option.label + ": " + choice.label : "";
        if (choice?.previewPath) image.src = choice.previewPath;
      };
      select.addEventListener("change", () => {
        const current = displayPreferences[game.id];
        displayPreferences[game.id] = { ...(current && typeof current === "object" ? current : {}), [option.key]: select.value };
        try { localStorage.setItem(displayStorageKey, JSON.stringify(displayPreferences)); }
        catch { showToast("Display options will only last for this visit; browser storage is unavailable."); }
        updatePreview();
        for (const listener of displayChangeListeners.get(game.id) ?? []) listener();
      });
      updatePreview();
      row.append(label, select, image);
      section.append(row);
    }
    container.append(section);
  }
}
