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
    get isHost() { return isCurrentUserHost; },
    resetScoreboard: () => resetRoomScoreboard(gameId),
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
let roomRequiresJoinApproval = false;
let isCurrentUserHost = false;
let isCurrentUserSpectator = false;
let selectedGameId = null;
let currentGameSettings = {};
let currentPlayers = [];
let hasReceivedPlayerList = false;
let isRoomRequestPending = false;
let pendingEntryRequest = null;
let lifecycleGeneration = 0;
let pendingSettingsSave = null;
let pendingGameSelection = null;
let pendingSettingsExit = null;
let isGameSelectionPending = false;
let currentActiveGameId = null;
let activeGameIsPaused = false;
let activeGameIsBusy = false;
let roomHasActiveGame = false;
let currentSpectators = [];
let returningGameMemberIds = new Set();

const lastRoomStorageKey = "gamehub:last-room"; // Legacy browser-wide session.
const tabSessionStorageKey = "gamehub:tab-session";
const savedSessionsStorageKey = "gamehub:saved-sessions";
let activeResumeSession = readResumeStorage("sessionStorage", tabSessionStorageKey, null);
if (!isResumeSession(activeResumeSession)) activeResumeSession = null;
const resumeNavigationType = window.performance.getEntriesByType?.("navigation")[0]?.type;
if (activeResumeSession && resumeNavigationType && resumeNavigationType !== "reload") {
  activeResumeSession = null;
  writeResumeStorage("sessionStorage", tabSessionStorageKey, null);
}
let resumeRequestPending = false;
let resumeRequestGeneration = 0;
let pendingResumeClaim = null;
let resumeClaimKey = null;
let releaseResumeClaim = null;
const rejoinRoomButton = document.querySelector("#rejoin-room");
const rejoinModalElement = document.querySelector("#rejoin-room-modal");
const newPlayerButton = document.querySelector("#rejoin-as-new-player");
const reconnectingOverlay = document.querySelector("#reconnecting-overlay");
let rejoinCandidate = null;
let rejoinPromptShown = false;
let rejoinCheckPending = false;
let rejoinCheckComplete = false;
let rejoinCheckGeneration = 0;
let reconnectTimeout = null;
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

function loadKeybindOverrides(fallback = Object.create(null)) {
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
  return fallback;
}

const unsavedKeybindChanges = [];
function saveKeybindOverrides(change) {
  for (const listener of bindingChangeListeners) listener();
  unsavedKeybindChanges.push(change);
  const latest = loadKeybindOverrides(keybindOverrides);
  for (const { groupId, actionId, code, reset } of unsavedKeybindChanges) {
    if (reset) {
      delete latest[groupId]?.[actionId];
      if (Object.keys(latest[groupId] ?? {}).length === 0) delete latest[groupId];
    } else {
      latest[groupId] ??= Object.create(null);
      latest[groupId][actionId] = code;
    }
  }
  try {
    localStorage.setItem(keybindStorageKey, JSON.stringify(latest));
    unsavedKeybindChanges.length = 0;
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
  return saveKeybindOverrides({ groupId, actionId, code, reset: code === definition.defaultKey });
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

  if (event.target?.closest?.('[role="tab"]') || (event.code === "Space" && event.target?.closest?.("button"))) return;
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

function readResumeStorage(storage, key, fallback) {
  try { return JSON.parse(window[storage].getItem(key) ?? "null") ?? fallback; }
  catch { return fallback; }
}

function writeResumeStorage(storage, key, value) {
  try {
    if (value === null) window[storage].removeItem(key);
    else window[storage].setItem(key, JSON.stringify(value));
  } catch { /* The current page can still reconnect from memory. */ }
}

function isResumeSession(value) {
  return value && /^[A-Z0-9]{6}$/.test(value.roomCode) &&
    typeof value.resumeToken === "string" && value.resumeToken.length > 0 &&
    typeof value.playerName === "string" && value.playerName.length <= 20;
}

function readSavedSessions() {
  const saved = readResumeStorage("localStorage", savedSessionsStorageKey, []);
  return Array.isArray(saved) ? saved.filter(session => isResumeSession(session) &&
    Number.isFinite(session.savedAt) && Date.now() < (session.expiresAt ?? session.savedAt + 24 * 60 * 60 * 1000)).slice(0, 20) : [];
}

function resumeSessionKey(session) {
  return `${session.roomCode}:${session.playerName.toLocaleLowerCase()}`;
}

function useResumeClaim(session, onClaim) {
  const key = resumeSessionKey(session);
  if (!window.navigator.locks?.request || resumeClaimKey === key) { onClaim(); return; }
  if (pendingResumeClaim?.key === key) { pendingResumeClaim.callbacks.push(onClaim); return; }
  releaseResumeClaim?.();
  const request = { key, callbacks: [onClaim] };
  pendingResumeClaim = request;
  window.navigator.locks.request(`gamehub:player:${key}`, { ifAvailable: true }, async lock => {
    if (pendingResumeClaim !== request) return;
    pendingResumeClaim = null;
    if (!lock) {
      resumeRequestPending = false;
      activeResumeSession = null;
      writeResumeStorage("sessionStorage", tabSessionStorageKey, null);
      setRoomRequestPending(false);
      renderSavedSessions();
      stopReconnecting();
      dismissRejoinOffer();
      return;
    }
    resumeClaimKey = key;
    await new Promise(resolve => {
      releaseResumeClaim = () => { resumeClaimKey = null; releaseResumeClaim = null; resolve(); };
      for (const callback of request.callbacks) callback();
    });
  }).catch(() => {
    if (pendingResumeClaim !== request) return;
    pendingResumeClaim = null;
    resumeRequestPending = false;
    stopReconnecting();
    if (!rejoinCandidate && currentRoomCode === null) {
      clearResumeSession(null, false);
      rejoinPromptShown = false;
      rejoinCheckComplete = false;
    }
    setRoomRequestPending(false);
    showToast("Unable to restore that player. Try again.");
  });
}

function saveResumeSession(roomCode, resumeToken, playerName = playerNameInput.value.trim()) {
  const previousToken = activeResumeSession?.resumeToken;
  const session = { roomCode, resumeToken, playerName, savedAt: Date.now(), lastSeen: Date.now() };
  activeResumeSession = session;
  writeResumeStorage("sessionStorage", tabSessionStorageKey, session);
  const saved = readSavedSessions().filter(item => resumeSessionKey(item) !== resumeSessionKey(session) &&
    item.resumeToken !== previousToken && item.resumeToken !== resumeToken);
  writeResumeStorage("localStorage", savedSessionsStorageKey, [session, ...saved].slice(0, 20));
  useResumeClaim(session, () => {});
  renderSavedSessions();
}

function clearResumeSession(roomCode = null, forgetSaved = true) {
  stopReconnecting();
  pendingResumeClaim = null;
  resumeRequestGeneration++;
  const session = activeResumeSession;
  if (session && (roomCode === null || session.roomCode === roomCode)) {
    if (forgetSaved) writeResumeStorage("localStorage", savedSessionsStorageKey,
      readSavedSessions().filter(item => item.resumeToken !== session.resumeToken));
    activeResumeSession = null;
    writeResumeStorage("sessionStorage", tabSessionStorageKey, null);
  }
  releaseResumeClaim?.();
  resumeRequestPending = false;
  renderSavedSessions();
}

function stopReconnecting() {
  clearTimeout(reconnectTimeout);
  reconnectTimeout = null;
  reconnectingOverlay.hidden = true;
}

function beginReconnecting() {
  if (reconnectTimeout !== null) return;
  reconnectingOverlay.hidden = false;
  reconnectTimeout = setTimeout(() => {
    stopReconnecting();
    touchResumeSession();
    // Keep the saved identity, but stop this tab's automatic retry loop.
    clearResumeSession(null, false);
    resetRoomState();
    rejoinPromptShown = false;
    rejoinCheckComplete = false;
    showEntry();
    renderSavedSessions();
  }, 10_000);
}

function touchResumeSession() {
  if (!activeResumeSession) return;
  activeResumeSession.lastSeen = Date.now();
  writeResumeStorage("sessionStorage", tabSessionStorageKey, activeResumeSession);
  const saved = [activeResumeSession, ...readSavedSessions().filter(item => item.resumeToken !== activeResumeSession.resumeToken)]
    .sort((a, b) => (b.lastSeen ?? b.savedAt) - (a.lastSeen ?? a.savedAt)).slice(0, 20);
  writeResumeStorage("localStorage", savedSessionsStorageKey, saved);
}

let dismissingRejoinOffer = false;
function dismissRejoinOffer() {
  // Lifecycle cleanup must close the modal even while a room request is pending.
  dismissingRejoinOffer = true;
  try {
    if (rejoinCandidate || rejoinModalElement.classList.contains("show")) {
      bootstrap.Modal.getOrCreateInstance(rejoinModalElement).hide();
    }
    rejoinCandidate = null;
  } finally {
    dismissingRejoinOffer = false;
  }
}

function forgetSavedTokens(tokens) {
  writeResumeStorage("localStorage", savedSessionsStorageKey,
    readSavedSessions().filter(item => !tokens.has(item.resumeToken)));
}

async function offerSavedSession() {
  if (!socket.connected || currentRoomCode !== null || isRoomRequestPending || activeResumeSession ||
      rejoinPromptShown || rejoinCheckPending || rejoinCheckComplete) return;
  const saved = readSavedSessions().filter(session =>
    !/^[A-Z0-9]{6}$/.test(inviteRoomCode ?? "") || session.roomCode === inviteRoomCode);
  if (saved.length === 0) return;
  const generation = ++rejoinCheckGeneration;
  rejoinCheckPending = true;
  let heldLocks = new Set();
  try {
    const snapshot = await window.navigator.locks?.query?.();
    heldLocks = new Set((snapshot?.held ?? []).map(lock => lock.name));
  } catch { /* Server connection status remains authoritative when locks are unavailable. */ }
  if (generation !== rejoinCheckGeneration) return;
  socket.emit("check-resume-sessions", { tokens: saved.map(item => item.resumeToken) }, response => {
    if (generation !== rejoinCheckGeneration) return;
    rejoinCheckPending = false;
    if (!response.success || !Array.isArray(response.sessions)) return;
    rejoinCheckComplete = true;
    if (currentRoomCode !== null || isRoomRequestPending || activeResumeSession || rejoinPromptShown) return;
    const valid = new Map(response.sessions.map(item => [item.resumeToken, item]));
    const invalid = new Set(saved.filter(item => !valid.has(item.resumeToken)).map(item => item.resumeToken));
    forgetSavedTokens(invalid);
    const eligible = saved.flatMap(item => {
      const status = valid.get(item.resumeToken);
      if (!status || status.isConnected || heldLocks.has(`gamehub:player:${resumeSessionKey({ ...item, playerName: status.playerName })}`)) return [];
      return [{ ...item, ...status }];
    }).sort((a, b) => (b.lastSeen ?? b.savedAt) - (a.lastSeen ?? a.savedAt));
    const latest = eligible[0];
    if (!latest) return;
    rejoinCandidate = latest;
    rejoinPromptShown = true;
    rejoinRoomButton.textContent = `Rejoin as ${latest.playerName}`;
    document.querySelector("#rejoin-player-message").textContent = `Your player ${latest.playerName} is still in a room.`;
    document.querySelector("#rejoin-release-note").textContent = latest.releaseClosesRoom
      ? "Joining as a new player will close this room because no connected player can take over hosting."
      : latest.isHost
        ? "Joining as a new player releases your old seat and transfers hosting to a connected player."
        : "Joining as a new player releases your old seat first. You can then choose a new name.";
    bootstrap.Modal.getOrCreateInstance(rejoinModalElement).show();
    renderSavedSessions();
  });
}

function renderSavedSessions() {
  rejoinRoomButton.disabled = isRoomRequestPending || !rejoinCandidate;
  newPlayerButton.disabled = isRoomRequestPending || !rejoinCandidate;
  rejoinModalElement.querySelector(".btn-close").disabled = isRoomRequestPending;
  void offerSavedSession();
}

rejoinRoomButton.addEventListener("click", () => {
  if (isRoomRequestPending || currentRoomCode !== null || !rejoinCandidate) return;
  const session = rejoinCandidate;
  dismissRejoinOffer();
  resumeSavedRoom(session.roomCode, session.resumeToken, session.playerName, true);
});
newPlayerButton.addEventListener("click", () => {
  if (isRoomRequestPending || !rejoinCandidate) return;
  const session = rejoinCandidate;
  const generation = ++resumeRequestGeneration;
  setRoomRequestPending(true);
  useResumeClaim(session, () => {
    if (generation !== resumeRequestGeneration || currentRoomCode !== null) return;
    socket.emit("release-saved-player", { resumeToken: session.resumeToken }, response => {
      if (generation !== resumeRequestGeneration || currentRoomCode !== null) return;
      releaseResumeClaim?.();
      setRoomRequestPending(false);
      if (!response.success) { showToast(response.message); return; }
      forgetSavedTokens(new Set([session.resumeToken]));
      clearResumeSession(null, false);
      dismissRejoinOffer();
      roomCodeInput.value = response.roomClosed ? "" : session.roomCode;
      playerNameInput.value = "";
      playerNameInput.focus();
    });
  });
});
rejoinModalElement.addEventListener("hide.bs.modal", event => { if (isRoomRequestPending && !dismissingRejoinOffer) event.preventDefault(); });
rejoinModalElement.addEventListener("hidden.bs.modal", () => { rejoinCandidate = null; });
window.addEventListener("storage", event => {
  if (event.key === savedSessionsStorageKey || event.key === null) {
    rejoinCheckGeneration++;
    rejoinCheckPending = false;
    rejoinCheckComplete = false;
    // A rotating token or newly held lock invalidates an offer in another tab.
    if (rejoinCandidate && !readSavedSessions().some(item => item.resumeToken === rejoinCandidate.resumeToken)) dismissRejoinOffer();
    renderSavedSessions();
  }
});
window.addEventListener("pagehide", () => { touchResumeSession(); stopReconnecting(); rejoinCheckGeneration++; });
document.addEventListener("visibilitychange", () => { if (document.hidden) touchResumeSession(); });

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
  renderSavedSessions();

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
  const generation = lifecycleGeneration;
  const response = await requestGamePause(!activeGameIsPaused);
  if (generation === lifecycleGeneration && !response.success) showToast(response.message);
});

appGameExitButton.addEventListener("click", () => {
  if (appGameExitButton.disabled || pendingSettingsExit) return;
  const generation = lifecycleGeneration;
  const showConfirmation = () => {
    pendingSettingsExit = null;
    if (generation !== lifecycleGeneration || currentActiveGameId === null) return;
    const confirmationModal = isCurrentUserHost
      ? exitGameModalElement
      : isCurrentUserSpectator
        ? leaveSpectatorModalElement
        : leaveGameModalElement;
    bootstrap.Modal.getOrCreateInstance(confirmationModal).show();
  };
  if (appSettingsModalElement.classList.contains("show")) {
    pendingSettingsExit = showConfirmation;
    appSettingsModalElement.addEventListener("hidden.bs.modal", showConfirmation, { once: true });
    hideLifecycleModal(appSettingsModalElement);
  } else showConfirmation();
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

const lifecycleModals = [leaveGameModalElement, leaveSpectatorModalElement, exitGameModalElement, closeLobbyModalElement];
const activeLifecycleModals = new Set();
const pendingLifecycleModalHides = new WeakMap();
for (const element of lifecycleModals) {
  element.addEventListener("show.bs.modal", () => activeLifecycleModals.add(element));
  element.addEventListener("hidden.bs.modal", () => activeLifecycleModals.delete(element));
}
function hideLifecycleModal(element) {
  // show.bs.modal fires before the backdrop and dialog opening transitions.
  if (!activeLifecycleModals.has(element) && !element.classList.contains("show")) return;
  if (pendingLifecycleModalHides.has(element)) return;
  const modal = bootstrap.Modal.getOrCreateInstance(element);
  const hideAfterShow = () => modal.hide();
  const cleanup = () => {
    element.removeEventListener("shown.bs.modal", hideAfterShow);
    element.removeEventListener("hidden.bs.modal", cleanup);
    pendingLifecycleModalHides.delete(element);
  };
  pendingLifecycleModalHides.set(element, cleanup);
  element.addEventListener("shown.bs.modal", hideAfterShow, { once: true });
  element.addEventListener("hidden.bs.modal", cleanup, { once: true });
  modal.hide();
}
function invalidateLifecycleRequests() {
  lifecycleGeneration++;
  if (pendingSettingsExit) {
    appSettingsModalElement.removeEventListener("hidden.bs.modal", pendingSettingsExit);
    pendingSettingsExit = null;
  }
  pendingSettingsSave = null;
  invalidateGameSelection();
  for (const button of [leaveLobbyButton, confirmLeaveGameButton, confirmLeaveSpectatorButton, spectateGameButton, confirmExitGameButton, confirmCloseLobbyButton]) {
    button.disabled = false;
  }
  for (const element of lifecycleModals) hideLifecycleModal(element);
}

function showLobby(roomCode, isHost) {
  invalidateLifecycleRequests();
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
  gameDisconnections = [];
  renderRoomStatus();
  gameHubAudio.setScene("menu");
  entryView.classList.add("d-none");
  lobbyView.classList.remove("d-none");

  currentRoomCode = roomCode;
  roomCodeHidden = true;
  updateRoomCodeDisplay();

  isCurrentUserHost = isHost;
  document.querySelector("#room-join-controls").hidden = !isHost;
  updateHostTransferOptions();
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
  document.querySelector("#host-transfer-controls").hidden = true;
  document.querySelector("#join-request-count").textContent = "0";
  document.querySelector("#pending-join-requests").replaceChildren();
  roomRequiresJoinApproval = false;
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
  renderSavedSessions();
}

function showLobbyAfterLeavingGame(hasActiveGame = true, wasSpectator = false) {
  cancelScoreReset?.();
  placeAppUtilityControls(false);
  currentActiveGameId = null;
  activeGameIsPaused = false;
  activeGameIsBusy = false;
  gameDisconnections = [];
  renderRoomStatus();
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
  invalidateLifecycleRequests();
  pendingEntryRequest = null;
  cancelScoreReset?.();
  gameClientHost.unmount();
  currentRoomCode = null;
  roomCodeHidden = true;
  isRoomLocked = false;
  isCurrentUserHost = false;
  selectedGameId = null;
  currentGameSettings = {};
  currentPlayers = [];
  roomScoreboards.clear();
  hostRecovery = null;
  gameDisconnections = [];
  renderRoomStatus();
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

  const request = { roomCode: currentRoomCode, gameId };
  pendingGameSelection = request;
  isGameSelectionPending = true;
  gamePickerGrid.classList.add("is-pending");

  socket.emit(
    "select-game",
    {
      roomCode: currentRoomCode,
      gameId,
      ...(savedRuleSettings(selectedGame) ? { settings: savedRuleSettings(selectedGame) } : {})
    },
    (response) => {
      if (pendingGameSelection !== request || currentRoomCode !== request.roomCode || !isCurrentUserHost) return;
      invalidateGameSelection();

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

function invalidateGameSelection() {
  pendingGameSelection = null;
  isGameSelectionPending = false;
  gamePickerGrid.classList.remove("is-pending");
}
for (const event of ["show.bs.modal", "hide.bs.modal", "hidden.bs.modal"]) {
  gamePickerModalElement.addEventListener(event, invalidateGameSelection);
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
  renderPresetControls(game);

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

function resumeSavedRoom(roomCode, resumeToken, playerName = activeResumeSession?.playerName ?? "", onlyDisconnected = false) {
  if (resumeRequestPending) return;
  resumeRequestPending = true;
  const generation = ++resumeRequestGeneration;
  beginReconnecting();
  setRoomRequestPending(true);
  const session = { roomCode, resumeToken, playerName, savedAt: Date.now(), lastSeen: Date.now() };
  useResumeClaim(session, () => {
    if (generation !== resumeRequestGeneration) return;
    activeResumeSession = session;
    playerNameInput.value = playerName;
    writeResumeStorage("sessionStorage", tabSessionStorageKey, session);
    socket.emit("resume-room", { resumeToken, ...(onlyDisconnected ? { onlyDisconnected: true } : {}) }, response => {
      if (generation !== resumeRequestGeneration) return;
      resumeRequestPending = false;
      if (response.success) { stopReconnecting(); return; }
      // A snapshot/token rotation may already have restored a newer identity.
      if (activeResumeSession !== session) return;
      if (response.sessionUnavailable !== true) {
        // Keep the bounded recovery window and saved identity for temporary errors.
        showToast(response.message ?? "Unable to restore your room yet.");
        return;
      }
      rejoinCheckComplete = false;
      clearResumeSession(roomCode);
      resetRoomState();
      setRoomRequestPending(false);
      showEntry();
      showToast(response.message ?? "That saved room session is no longer available.");
    });
  });
}

function tryResumeCurrentTab() {
  const session = activeResumeSession;
  if (!session || (/^[A-Z0-9]{6}$/.test(inviteRoomCode ?? "") && session.roomCode !== inviteRoomCode)) return false;
  resumeSavedRoom(session.roomCode, session.resumeToken, session.playerName);
  return true;
}

socket.on("connect", () => {
  if (!socket.recovered) {
    if (!tryResumeCurrentTab() && currentRoomCode !== null) {
      resetRoomState();
      showEntry();
      showToast("Your room session could not be restored.");
    }
  }

  renderSavedSessions();
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
  invalidateLifecycleRequests();
  pendingEntryRequest = null;
  touchResumeSession();
  rejoinCheckGeneration++;
  rejoinCheckPending = false;
  rejoinCheckComplete = false;
  if (rejoinCandidate || (resumeRequestPending && !activeResumeSession)) {
    // An interrupted offer can be checked again after connection recovery.
    rejoinPromptShown = false;
  }
  if (!activeResumeSession) {
    pendingResumeClaim = null;
    releaseResumeClaim?.();
  }
  dismissRejoinOffer();
  if (activeResumeSession) beginReconnecting();
  resumeRequestPending = false;
  resumeRequestGeneration++;
  cancelScoreReset?.();
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
  pendingEntryRequest = null;
  stopReconnecting();
  dismissRejoinOffer();
  rejoinCheckGeneration++;
  rejoinCheckPending = false;
  resumeRequestPending = false;
  isRoomRequestPending = false;
  if (room.playerName) playerNameInput.value = room.playerName;
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
    if (tryResumeCurrentTab()) return;
    if (currentRoomCode === null) { renderSavedSessions(); return; }
  }

  stopReconnecting();
  clearResumeSession();
  resetRoomState();
  showEntry();
  showToast(
    message ?? "Your room session could not be restored."
  );
});

socket.on("room-session-replaced", () => {
  stopReconnecting();
  clearResumeSession(null, false);
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
  updateHostTransferOptions();
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
      const actions = document.createElement("div");
      actions.className = "d-flex gap-1 ms-auto flex-shrink-0";
      if (player.isConnected && (!roomHasActiveGame || player.isPlaying)) {
        const hostButton = document.createElement("button");
        hostButton.className = "btn btn-outline-primary btn-sm";
        hostButton.type = "button";
        hostButton.textContent = "Host";
        hostButton.setAttribute("aria-label", `Make ${player.name} the host`);
        hostButton.onclick = () => socket.emit("transfer-host", { memberId: player.id }, (result) => {
          if (!result.success) showToast(result.message);
        });
        actions.appendChild(hostButton);
      }
      actions.appendChild(createKickPlayerButton(player, "btn btn-outline-danger btn-sm"));
      listItem.appendChild(actions);
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
  if (isCurrentUserHost) rememberRules(gameId, settings);

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
  if (isCurrentUserHost) rememberRules(gameId, settings);

    displayGameInformation(
      selectedGame,
      currentGameSettings
    );
  }
);

function mountGameClient(game) {
  invalidateLifecycleRequests();
  cancelScoreReset?.();
  if (!gameClientHost.has(game.gameId)) {
    showToast("This game's browser client is not installed.");
    return;
  }

  lobbyView.classList.add("d-none");
  gameplayView.classList.remove("d-none");
  placeAppUtilityControls(true);
  currentActiveGameId = game.gameId;
  roomHasActiveGame = true;
  updateHostTransferOptions();
  activeGameIsPaused = game.isPaused === true;
  activeGameIsBusy = false;
  updateGameSettingsControls();
  gameClientHost.mount(game.gameId, game);
  gameClientHost.receivePlatformEvent({ type: "host-status", payload: {
    recoveryDeadline: hostRecovery, serverNow: Date.now() + roomClockOffset
  } });
  const scores = roomScoreboards.get(game.gameId);
  if (scores) gameClientHost.receivePlatformEvent({ type: "scoreboard", payload: scores });
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

socket.on("game-lifecycle", ({ gameId, isPaused, isBusy, disconnections = [], serverNow }) => {
  if (gameId !== currentActiveGameId) return;
  gameDisconnections = disconnections;
  if (Number.isFinite(serverNow)) roomClockOffset = serverNow - Date.now();
  activeGameIsPaused = isPaused === true;
  activeGameIsBusy = isBusy === true;
  renderRoomStatus();
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
  invalidateLifecycleRequests();
  cancelScoreReset?.();
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
  gameDisconnections = [];
  renderRoomStatus();
  updateGameSettingsControls();
  gameClientHost.unmount();
  gameplayView.classList.add("d-none");
  lobbyView.classList.remove("d-none");
  gameHubAudio.setScene("menu");
  isCurrentUserSpectator = false;
  updateLobbyGameAction();
  updateStartGameAvailability();
  const selectedGame = gameDefinitions.find((game) => game.id === selectedGameId);
  if (selectedGame) displayGameInformation(selectedGame, currentGameSettings);
  updateHostTransferOptions();
  gameStatus.textContent = message;
});

socket.on("kicked-from-room", ({ message }) => {
  clearResumeSession();
  resetRoomState();
  showEntry();
  showToast(message);
});

function leaveActiveGame(confirmButton, modalElement) {
  if (currentRoomCode === null || currentActiveGameId === null || isCurrentUserHost) {
    return;
  }

  const wasSpectator = isCurrentUserSpectator;
  const generation = lifecycleGeneration;
  confirmButton.disabled = true;
  socket.emit(
    "leave-game",
    { roomCode: currentRoomCode },
    (response) => {
      if (generation !== lifecycleGeneration) return;
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

  const generation = lifecycleGeneration;
  const roomCode = currentRoomCode;
  leaveLobbyButton.disabled = true;
  socket.emit(
    "leave-lobby",
    { roomCode: currentRoomCode },
    (response) => {
      if (generation !== lifecycleGeneration) return;
      leaveLobbyButton.disabled = false;

      if (!response.success) {
        showToast(response.message);
        return;
      }

      clearResumeSession(roomCode);
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

  const generation = lifecycleGeneration;
  confirmCloseLobbyButton.disabled = true;
  socket.emit(
    "close-room",
    { roomCode: currentRoomCode },
    (response) => {
      if (generation !== lifecycleGeneration) return;
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
  if (currentRoomCode === null || currentActiveGameId === null || !isCurrentUserHost) {
    return;
  }

  const generation = lifecycleGeneration;
  confirmExitGameButton.disabled = true;
  socket.emit(
    "close-game-to-lobby",
    { roomCode: currentRoomCode },
    (response) => {
      if (generation !== lifecycleGeneration) return;
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

for (const event of ["show.bs.modal", "hide.bs.modal", "hidden.bs.modal"]) {
  settingsModalElement.addEventListener(event, () => { pendingSettingsSave = null; });
}

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

  const request = { roomCode: currentRoomCode, gameId: selectedGameId };
  pendingSettingsSave = request;
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
      roomCode: request.roomCode,
      settings
    },
    (response) => {
      if (pendingSettingsSave !== request || currentRoomCode !== request.roomCode ||
          selectedGameId !== request.gameId || !isCurrentUserHost) return;
      pendingSettingsSave = null;
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

  const request = { type: "create", playerName };
  pendingEntryRequest = request;
  setRoomRequestPending(true);
  hasReceivedPlayerList = false;

  socket.emit(
    "create-room",
    {
      playerName,
      avatar: selectedAvatar
    },
    (response) => {
      if (pendingEntryRequest !== request || currentRoomCode !== null) return;
      pendingEntryRequest = null;
      if (!response.success) {
        setRoomRequestPending(false);
        showToast(response.message);
        return;
      }

      isRoomRequestPending = false;
      showLobby(response.roomCode, true);
      saveResumeSession(response.roomCode, response.resumeToken, response.playerName ?? request.playerName);

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

  const generation = lifecycleGeneration;
  spectateGameButton.disabled = true;
  socket.emit(
    "spectate-game",
    { roomCode: currentRoomCode },
    (response) => {
      if (generation !== lifecycleGeneration) return;
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
    const request = pendingEntryRequest;
    socket.emit("cancel-join-request", {}, () => {
      if (pendingEntryRequest !== request || currentRoomCode !== null) return;
      pendingEntryRequest = null;
      setRoomRequestPending(false);
    });
    return;
  }
  if (isRoomRequestPending || currentRoomCode !== null) {
    return;
  }

  const roomCode = roomCodeInput.value.trim().toUpperCase();
  const playerName = playerNameInput.value.trim();
  const selectedAvatar = avatars[selectedAvatarIndex];

  const request = { type: "join", playerName };
  pendingEntryRequest = request;
  setRoomRequestPending(true);
  hasReceivedPlayerList = false;

  socket.emit(
    "join-room",
    {
      roomCode,
      playerName,
      avatar: selectedAvatar
    },
    response => finishJoiningRoom(response, request)
  );
});

function finishJoiningRoom(response, request) {
  if (!request || request.type !== "join" || pendingEntryRequest !== request || currentRoomCode !== null) return;
  if (response.pendingApproval) {
    joinRoomButton.dataset.awaitingApproval = "true";
    joinRoomButton.disabled = false;
    joinRoomButton.textContent = "Cancel Request";
    showToast("Waiting for the host to approve your join request (up to 60 seconds).");
    return;
  }
  pendingEntryRequest = null;
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
  saveResumeSession(response.roomCode, response.resumeToken, response.playerName ?? request.playerName);

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
  const request = pendingEntryRequest;
  if (request?.type !== "join" || !joinRoomButton.dataset.awaitingApproval) return;
  finishJoiningRoom(response, request);
  if (response.success) showToast("The host accepted your join request.");
});
socket.on("room-approval-changed", ({ requiresJoinApproval }) => {
  roomRequiresJoinApproval = requiresJoinApproval === true;
  document.querySelector("#require-join-approval").checked = roomRequiresJoinApproval;
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
  const generation = lifecycleGeneration;
  socket.emit("set-room-approval", { enabled: event.target.checked }, (response) => {
    if (generation !== lifecycleGeneration || !isCurrentUserHost) return;
    if (!response.success) { event.target.checked = roomRequiresJoinApproval; showToast(response.message); }
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
  const roomCode = currentRoomCode;
  if (!roomCode) return;
  try {
    await window.navigator.clipboard.writeText(roomCode);
    showToast("Room code copied.");
  } catch {
    window.prompt("Copy this room code:", roomCode);
  }
}
document.querySelector("#copy-invite-link").addEventListener("click", copyRoomInvite);
document.querySelector("#copy-room-code").addEventListener("click", copyRoomCode);

const displayStorageKey = "gamehub:display-options";
const displayChangeListeners = new Map();
function readDisplayPreferences(fallback = {}) {
  try {
    const saved = JSON.parse(localStorage.getItem(displayStorageKey) ?? "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch { return fallback; }
}
let displayPreferences = readDisplayPreferences();
const unsavedDisplayChanges = new Map();
function saveDisplayChoice(gameId, key, value) {
  const current = displayPreferences[gameId];
  displayPreferences[gameId] = { ...(current && typeof current === "object" ? current : {}), [key]: value };
  unsavedDisplayChanges.set(gameId, { ...unsavedDisplayChanges.get(gameId), [key]: value });
  const persist = () => {
    const latest = readDisplayPreferences(displayPreferences);
    for (const [id, changes] of unsavedDisplayChanges) {
      latest[id] = { ...latest[id], ...changes };
    }
    try {
      localStorage.setItem(displayStorageKey, JSON.stringify(latest));
      unsavedDisplayChanges.clear();
    } catch {
      showToast("Display options will only last for this visit; browser storage is unavailable.");
    }
  };
  if (window.navigator.locks?.request) {
    void window.navigator.locks.request(displayStorageKey, async () => {
      persist();
      // Let the storage write leave this task before another tab gets the lock.
      await new Promise(resolve => setTimeout(resolve, 0));
    }).catch(() => persist());
  } else persist();
}

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
        saveDisplayChoice(game.id, option.key, select.value);
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

// Presets are browser-only and always validated against the current game's schema.
const ruleStorageKey = "gamehub:rule-presets";
function readRulePreferences(fallback = {}) {
  try {
    const saved = JSON.parse(localStorage.getItem(ruleStorageKey) ?? "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch { return fallback; }
}
let rulePreferences = readRulePreferences();
let unsavedRuleChanges = [];
let refreshPresetControls = null;
function applyRuleChange(preferences, change) {
  const previous = preferences[change.gameId];
  if (change.type === "last") {
    preferences[change.gameId] = { ...previous, last: change.settings };
    return;
  }
  const presets = savedRulePresets(preferences, change.gameId).filter(preset => preset.name !== change.name);
  if (change.type === "save") presets.push({ name: change.name, settings: change.settings });
  preferences[change.gameId] = { ...previous, presets };
}
function refreshRulePreferences() {
  rulePreferences = readRulePreferences(rulePreferences);
  // Replay only unpersisted edits, preserving unrelated updates from other tabs.
  for (const change of unsavedRuleChanges) applyRuleChange(rulePreferences, change);
}
function updateRulePreferences(change, notify = false, onSaved = () => {}) {
  const apply = () => {
    refreshRulePreferences();
    if (change.type === "save" && savedRulePresets(rulePreferences, change.gameId)
      .filter(preset => preset.name !== change.name).length >= 20) {
      showToast("Delete a preset before adding another (maximum 20 per game).");
      return;
    }
    applyRuleChange(rulePreferences, change);
    unsavedRuleChanges.push(change);
    let persisted = true;
    try {
      localStorage.setItem(ruleStorageKey, JSON.stringify(rulePreferences));
      unsavedRuleChanges = [];
    }
    catch { persisted = false; if (notify) showToast("Browser storage is unavailable. Presets will last only for this visit."); }
    refreshPresetControls?.();
    onSaved(persisted);
  };
  // Serialize concurrent tab writes where supported; always reread before mutation.
  if (window.navigator.locks?.request) {
    void window.navigator.locks.request(ruleStorageKey, apply).catch(() => apply());
  } else apply();
}
window.addEventListener("storage", event => {
  if (event.key !== ruleStorageKey && event.key !== null) return;
  refreshRulePreferences();
  refreshPresetControls?.();
});
function savedRulePresets(preferences, gameId) {
  const saved = preferences[gameId]?.presets;
  return Array.isArray(saved) ? saved.filter(preset => typeof preset?.name === "string" &&
    preset.settings && typeof preset.settings === "object" && !Array.isArray(preset.settings)) : [];
}
function validSavedRules(game, source) {
  if (!source || typeof source !== "object") return null;
  return Object.fromEntries(game.settings.map((setting) => {
    const value = source[setting.key];
    const valid = setting.type !== "number" ? typeof value === "boolean"
      : Number.isInteger(value) && (setting.control === "range"
        ? value >= setting.min && value <= setting.max && (value - setting.min) % setting.step === 0
        : setting.options.includes(value));
    return [setting.key, valid ? value : setting.defaultValue];
  }));
}
function savedRuleSettings(game) {
  refreshRulePreferences();
  return validSavedRules(game, rulePreferences[game.id]?.last);
}
function rememberRules(gameId, settings) {
  updateRulePreferences({ type: "last", gameId, settings });
}
function readRuleDraft() {
  return Object.fromEntries([...settingsModalBody.querySelectorAll("[data-setting-key]")].map((input) => [
    input.dataset.settingKey, input.dataset.settingType === "number" ? Number(input.value) : input.checked
  ]));
}
function renderPresetControls(game) {
  refreshPresetControls = null;
  if (!isCurrentUserHost || roomHasActiveGame) return;
  const toolbar = document.createElement("div");
  toolbar.className = "rule-presets mb-4";
  toolbar.innerHTML = '<label class="form-label" for="rule-preset">Load a preset</label><div class="d-flex gap-2 mb-3"><select id="rule-preset" class="form-select form-select-sm" aria-label="Saved rule preset"></select><button class="btn btn-outline-danger btn-sm" type="button" data-preset-action="delete">Delete</button></div><label class="form-label" for="rule-preset-name">Create a preset</label><div class="d-flex gap-2"><input id="rule-preset-name" class="form-control form-control-sm" maxlength="40" placeholder="Preset name" aria-label="Preset name"><button class="btn btn-outline-primary btn-sm" type="button" data-preset-action="save">Save preset</button></div><p class="small text-body-secondary mb-0 mt-1">Saved in this browser. Selecting a preset loads this draft. Use Save Settings to apply it to the room.</p>';
  const select = toolbar.querySelector("select"), name = toolbar.querySelector("input");
  const presets = () => savedRulePresets(rulePreferences, game.id);
  const refresh = () => {
    const selected = select.value;
    select.replaceChildren();
    for (const preset of presets()) select.add(new window.Option(preset.name, preset.name));
    select.disabled = select.options.length === 0;
    toolbar.querySelector('[data-preset-action="delete"]').disabled = select.disabled;
    select.value = selected;
  };
  refreshPresetControls = () => { if (toolbar.isConnected) refresh(); };
  select.onchange = () => {
    const preset = presets().find((preset) => preset.name === select.value);
    if (!preset) return;
    const settings = validSavedRules(game, preset.settings);
    for (const input of settingsModalBody.querySelectorAll("[data-setting-key]")) {
      if (input.dataset.settingType === "number") input.value = settings[input.dataset.settingKey];
      else input.checked = settings[input.dataset.settingKey];
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    }
  };
  toolbar.querySelector('[data-preset-action="save"]').onclick = () => {
    const title = name.value.trim();
    if (!title) { name.focus(); return; }
    const settings = validSavedRules(game, readRuleDraft());
    updateRulePreferences({ type: "save", gameId: game.id, name: title, settings }, true, persisted => {
      if (toolbar.isConnected) select.value = title;
      showToast(persisted ? "Preset saved in this browser." : "Preset saved for this visit; browser storage is unavailable.");
    });
  };
  toolbar.querySelector('[data-preset-action="delete"]').onclick = () => {
    const title = select.value;
    if (!title) return;
    updateRulePreferences({ type: "delete", gameId: game.id, name: title }, true);
  };
  refresh(); settingsModalBody.appendChild(toolbar);
}

const roomScoreboards = new Map();
let hostRecovery = null;
let roomClockOffset = 0;
let gameDisconnections = [];
function updateHostTransferOptions() {
  const section = document.querySelector("#host-transfer-controls");
  section.hidden = !isCurrentUserHost || currentRoomCode === null;
  const select = document.querySelector("#host-transfer-player");
  const previous = select.value;
  select.replaceChildren();
  for (const player of currentPlayers.filter(player => !player.isHost && player.isConnected && (!roomHasActiveGame || player.isPlaying))) {
    select.add(new window.Option(player.name, player.id));
  }
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  select.disabled = select.options.length === 0;
  document.querySelector("#transfer-host").disabled = select.disabled;
}
document.querySelector("#transfer-host").onclick = () => {
  const memberId = document.querySelector("#host-transfer-player").value;
  if (memberId) socket.emit("transfer-host", { memberId }, result => {
    if (!result.success) showToast(result.message);
  });
};
function renderRoomStatus() {
  const now = Date.now() + roomClockOffset;
  const seconds = (deadline) => Math.max(0, Math.ceil((deadline - now) / 1000));
  document.querySelector("#room-host-status").hidden = !hostRecovery;
  document.querySelector("#room-host-status").textContent = hostRecovery
    ? `Host disconnected. Control transfers to a connected player in ${seconds(hostRecovery)}s; the room closes if nobody is available.` : "";
  document.querySelector("#app-disconnect-status").textContent = gameDisconnections.length
    ? `${activeGameIsPaused ? "Paused" : "Running"}: ` + gameDisconnections.map((member) => `${member.name}: ${member.autoPlaying ? "auto-playing" : member.autoPlayAt ? `auto-play in ${seconds(member.autoPlayAt)}s` : "waiting for reconnection"}`).join("; ") : "";
}
setInterval(renderRoomStatus, 1000);
socket.on("room-host", ({ hostId, recoveryDeadline, serverNow }) => {
  if (recoveryDeadline && !hostRecovery) showToast("The room host disconnected. Control transfers after 60 seconds if they do not return.");
  hostRecovery = recoveryDeadline;
  if (Number.isFinite(serverNow)) roomClockOffset = serverNow - Date.now();
  const changed = isCurrentUserHost !== (hostId === socket.id);
  isCurrentUserHost = hostId === socket.id;
  if (!isCurrentUserHost) cancelScoreReset?.();
  if (changed && currentRoomCode !== null) {
    closeLobbyButton.classList.toggle("d-none", !isCurrentUserHost);
    leaveLobbyButton.classList.toggle("d-none", isCurrentUserHost);
    toggleRoomLockButton.classList.toggle("d-none", !isCurrentUserHost);
    startGameButton.classList.toggle("d-none", !isCurrentUserHost);
    document.querySelector("#room-join-controls").hidden = !isCurrentUserHost;
    document.querySelector("#review-joiners").classList.toggle("d-none", !isCurrentUserHost || Number(document.querySelector("#join-request-count").textContent) === 0);
    updateGameSettingsControls(); updateGamePicker(); updateStartGameAvailability();
    const game = gameDefinitions.find((game) => game.id === selectedGameId);
    if (game) displayGameInformation(game, currentGameSettings);
    gameClientHost.receivePlatformEvent({ type: "host-changed", payload: { isHost: isCurrentUserHost } });
    showToast(isCurrentUserHost ? "You are now the room host." : "Room host changed.");
  }
  updateHostTransferOptions();
  renderRoomStatus();
  gameClientHost.receivePlatformEvent({ type: "host-status", payload: { recoveryDeadline, serverNow } });
});
let pendingScoreReset = null;
let cancelScoreReset = null;
function resetRoomScoreboard(gameId) {
  if (!isCurrentUserHost || currentRoomCode === null || currentActiveGameId !== gameId) {
    return Promise.resolve({ success: false, message: "Only the host can reset totals for the active game." });
  }
  if (pendingScoreReset) return pendingScoreReset;
  const roomCode = currentRoomCode;
  const element = document.querySelector("#reset-scoreboard-modal");
  const button = document.querySelector("#confirm-reset-scoreboard");
  const modal = bootstrap.Modal.getOrCreateInstance(element);
  const hide = () => {
    // Bootstrap ignores hide() during the opening transition.
    const hideAfterShow = () => modal.hide();
    element.addEventListener("shown.bs.modal", hideAfterShow, { once: true });
    element.addEventListener("hidden.bs.modal", () => {
      element.removeEventListener("shown.bs.modal", hideAfterShow);
    }, { once: true });
    modal.hide();
  };
  pendingScoreReset = new Promise(resolve => {
    let finished = false;
    const finish = result => {
      if (finished) return;
      finished = true;
      button.removeEventListener("click", confirm);
      element.removeEventListener("hidden.bs.modal", cancel);
      button.disabled = false;
      pendingScoreReset = null;
      cancelScoreReset = null;
      resolve(result);
    };
    const cancel = () => finish({ success: true });
    cancelScoreReset = () => { cancel(); hide(); };
    const confirm = () => {
      if (button.disabled) return;
      if (currentRoomCode !== roomCode || currentActiveGameId !== gameId || !isCurrentUserHost) {
        cancelScoreReset?.();
        return;
      }
      button.disabled = true;
      socket.emit("reset-room-scoreboard", { gameId }, result => {
        if (finished) return;
        finish(result);
        hide();
      });
    };
    button.addEventListener("click", confirm);
    element.addEventListener("hidden.bs.modal", cancel);
    modal.show();
  });
  return pendingScoreReset;
}
socket.on("room-scoreboard", (scores) => {
  roomScoreboards.set(scores.gameId, scores);
  if (scores.gameId === currentActiveGameId) gameClientHost.receivePlatformEvent({ type: "scoreboard", payload: scores });
});

// Preserve older saved players as an explicit choice, never an automatic takeover.
try {
  const roomCode = localStorage.getItem(lastRoomStorageKey);
  const resumeToken = roomCode ? localStorage.getItem(`gamehub:resume:${roomCode}`) : null;
  if (roomCode && resumeToken && /^[A-Z0-9]{6}$/.test(roomCode)) {
    const saved = readSavedSessions();
    if (!saved.some(session => session.resumeToken === resumeToken)) {
      saved.push({ roomCode, resumeToken, playerName: "", savedAt: Date.now() });
      writeResumeStorage("localStorage", savedSessionsStorageKey, saved.slice(0, 20));
    }
    localStorage.removeItem(`gamehub:resume:${roomCode}`);
    localStorage.removeItem(lastRoomStorageKey);
  }
} catch { /* Browser storage is optional. */ }
renderSavedSessions();

if (activeResumeSession && (!inviteRoomCode || activeResumeSession.roomCode === inviteRoomCode)) beginReconnecting();
