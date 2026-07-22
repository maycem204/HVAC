export type Role = "client" | "technician";
export type View = "home" | "auth" | "location" | "client" | "tech";
export type ClientTab = "chat" | "rdv" | "map" | "messages";
export type TechTab = "leads" | "tarifs" | "agenda" | "messages";
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type PriceDecision = "accept" | "decline" | null;

export interface AppUser { id: number; name: string; email: string; phone: string; address: string; city: string; role: Role; avatar: string; lat?: number; lng?: number; }
export interface ChatMsg { role: "bot" | "user"; text: string; }
export interface UserLocation { lat: number; lng: number; city: string; district: string; }
export interface Notification { id: number; type: "lead" | "rdv" | "price" | "rating" | "system" | "reassign" | "message"; title: string; message: string; time: string; read: boolean; }
export interface SuggestedSlot { date: string; label: string; time: string; techId: number; distanceKm: number | null; }
export interface Appointment { id: number; client: string; clientId?: number; technicianId: number; technicianName: string; clientPhone?: string; technicianPhone?: string; clientCity?: string; clientProfileAddress?: string; clientLat?: number; clientLng?: number; date: string; time: string; service: string; faultType?: string; estimatedPrice: number; actualPrice?: number; status: AppointmentStatus; currency: string; address: string; duration?: string; caseDescription?: string; clientConfirmedPrice?: boolean; rating?: number; feedback?: string; }
export interface PriceItem { id?: number; service: string; unit: string; price: number; category: string; country_code?: string; currency?: string; }
export interface Technician { id: number; name: string; specialty: string; specializations: string[]; rating: number; reviews: number; distanceKm: number | null; available: boolean; price: string; response: string; tags: string[]; avatar: string; color: string; lat: number; lng: number; canRate: boolean; isBlocked: boolean; myRating?: number; myRatingComment?: string; }
export interface BlockedSlot { id: number; type: "specific" | "daily" | "weekly"; date?: string; weekDays?: number[]; startTime: string; endTime: string; label: string; }
export interface DiagnosticFault { description?: string; equipment_type?: string; intervention_type?: string; complexity?: string; complexity_reason?: string; code_hint?: string; }
export interface DiagnosticDetails { faults?: DiagnosticFault[]; brand?: string; equipment_age_years?: number; equipment_age_band?: string; country?: string; urgency?: string; complexity?: string; season?: string; }
export interface Lead { id: number; client: string; problem: string; price: number; currency: string; confidence: number; time: string; status: "new" | "accepted" | "done"; city: string; faultType: string; appointmentId?: number; requestedDate?: string; requestedTime?: string; address?: string; caseDescription?: string; diagnosticDetails?: DiagnosticDetails; }
