"use strict";

const pool = require("../db");
const { seedClientPassword, seedTechPassword, port } = require("../env");

const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}`;

async function request(path, { cookie, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${data.error || ""}`);
  return data;
}

async function login(email, password) {
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`POST /login: ${response.status} ${data.error || ""}`);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Login did not return an authentication cookie");
  return cookie;
}

async function main() {
  let appointmentId = null;
  const date = "2026-11-27";
  const time = "11:17";
  try {
    const clientCookie = await login("client@quoteai.local", seedClientPassword);
    const technicians = await request("/technicians", { cookie: clientCookie });
    const technician = technicians.find((item) => item.available);
    if (!technician) throw new Error("No available technician for smoke test");
    const booking = await request("/appointments", {
      cookie: clientCookie,
      method: "POST",
      body: { technicianId: technician.id, date, time, service: "Smoke test planning", faultType: "Climatisation", estimatedPrice: 2500 },
    });
    appointmentId = booking.id;
    if (booking.status !== "pending") throw new Error(`Expected pending appointment, got ${booking.status}`);

    const techUser = await pool.query("SELECT email FROM users WHERE id=$1", [technician.id]);
    const techCookie = await login(techUser.rows[0].email, seedTechPassword);
    const [leads, appointments] = await Promise.all([
      request("/leads", { cookie: techCookie }), request("/appointments", { cookie: techCookie }),
    ]);
    const lead = leads.find((item) => Number(item.appointment_id) === Number(appointmentId));
    const agendaItem = appointments.find((item) => Number(item.id) === Number(appointmentId));
    if (!lead || !agendaItem) throw new Error("Appointment is missing from lead inbox or technician agenda");
    await request(`/leads/${lead.id}`, { cookie: techCookie, method: "PATCH", body: { status: "accepted" } });
    const clientAppointments = await request("/appointments", { cookie: clientCookie });
    if (clientAppointments.find((item) => Number(item.id) === Number(appointmentId))?.status !== "confirmed") {
      throw new Error("Accepted lead did not confirm the linked appointment");
    }
    console.log("Scheduling smoke test passed");
  } finally {
    if (appointmentId) {
      await pool.query("DELETE FROM leads WHERE appointment_id=$1", [appointmentId]);
      await pool.query("DELETE FROM appointments WHERE id=$1", [appointmentId]);
      await pool.query("DELETE FROM notifications WHERE title='Nouvelle demande de rendez-vous' AND message LIKE $1", [`%${date}%${time}%`]);
    }
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
