// In server/index.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings to allow our React app to connect
// In server/index.js

const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any origin
    methods: ["GET", "POST"],
  },
});

// Listen for new connections
io.on("connection", (socket) => {
  console.log(`✅ User Connected: ${socket.id}`);

  // Listen for a sender creating a room
  socket.on("create-room", () => {
    const roomCode = socket.id;
    socket.join(roomCode);
    console.log(`🚪 Room Created: ${roomCode}`);
    socket.emit("room-created", roomCode);
  });

  // Listen for a receiver joining a room
  socket.on("join-room", (roomCode) => {
    // Find the room
    const room = io.sockets.adapter.rooms.get(roomCode);

    // Check if the room exists and has exactly one person (the sender)
    if (room && room.size === 1) {
      socket.join(roomCode); // Receiver joins the room
      console.log(`👋 User ${socket.id} joined room ${roomCode}`);
      // Notify the original sender (initiator) that a peer has connected
      socket.to(roomCode).emit("peer-connected", socket.id);
    } else {
      // Room doesn't exist or is full
      socket.emit("room-not-found");
    }
  });

  // Simple handler for when a user disconnects
  socket.on("disconnect", () => {
    console.log(`❌ User Disconnected: ${socket.id}`);
  });
  // Add this new listener
  socket.on("webrtc-signal", ({ toSocketId, signal }) => {
    // Send the signal to the other peer
    io.to(toSocketId).emit("webrtc-signal", {
      signal: signal,
      fromSocketId: socket.id,
    });
  });
});

const PORT = 8000;
server.listen(PORT, () => {
  console.log(`🚀 Signaling server is running on port ${PORT}`);
});
