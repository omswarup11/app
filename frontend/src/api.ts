// API client + realtime socket helper.
import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "sanjeevan.session.token";

async function authHeader(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T = any>(
  path: string,
  options: { method?: string; body?: any; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) Object.assign(headers, await authHeader());
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err: any = new Error(data?.detail || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  // auth
  sendOtp: (phone: string) => request("/auth/send-otp", { method: "POST", body: { phone }, auth: false }),
  verifyOtp: (phone: string, code: string) =>
    request("/auth/verify-otp", { method: "POST", body: { phone, code }, auth: false }),
  google: (email: string, name: string) =>
    request("/auth/google", { method: "POST", body: { email, name }, auth: false }),
  supabaseLogin: (access_token: string) =>
    request("/auth/supabase", { method: "POST", body: { access_token }, auth: false }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  // clinics
  searchClinics: (q: string, city = "") =>
    request(`/clinics?q=${encodeURIComponent(q)}&city=${encodeURIComponent(city)}`),
  specialties: (clinicId: string) => request(`/clinics/${clinicId}/specialties`),
  doctors: (clinicId: string, specialty = "") =>
    request(`/clinics/${clinicId}/doctors?specialty=${encodeURIComponent(specialty)}`),
  availability: (doctorId: string) => request(`/doctors/${doctorId}/availability`),
  // booking
  hold: (doctor_id: string, date: string, time: string) =>
    request("/appointments/hold", { method: "POST", body: { doctor_id, date, time } }),
  releaseHold: (holdId: string) => request(`/appointments/hold/${holdId}`, { method: "DELETE" }),
  order: (hold_id: string) => request("/payments/order", { method: "POST", body: { hold_id } }),
  confirm: (payload: any) => request("/payments/confirm", { method: "POST", body: payload }),
  appointments: () => request("/appointments"),
  // queue / records
  queueMe: () => request("/queue/me"),
  records: () => request("/records"),
  prescriptions: () => request("/prescriptions"),
  labTests: () => request("/lab-tests"),
  notifications: () => request("/notifications"),
  markRead: (id: string) => request(`/notifications/${id}/read`, { method: "POST" }),
  // staff / doctor
  staffDoctors: () => request("/staff/doctors"),
  staffQueue: (doctorId: string) => request(`/queue?doctor_id=${encodeURIComponent(doctorId)}`),
  queueNext: (doctorId: string) => request("/queue/next", { method: "POST", body: { doctor_id: doctorId } }),
  queueSkip: (entryId: string) => request(`/queue/${entryId}/skip`, { method: "POST" }),
  queueComplete: (entryId: string) => request(`/queue/${entryId}/complete`, { method: "POST" }),
  walkIn: (payload: any) => request("/queue/walk-in", { method: "POST", body: payload }),
  doctorToday: () => request("/doctor/today"),
  getConsultation: (apptId: string) => request(`/doctor/consultation/${apptId}`),
  saveConsultation: (apptId: string, payload: any) =>
    request(`/doctor/consultation/${apptId}/save`, { method: "POST", body: payload }),
  completeConsultation: (apptId: string, payload: any) =>
    request(`/doctor/consultation/${apptId}/complete`, { method: "POST", body: payload }),
};

export function socketUrl(token: string): string {
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/^http/, "ws");
  return `${base}/api/ws?token=${encodeURIComponent(token)}`;
}

export { request, BASE };
