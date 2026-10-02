import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";

type Player = {
  id: string;
  name: string;
};

type GameDefinition = {
  id: string;
  name: string;
};

type Room = {
  hostId: string;
  players: Map<string, Player>;
  activeGameId: string | null;
};

const availableGames: GameDefinition[] = [
  {
    id: "reaction",
    name: "Reaction Test"
  },
  {
    id: "number-guess",
    name: "Number Guess"
  }
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = Number(process.env.PORT) || 3000;
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

function sendPlayerList(room: Room): void {
  const players = Array.from(room.players.values());
  io.to(room.hostId).emit("player-list", players);
}

io.on("connection", (socket) => {
  console.log(`Browser connected: ${socket.id}`);

  socket.emit("available-games", availableGames);

  socket.on("create-room", (respond) => {
    const roomCode = generateRoomCode();

    rooms.set(roomCode, {
      hostId: socket.id,
      players: new Map(),
      activeGameId: null
    });

    socket.join(roomCode);

    console.log(`Room ${roomCode} created by ${socket.id}`);

    respond({
      success: true,
      roomCode
    });
  });

  socket.on("join-room", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "").trim().toUpperCase();
    const playerName = String(data?.playerName ?? "").trim();

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

    const room = rooms.get(roomCode);

    if (!room) {
      respond({
        success: false,
        message: "That room does not exist."
      });
      return;
    }

    room.players.set(socket.id, {
      id: socket.id,
      name: playerName
    });

    socket.join(roomCode);
    sendPlayerList(room);

    console.log(`${playerName} joined room ${roomCode}`);

    respond({
      success: true,
      roomCode,
      playerName
    });
  });

  socket.on("start-game", (data, respond) => {
    const roomCode = String(data?.roomCode ?? "").trim().toUpperCase();
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
        message: "Only the host can start a game."
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

    room.activeGameId = game.id;

    io.to(roomCode).emit("game-started", game);

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
        sendPlayerList(room);
      }
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`GameHub is running on http://localhost:${port}`);
});