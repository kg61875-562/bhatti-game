const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// In-Memory Database
const users = {}; 
const rooms = {}; 
const withdrawalRequests = []; 

const ENTRY_FEE_COINS = 100;
const REWARD_AD_COINS = 30;
const COLORS = ["RED", "GREEN", "YELLOW", "BLUE"];

// -------------------------------------------------------------
// 1. API ENDPOINTS (Coins, Ads & Withdrawal)
// -------------------------------------------------------------

// User Registration & 500 Welcome Bonus
app.post("/api/user/init", (req, res) => {
  const { userId, userName } = req.body;
  if (!users[userId]) {
    users[userId] = {
      userId,
      userName,
      coins: 500, // Welcome Bonus
      adsWatched: 0
    };
  }
  res.json({ success: true, user: users[userId] });
});

// Watch Ad (+30 Coins)
app.post("/api/user/watch-ad", (req, res) => {
  const { userId } = req.body;
  if (users[userId]) {
    users[userId].coins += REWARD_AD_COINS;
    users[userId].adsWatched += 1;
    return res.json({
      success: true,
      message: "+30 Coins Added!",
      coins: users[userId].coins
    });
  }
  res.status(404).json({ success: false, message: "User not found" });
});

// Redeem Request (5,000 Coins -> 50 PKR Lucky Wheel Request)
app.post("/api/user/withdraw", (req, res) => {
  const { userId, amountPkr, easyPaisaNumber } = req.body;
  const user = users[userId];

  if (!user) return res.status(404).json({ message: "User not found" });

  if (user.coins < 5000) {
    return res.status(400).json({
      success: false,
      message: "Minimum 5,000 coins required to redeem!"
    });
  }

  user.coins -= 5000;
  withdrawalRequests.push({
    requestId: `REQ_${Date.now()}`,
    userId,
    userName: user.userName,
    amountPkr,
    easyPaisaNumber,
    status: "PENDING",
    requestedAt: new Date()
  });

  res.json({
    success: true,
    message: "Withdrawal request submitted to admin!",
    remainingCoins: user.coins
  });
});

// -------------------------------------------------------------
// 2. SOCKET.IO (4-Player Ludo Logic)
// -------------------------------------------------------------
io.on("connection", (socket) => {
  console.log(`⚡ Connected: ${socket.id}`);

  // Join Room & Matchmaking
  socket.on("join_room", ({ userId, userName }) => {
    if (!users[userId] || users[userId].coins < ENTRY_FEE_COINS) {
      return socket.emit("error_msg", "Insufficient coins! 100 coins required.");
    }

    let roomId = Object.keys(rooms).find(
      (r) => rooms[r].players.length < 4 && !rooms[r].gameStarted
    );

    if (!roomId) {
      roomId = `ROOM_${Date.now()}`;
      rooms[roomId] = {
        roomId,
        players: [],
        currentTurnIndex: 0,
        gameStarted: false
      };
    }

    const playerColor = COLORS[rooms[roomId].players.length];
    const player = {
      socketId: socket.id,
      userId,
      userName,
      color: playerColor,
      tokens: [0, 0, 0, 0]
    };

    rooms[roomId].players.push(player);
    socket.join(roomId);

    // Deduct 100 Coins Entry Fee
    users[userId].coins -= ENTRY_FEE_COINS;

    io.to(roomId).emit("room_update", {
      roomId,
      players: rooms[roomId].players,
      message: `${userName} joined as ${playerColor}`
    });

    // Start Game when 4 players join
    if (rooms[roomId].players.length === 4) {
      rooms[roomId].gameStarted = true;
      io.to(roomId).emit("game_started", {
        roomId,
        message: "Match Started! 100 Coins deducted from each player.",
        currentTurn: rooms[roomId].players[0]
      });
    }
  });

  // Roll Dice Event
  socket.on("roll_dice", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;

    const currentPlayer = room.players[room.currentTurnIndex];
    if (currentPlayer.socketId !== socket.id) return;

    const diceValue = Math.floor(Math.random() * 6) + 1;

    io.to(roomId).emit("dice_rolled", {
      player: currentPlayer,
      diceValue
    });

    if (diceValue !== 6) {
      room.currentTurnIndex = (room.currentTurnIndex + 1) % 4;
      setTimeout(() => {
        io.to(roomId).emit("turn_changed", {
          nextTurn: room.players[room.currentTurnIndex]
        });
      }, 1200);
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex((p) => p.socketId === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomId).emit("player_left", { socketId: socket.id });
        if (room.players.length === 0) delete rooms[roomId];
        break;
      }
    }
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
