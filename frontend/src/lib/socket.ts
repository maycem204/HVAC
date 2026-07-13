import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function realtimeSocket() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || "http://127.0.0.1:5000", {
      auth: { token },
      transports: ["websocket", "polling"],
    });
  } else {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
  }
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}
