import fs from "node:fs";
import path from "node:path";
import { io } from "socket.io-client";

const root = path.resolve(process.cwd(), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
const baseUrl = env.VITE_API_URL || "http://127.0.0.1:5000";

async function request(pathname, { token, method = "GET", body, allowError = false } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !allowError) throw new Error(`${pathname}: ${response.status} ${data.error || ""}`);
  return { status: response.status, data };
}

const clientLogin = (await request("/login", { method: "POST", body: { email: "client@quoteai.local", password: env.SEED_CLIENT_PASSWORD, role: "client" } })).data;
const techLogin = (await request("/login", { method: "POST", body: { email: "ahmed@quoteai.local", password: env.SEED_TECH_PASSWORD, role: "technician" } })).data;
const technicians = (await request("/technicians", { token: clientLogin.token })).data;
const conversation = (await request("/conversations", { token: clientLogin.token, method: "POST", body: { technicianId: techLogin.user.id } })).data;

const socket = io(baseUrl, { auth: { token: techLogin.token }, transports: ["websocket"] });
await new Promise((resolve, reject) => {
  socket.once("connect", resolve);
  socket.once("connect_error", reject);
  setTimeout(() => reject(new Error("Socket connection timeout")), 5000);
});
const received = new Promise((resolve, reject) => {
  socket.once("message:new", resolve);
  setTimeout(() => reject(new Error("Realtime message timeout")), 5000);
});
const marker = `[Test système ${new Date().toISOString()}] Messagerie temps réel opérationnelle.`;
await request(`/conversations/${conversation.id}/messages`, { token: clientLogin.token, method: "POST", body: { body: marker } });
const realtimeMessage = await received;
const techConversations = (await request("/conversations", { token: techLogin.token })).data;
const unrated = technicians.find((technician) => !technician.can_rate);
const eligible = technicians.find((technician) => technician.can_rate);
const ratingAttempt = unrated
  ? await request(`/technicians/${unrated.id}/ratings`, { token: clientLogin.token, method: "POST", body: { rating: 5, comment: "test" }, allowError: true })
  : { status: null };
const successfulRating = eligible
  ? await request(`/technicians/${eligible.id}/ratings`, { token: clientLogin.token, method: "POST", body: { rating: eligible.my_rating || 5, comment: "Évaluation de vérification fonctionnelle" }, allowError: true })
  : { status: null };
socket.close();

console.log(JSON.stringify({
  conversationId: conversation.id,
  phoneVisible: Boolean(conversation.counterpart_phone),
  realtimeReceived: realtimeMessage.body === marker,
  visibleToTechnician: techConversations.some((item) => Number(item.id) === Number(conversation.id)),
  ratingWithoutRelationshipStatus: ratingAttempt.status,
  eligibleRatingStatus: successfulRating.status,
}, null, 2));
