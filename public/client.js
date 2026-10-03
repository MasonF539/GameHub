const socket = io();

const connectionStatus = document.querySelector("#connection-status");

const entryView = document.querySelector("#entry-view");
const lobbyView = document.querySelector("#lobby-view");

const createRoomButton = document.querySelector("#create-room");
const createdRoom = document.querySelector("#created-room");
const toggleRoomCodeButton = document.querySelector("#toggle-room-code");
const playerList = document.querySelector("#player-list");

const gameSelect = document.querySelector("#game-select");
const startGameButton = document.querySelector("#start-game");
const gameStatus = document.querySelector("#game-status");

const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
const playerNameInput = document.querySelector("#player-name");
const previousAvatarButton = document.querySelector("#previous-avatar");
const avatarPreview = document.querySelector("#avatar-preview");
const nextAvatarButton = document.querySelector("#next-avatar");
const joinResult = document.querySelector("#join-result");

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
let hostedRoomCode = null;
let currentRoomCode = "";
let roomCodeHidden = false;

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

function showLobby(roomCode, isHost) {
  entryView.classList.add("d-none");
  lobbyView.classList.remove("d-none");

  currentRoomCode = roomCode;
  roomCodeHidden = false;
  updateRoomCodeDisplay();

  startGameButton.classList.toggle("d-none", !isHost);
}

function showEntry() {
  lobbyView.classList.add("d-none");
  entryView.classList.remove("d-none");
}

toggleRoomCodeButton.addEventListener("click", () => {
  roomCodeHidden = !roomCodeHidden;
  updateRoomCodeDisplay();
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

  hostedRoomCode = null;
  showEntry();

  createdRoom.textContent = "";
  joinResult.textContent = "";
  gameStatus.textContent = "";
  playerList.replaceChildren();

  createRoomButton.disabled = false;
  startGameButton.disabled = true;
  joinRoomButton.disabled = false;
  roomCodeInput.disabled = false;
  playerNameInput.disabled = false;
  previousAvatarButton.disabled = false;
  nextAvatarButton.disabled = false;
});

socket.on("available-games", (games) => {
  gameSelect.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Choose a game…";
  defaultOption.disabled = true;
  defaultOption.selected = true;
  gameSelect.appendChild(defaultOption);

  for (const game of games) {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = game.name;
    gameSelect.appendChild(option);
  }
});

socket.on("player-list", (players) => {
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
    playerName.textContent = player.isHost
      ? `${player.name} (Host)`
      : player.name;

    listItem.append(avatar, playerName);
    playerList.appendChild(listItem);
  }
});

socket.on("game-started", (game) => {
  gameStatus.textContent = `${game.name} is starting!`;
});

socket.on("room-closed", () => {
  hostedRoomCode = null;
  showEntry();

  joinResult.textContent = "The host closed the room.";
  gameStatus.textContent = "";

  joinRoomButton.disabled = false;
  roomCodeInput.disabled = false;
  playerNameInput.disabled = false;
  previousAvatarButton.disabled = false;
  nextAvatarButton.disabled = false;
});

gameSelect.addEventListener("change", () => {
  startGameButton.disabled =
    hostedRoomCode === null || gameSelect.value === "";
});

createRoomButton.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim();
  const selectedAvatar = avatars[selectedAvatarIndex];

  socket.emit(
    "create-room",
    {
      playerName,
      avatar: selectedAvatar
    },
    (response) => {
      if (!response.success) {
        joinResult.textContent = response.message;
        return;
      }

      hostedRoomCode = response.roomCode;

      showLobby(response.roomCode, true);

      createRoomButton.disabled = true;
      startGameButton.disabled = gameSelect.value === "";
    }
  );
});

startGameButton.addEventListener("click", () => {
  if (hostedRoomCode === null) {
    gameStatus.textContent = "Create a room first.";
    return;
  }

  socket.emit(
    "start-game",
    {
      roomCode: hostedRoomCode,
      gameId: gameSelect.value
    },
    (response) => {
      if (!response.success) {
        gameStatus.textContent = response.message;
      }
    }
  );
});

joinRoomButton.addEventListener("click", () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  const playerName = playerNameInput.value.trim();
  const selectedAvatar = avatars[selectedAvatarIndex];

  socket.emit(
    "join-room",
    {
      roomCode,
      playerName,
      avatar: selectedAvatar
    },
    (response) => {
      if (!response.success) {
        joinResult.textContent = response.message;
        return;
      }

      joinResult.textContent =
        `Joined room ${response.roomCode} as ${response.playerName}.`;

      showLobby(response.roomCode, false);

      joinRoomButton.disabled = true;
      roomCodeInput.disabled = true;
      playerNameInput.disabled = true;
      previousAvatarButton.disabled = true;
      nextAvatarButton.disabled = true;
    }
  );
});