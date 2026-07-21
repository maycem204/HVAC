import type { Appointment, BlockedSlot, Lead, Notification, Technician } from "./domain";

export function mapTechnician(row: any): Technician {
  return { id: row.id ?? row.user_id, name: row.name, specialty: row.specialty ?? (row.specializations ?? []).slice(0, 2).join(" & "), specializations: row.specializations ?? [], rating: Number(row.rating ?? 0), reviews: Number(row.reviews_count ?? row.reviews ?? 0), distanceKm: row.distance_km == null ? null : Number(row.distance_km ?? row.distanceKm), available: !!row.available, price: row.price_label ?? row.price ?? "Sur devis", response: row.response_time ?? row.response ?? "—", tags: row.tags ?? [], avatar: row.avatar ?? row.name?.split(" ").map((name: string) => name[0]).join("").slice(0, 2).toUpperCase(), color: row.color ?? "bg-blue-500", lat: Number(row.lat ?? 0), lng: Number(row.lng ?? 0), canRate: Boolean(row.can_rate ?? row.canRate), isBlocked:Boolean(row.is_blocked ?? row.isBlocked), myRating: row.my_rating == null ? undefined : Number(row.my_rating), myRatingComment: row.my_rating_comment ?? undefined };
}

export function mapAppointment(row: any): Appointment {
  return { id: row.id, client: row.client_name ?? row.client, clientId: row.client_id, technicianId: row.technician_id, technicianName: row.technician_name ?? row.technicianName, clientPhone: row.client_phone, technicianPhone: row.technician_phone, clientCity: row.client_city, clientProfileAddress: row.client_profile_address, clientLat: row.client_lat == null ? undefined : Number(row.client_lat), clientLng: row.client_lng == null ? undefined : Number(row.client_lng), date: row.date, time: row.time, service: row.service, faultType: row.fault_type, estimatedPrice: Number(row.estimated_price ?? 0), currency: row.currency || "EUR", actualPrice: row.actual_price != null ? Number(row.actual_price) : undefined, status: row.status, address: row.address, duration: row.duration, caseDescription: row.case_description, clientConfirmedPrice: !!row.client_confirmed_price, rating: row.rating ?? undefined, feedback: row.feedback ?? undefined };
}

export function mapNotification(row: any): Notification {
  return { id: row.id, type: row.type, title: row.title, message: row.message, time: row.time ?? new Date(row.created_at).toLocaleString("fr-FR"), read: !!row.read };
}

export function mapBlockedSlot(row: any): BlockedSlot {
  return { id: row.id, type: row.type, date: row.date, weekDays: row.week_days ?? row.weekDays, startTime: row.start_time ?? row.startTime, endTime: row.end_time ?? row.endTime, label: row.label };
}

export function mapLead(row: any): Lead {
  return { id: row.id, client: row.client_name ?? row.client, problem: row.problem, price: Number(row.price ?? 0), currency: row.currency || "EUR", confidence: Number(row.confidence ?? 0), time: row.time ?? new Date(row.created_at).toLocaleString("fr-FR"), status: row.status, city: row.city, faultType: row.fault_type, appointmentId: row.appointment_id == null ? undefined : Number(row.appointment_id), requestedDate: row.requested_date, requestedTime: row.requested_time, address: row.address };
}
