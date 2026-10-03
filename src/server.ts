import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { egyptianWar } from "./games/egyptianWar.js";

type Player = {
  id: string;
  name: string;
  avatar: string;
};

type Room = {
  hostId: string;
  players: Map<string, Player>;
  selectedGameId: string | null;
  gameSettings: Record<string, boolean>;
  isLocked: boolean;
  activeGameId: string | null;
};

const availableAvatars = [
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

const availableGames = [
  egyptianWar
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = Number(process.env.PORT) || 3000;
const maxLobbyPlayers = 12;
const rooms = new Map<string, Room>();

app.use(
  "/vendor/bootstrap",
  express.static(
    path.join(process.cwd(), "node_modules", "bootstrap", "dist")
  )
);

app.use(express.static(path.join(process.cwd(), "public")));

function generateRoomCode(): string {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  do {
    code = "";

    for (let index = 0; index < 6; index += 1) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      code += characters[randomIndex];
    }
  } while (rooms.has(code));

  return code;
}

function sendPlayerList(roomCode: string, room: Room): void {
  const players = Array.from(room.players.values()).map((player) => ({
    ...player,
    isHost: player.id === room.hostId
  }));

  io.to(roomCode).emit("player-list", players);
}

function createDefaultSettings(
  gameId: string
): Record<string, boolean> | null {
  const game = availableGames.find((item) => item.id === gameId);

  if (!game) {
    return null;
  }

  return Object.fromEntries(
    game.settings.map((setting) => [
      setting.key,
      setting.defaultValue
    ])
  );
}

io.on("connection", (socket) => {
  console.log(`Browser connected: ${socket.id}`);

  socket.emit("available-games", availableGames);

  socket.on("create-room", (data, respond) => {
    const playerName = String(data?.playerName ?? "").trim();
    const avatar = String(data?.avatar ?? "");

    if (playerName.length < 1 || playerName.length > 20) {
      respond({
        success: false,
        message: "Enter a name between 1 and 20 characters."
      });
      return;
    }

    if (!availableAvatars.includes(avatar)) {
      respond({
        success: false,
        message: "Select a valid avatar."
      });
      return;
    }

    const roomCode = generateRoomCode();

    const room: Room = {
      hostId: socket.id,
      players: new Map(),
      selectedGameId: null,
      gameSettings: {},
      isLocked: false,
      activeGameId: null
    };

    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      avatar
    });

    rooms.set(roomCode, room);
    socket.join(roomCode);

    sendPlayerList(roomCode, room);

    console.log(`Room ${roomCode} created by ${playerName}`);

    respond({
      success: true,
      roomCode,
      playerName
    });
  });

  socket.on("join-room", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "").trim().toUpperCase();
    const playerName = String(data?.playerName ?? "").trim();
    const avatar = String(data?.avatar ?? "");

    if (roomCode.length !== 6) {
      respond({
        success: false,
        message: "Enter a valid six-character room code."
      });
      return;
    }

    if (playerName.length < 1 || playerName.length > 20) {
      respond({
        success: false,
        message: "Enter a name between 1 and 20 characters."
      });
      return;
    }

    if (!availableAvatars.includes(avatar)) {
      respond({
        success: false,
        message: "Select a valid avatar."
      });
      return;
    }

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room does not exist."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message:
          "This game is already in progress. Spectator mode is not available yet."
      });
      return;
    }

    if (room.isLocked) {
      respond({
        success: false,
        message: "This lobby is locked by the host."
      });
      return;
    }

    if (room.players.size >= maxLobbyPlayers) {
      respond({
        success: false,
        message:
          `This lobby is full. It only allows up to ` +
          `${maxLobbyPlayers} players.`
      });
      return;
    }

    room.players.set(socket.id, {
      id: socket.id,
      name: playerName,
      avatar
    });

    socket.join(roomCode);
    sendPlayerList(roomCode, room);

    socket.emit("room-lock-changed", {
      isLocked: room.isLocked
    });

    if (room.selectedGameId !== null) {
      socket.emit("game-selected", {
        gameId: room.selectedGameId,
        settings: room.gameSettings
      });
    }

    console.log(`${playerName} joined room ${roomCode}`);

    respond({
      success: true,
      roomCode,
      playerName
    });
  });

  socket.on("select-game", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const gameId = String(data?.gameId ?? "");
    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can select a game."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message: "A game is already in progress."
      });
      return;
    }

    const game = availableGames.find((item) => item.id === gameId);

    if (!game) {
      respond({
        success: false,
        message: "Select a valid game."
      });
      return;
    }

    const defaultSettings = createDefaultSettings(game.id);

    if (!defaultSettings) {
      respond({
        success: false,
        message: "Unable to create the game settings."
      });
      return;
    }

    room.selectedGameId = game.id;
    room.gameSettings = defaultSettings;

    io.to(roomCode).emit("game-selected", {
      gameId: game.id,
      settings: room.gameSettings
    });

    console.log(`${game.name} selected in room ${roomCode}`);

    respond({
      success: true
    });
  });

  socket.on("update-game-settings", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can change game settings."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message: "Settings cannot change after the game starts."
      });
      return;
    }

    if (room.selectedGameId === null) {
      respond({
        success: false,
        message: "Select a game before changing its settings."
      });
      return;
    }

    const game = availableGames.find(
      (item) => item.id === room.selectedGameId
    );

    if (!game) {
      respond({
        success: false,
        message: "The selected game is unavailable."
      });
      return;
    }

    const submittedSettings = data?.settings;

    if (
      typeof submittedSettings !== "object" ||
      submittedSettings === null
    ) {
      respond({
        success: false,
        message: "Invalid game settings."
      });
      return;
    }

    const validatedSettings: Record<string, boolean> = {};

    for (const setting of game.settings) {
      const value = submittedSettings[setting.key];

      if (typeof value !== "boolean") {
        respond({
          success: false,
          message: `Invalid value for ${setting.label}.`
        });
        return;
      }

      validatedSettings[setting.key] = value;
    }

    room.gameSettings = validatedSettings;

    io.to(roomCode).emit("game-settings-updated", {
      gameId: game.id,
      settings: room.gameSettings
    });

    console.log(`Settings updated in room ${roomCode}`);

    respond({
      success: true
    });
  });

  socket.on("set-room-locked", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can lock or unlock the lobby."
      });
      return;
    }

    if (typeof data?.isLocked !== "boolean") {
      respond({
        success: false,
        message: "Invalid lobby lock setting."
      });
      return;
    }

    room.isLocked = data.isLocked;

    io.to(roomCode).emit("room-lock-changed", {
      isLocked: room.isLocked
    });

    console.log(
      `Room ${roomCode} ${room.isLocked ? "locked" : "unlocked"}`
    );

    respond({
      success: true
    });
  });

  socket.on("kick-player", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const playerId = String(data?.playerId ?? "");
    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can remove players."
      });
      return;
    }

    if (playerId === room.hostId) {
      respond({
        success: false,
        message: "The host cannot remove themselves."
      });
      return;
    }

    const player = room.players.get(playerId);

    if (!player) {
      respond({
        success: false,
        message: "That player is no longer in the room."
      });
      return;
    }

    room.players.delete(playerId);

    const playerSocket = io.sockets.sockets.get(playerId);

    if (playerSocket) {
      playerSocket.emit("kicked-from-room", {
        message: "The host removed you from the lobby."
      });

      playerSocket.leave(roomCode);
    }

    sendPlayerList(roomCode, room);

    console.log(
      `${player.name} was removed from room ${roomCode}`
    );

    respond({
      success: true
    });
  });

  socket.on("start-game", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "")
      .trim()
      .toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room no longer exists."
      });
      return;
    }

    if (room.hostId !== socket.id) {
      respond({
        success: false,
        message: "Only the host can start a game."
      });
      return;
    }

    if (room.activeGameId !== null) {
      respond({
        success: false,
        message: "A game is already in progress."
      });
      return;
    }

    if (room.selectedGameId === null) {
      respond({
        success: false,
        message: "Select a game first."
      });
      return;
    }

    const game = availableGames.find(
      (item) => item.id === room.selectedGameId
    );

    if (!game) {
      respond({
        success: false,
        message: "The selected game is unavailable."
      });
      return;
    }

    if (room.players.size < game.minPlayers) {
      respond({
        success: false,
        message:
          `${game.name} requires at least ` +
          `${game.minPlayers} players.`
      });
      return;
    }

    if (room.players.size > game.maxPlayers) {
      respond({
        success: false,
        message:
          `${game.name} supports at most ` +
          `${game.maxPlayers} players.`
      });
      return;
    }

    room.activeGameId = game.id;

    io.to(roomCode).emit("game-started", {
      ...game,
      currentSettings: room.gameSettings
    });

    console.log(`${game.name} started in room ${roomCode}`);

    respond({
      success: true
    });
  });

  socket.on("disconnect", () => {
    console.log(`Browser disconnected: ${socket.id}`);

    for (const [roomCode, room] of rooms) {
      if (room.hostId === socket.id) {
        io.to(roomCode).emit("room-closed");
        rooms.delete(roomCode);
        console.log(`Room ${roomCode} closed`);
        continue;
      }

      if (room.players.delete(socket.id)) {
        sendPlayerList(roomCode, room);
      }
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`GameHub is running on http://localhost:${port}`);
});