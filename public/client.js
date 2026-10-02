const socket = io();

const connectionStatus = document.querySelector("#connection-status");

const createRoomButton = document.querySelector("#create-room");
const createdRoom = document.querySelector("#created-room");
const playerList = document.querySelector("#player-list");

const gameSelect = document.querySelector("#game-select");
const startGameButton = document.querySelector("#start-game");
const gameStatus = document.querySelector("#game-status");

const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
const playerNameInput = document.querySelector("#player-name");
const joinResult = document.querySelector("#join-result");

let hostedRoomCode = null;

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

  createdRoom.textContent = "";
  joinResult.textContent = "";
  gameStatus.textContent = "";
  playerList.replaceChildren();

  createRoomButton.disabled = false;
  startGameButton.disabled = true;
  joinRoomButton.disabled = false;
  roomCodeInput.disabled = false;
  playerNameInput.disabled = false;
});

socket.on("available-games", (games) => {
  gameSelect.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select a game";
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
    listItem.className = "list-group-item";
    listItem.textContent = player.name;
    playerList.appendChild(listItem);
  }
});

socket.on("game-started", (game) => {
  gameStatus.textContent = `${game.name} is starting!`;
});

socket.on("room-closed", () => {
  joinResult.textContent = "The host closed the room.";
  gameStatus.textContent = "";

  joinRoomButton.disabled = false;
  roomCodeInput.disabled = false;
  playerNameInput.disabled = false;
});

gameSelect.addEventListener("change", () => {
  startGameButton.disabled =
    hostedRoomCode === null || gameSelect.value === "";
});

createRoomButton.addEventListener("click", () => {
  socket.emit("create-room", (response) => {
    if (!response.success) {
      createdRoom.textContent = "Unable to create room.";
      return;
    }

    hostedRoomCode = response.roomCode;
    createdRoom.textContent = `Room code: ${response.roomCode}`;

    createRoomButton.disabled = true;
    startGameButton.disabled = gameSelect.value === "";
  });
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

  socket.emit(
    "join-room",
    {
      roomCode,
      playerName
    },
    (response) => {
      if (!response.success) {
        joinResult.textContent = response.message;
        return;
      }

      joinResult.textContent =
        `Joined room ${response.roomCode} as ${response.playerName}.`;

      joinRoomButton.disabled = true;
      roomCodeInput.disabled = true;
      playerNameInput.disabled = true;
    }
  );
});