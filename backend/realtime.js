"use strict";

let io = null;

function setRealtimeServer(server) {
  io = server;
}

function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

module.exports = { setRealtimeServer, emitToUser };
