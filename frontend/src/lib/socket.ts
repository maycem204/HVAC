import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "./auth-storage";

let socket: Socket | null = null;
let socketToken: string | null = null;

function socketUrl() {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  return import.meta.env.DEV ? "http://127.0.0.1:5000" : window.location.origin;
}

export function realtimeSocket() {
  const token = getAuthToken();
  if (!token) return null;
  if (!socket || socketToken !== token) {
    socket?.disconnect();
    socketToken = token;
    socket = io(socketUrl(), {
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
  socketToken = null;
}
