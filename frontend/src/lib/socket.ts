import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function socketUrl() {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  return import.meta.env.DEV ? "http://127.0.0.1:5000" : window.location.origin;
}

export function realtimeSocket() {
  if (!socket) {
    socket = io(socketUrl(), {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
  } else {
    if (!socket.connected) socket.connect();
  }
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}
