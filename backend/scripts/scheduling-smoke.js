"use strict";

const pool = require("../db");
const { seedClientPassword, seedTechPassword, port } = require("../env");

const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}`;

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${data.error || ""}`);
  return data;
}

async function login(email, password) {
  const data = await request("/login", { method: "POST", body: { email, password } });
  return data.token;
}

async function main() {
  let appointmentId = null;
  const date = "2026-11-27";
  const time = "11:17";
  try {
    const clientToken = await login("client@quoteai.local", seedClientPassword);
    const technicians = await request("/technicians", { token: clientToken });
    const technician = technicians.find((item) => item.available);
    if (!technician) throw new Error("No available technician for smoke test");
    const booking = await request("/appointments", {
      token: clientToken,
      method: "POST",
      body: { technicianId: technician.id, date, time, service: "Smoke test planning", faultType: "Climatisation", estimatedPrice: 2500 },
    });
    appointmentId = booking.id;
    if (booking.status !== "pending") throw new Error(`Expected pending appointment, got ${booking.status}`);

    const techUser = await pool.query("SELECT email FROM users WHERE id=$1", [technician.id]);
    const techToken = await login(techUser.rows[0].email, seedTechPassword);
    const [leads, appointments] = await Promise.all([
      request("/leads", { token: techToken }), request("/appointments", { token: techToken }),
    ]);
    const lead = leads.find((item) => Number(item.appointment_id) === Number(appointmentId));
    const agendaItem = appointments.find((item) => Number(item.id) === Number(appointmentId));
    if (!lead || !agendaItem) throw new Error("Appointment is missing from lead inbox or technician agenda");
    await request(`/leads/${lead.id}`, { token: techToken, method: "PATCH", body: { status: "accepted" } });
    const clientAppointments = await request("/appointments", { token: clientToken });
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
