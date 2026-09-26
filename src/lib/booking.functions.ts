import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  PACKAGE_NAMES, VEHICLES, depositOf, money, computeSlots, dayKeyOf, fmtDay, fmtTime, nextDayKeys, quote, travelBuffer,
  type PackageName, type Vehicle,
} from "./glossgo";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

async function fetchBusy(excludeId?: string) {
  const sb = await db();
  let q = sb.from("appointments").select("id, block_start, end_time")
    .neq("status", "cancelled")
    .gte("end_time", new Date(Date.now() - 86400000).toISOString())
    .lte("block_start", new Date(Date.now() + 9 * 86400000).toISOString());
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function availability(vehicle: Vehicle, pkg: PackageName, address: string, excludeId?: string) {
  const qte = quote(vehicle, pkg);
  const buf = travelBuffer(address);
  const busy = await fetchBusy(excludeId);
  const days = nextDayKeys(7).map((dayKey) => ({
    dayKey,
    slots: computeSlots(dayKey, buf.minutes, qte.minutes, busy),
  }));
  return { days, buffer: buf, quote: qte };
}

/** Race-condition guard: recompute from live data and confirm the slot is still valid. */
async function isSlotStillOpen(vehicle: Vehicle, pkg: PackageName, address: string, startIso: string, excludeId?: string) {
  const a = await availability(vehicle, pkg, address, excludeId);
  const key = dayKeyOf(new Date(startIso));
  const target = new Date(startIso).getTime();
  const day = a.days.find((d) => d.dayKey === key);
  return { ok: !!day?.slots.some((s) => new Date(s).getTime() === target), a };
}

async function log(messages: string[]) {
  const sb = await db();
  const base = Date.now();
  await sb.from("activity_log").insert(
    messages.map((message, i) => ({ message, created_at: new Date(base + i).toISOString() })),
  );
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const svc = z.object({
  vehicle: z.enum(VEHICLES),
  pkg: z.enum(PACKAGE_NAMES as [PackageName, ...PackageName[]]),
  address: z.string().trim().min(3).max(300),
});

export const getAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) => svc.extend({ excludeId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data }) => availability(data.vehicle, data.pkg, data.address, data.excludeId));

export const createLead = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(100), phone: z.string().trim().min(7).max(30), email: z.string().trim().email().max(200),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: row, error } = await sb.from("leads")
      .insert({ ...data, last_step_reached: "Step 6 — Deposit payment" }).select("id").single();
    if (error) throw new Error(error.message);
    return { leadId: row.id };
  });

const bookingInput = svc.extend({
  startIso: z.string().datetime(),
  name: z.string().trim().min(1).max(100), phone: z.string().trim().min(7).max(30), email: z.string().trim().email().max(200),
  leadId: z.string().uuid().optional(),
});
type BookingInput = z.infer<typeof bookingInput>;

/** Insert the appointment after payment is confirmed. Re-checks the slot first (race guard). */
async function insertBooking(data: BookingInput, paymentNote: string) {
  const check = await isSlotStillOpen(data.vehicle, data.pkg, data.address, data.startIso);
  if (!check.ok) return { ok: false as const, reason: "taken" as const };
  const { quote: q, buffer } = check.a;
  const start = new Date(data.startIso);
  const end = new Date(start.getTime() + q.minutes * 60000);
  const blockStart = new Date(start.getTime() - buffer.minutes * 60000);
  const sb = await db();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const { data: row, error } = await sb.from("appointments").insert({
      confirmation_code: code, customer_name: data.name, phone: data.phone, email: data.email,
      vehicle_type: data.vehicle, package: data.pkg, duration_minutes: q.minutes, address: data.address,
      travel_buffer_minutes: buffer.minutes, block_start: blockStart.toISOString(),
      start_time: start.toISOString(), end_time: end.toISOString(), price: q.price,
      deposit_amount: depositOf(q.price), deposit_status: "paid", status: "confirmed", source: "booked",
    }).select("*").single();
    if (error) {
      if (error.code === "23P01") return { ok: false as const, reason: "taken" as const }; // DB-level overlap guard
      if (error.code === "23505") continue; // code collision, retry
      throw new Error(error.message);
    }
    if (data.leadId) await sb.from("leads").update({ status: "converted" }).eq("id", data.leadId);
    await log([
      `${buffer.minutes}-minute travel buffer added (${buffer.area}) · ${code}`,
      `${money(depositOf(q.price))} deposit received via Flutterwave (${paymentNote}) · ${code}`,
      `Booking confirmed automatically · ${data.name} · ${data.vehicle} ${data.pkg} · ${fmtDay(start)} ${fmtTime(start)}`,
      `Confirmation sent to ${data.email} · ${code}`,
    ]);
    return { ok: true as const, appointment: row };
  }
  throw new Error("Could not generate a confirmation code");
}

const FLW_API = "https://api.flutterwave.com/v3";

/** Step 1 of payment: re-check the slot, park the booking, and create a Flutterwave checkout link. */
export const initDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) => bookingInput.extend({ redirectUrl: z.string().url().max(500) }).parse(d))
  .handler(async ({ data }) => {
    const check = await isSlotStillOpen(data.vehicle, data.pkg, data.address, data.startIso);
    if (!check.ok) return { ok: false as const, reason: "taken" as const };
    const deposit = depositOf(check.a.quote.price);
    const txRef = `GG-${Date.now().toString(36).toUpperCase()}-${makeCode()}`;
    const sb = await db();
    const { error: pErr } = await sb.from("pending_payments").insert({
      tx_ref: txRef,
      payload: { vehicle: data.vehicle, pkg: data.pkg, address: data.address, startIso: data.startIso, name: data.name, phone: data.phone, email: data.email, leadId: data.leadId ?? null },
    });
    if (pErr) throw new Error(pErr.message);
    const res = await fetch(`${FLW_API}/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env['FLW_SECRET_KEY']!}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: deposit,
        currency: "NGN",
        redirect_url: data.redirectUrl,
        customer: { email: data.email, phonenumber: data.phone, name: data.name },
        customizations: { title: "GlossGo Mobile Detailing", description: `${data.pkg} deposit (30%)`, logo: "" },
      }),
    });
    const json = await res.json();
    if (json.status !== "success" || !json.data?.link) throw new Error(json.message ?? "Could not start payment");
    return { ok: true as const, link: json.data.link as string, txRef };
  });

/** Shared by the redirect return and the webhook: verify with Flutterwave, then insert the booking. */
export async function completePaidBooking(txRef: string, transactionId: string) {
  const sb = await db();
  const { data: pending } = await sb.from("pending_payments").select("*").eq("tx_ref", txRef).maybeSingle();
  if (!pending) return { ok: false as const, reason: "unknown" as const };
  const res = await fetch(`${FLW_API}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${process.env['FLW_SECRET_KEY']!}` },
  });
  const json = await res.json();
  const tx = json.data;
  const payload = pending.payload as BookingInput;
  const expected = depositOf(quote(payload.vehicle, payload.pkg).price);
  const paid = json.status === "success" && tx?.status === "successful" && tx?.tx_ref === txRef
    && tx?.currency === "NGN" && Number(tx?.amount) >= expected;
  if (!paid) {
    await sb.from("pending_payments").delete().eq("tx_ref", txRef);
    return { ok: false as const, reason: "unpaid" as const };
  }
  const result = await insertBooking(payload, `ref ${txRef}`);
  if (result.ok) await sb.from("pending_payments").delete().eq("tx_ref", txRef);
  return result.ok ? result : { ok: false as const, reason: "taken" as const, payload };
}

/** Step 2 of payment (customer redirect back from Flutterwave). */
export const verifyDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ txRef: z.string().trim().min(5).max(80), transactionId: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => completePaidBooking(data.txRef, data.transactionId));

export const lookupBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().trim().min(3).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const code = data.query.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const byCode = await sb.from("appointments").select("*").eq("confirmation_code", code).neq("status", "cancelled").maybeSingle();
    if (byCode.data) return byCode.data;
    const digits = data.query.replace(/\D/g, "");
    if (digits.length >= 7) {
      const { data: rows } = await sb.from("appointments").select("*").neq("status", "cancelled")
        .gte("end_time", new Date().toISOString()).order("start_time");
      const match = (rows ?? []).find((r) => r.phone.replace(/\D/g, "").endsWith(digits.slice(-10)));
      if (match) return match;
    }
    return null;
  });

export const rescheduleBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), startIso: z.string().datetime() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: appt, error } = await sb.from("appointments").select("*").eq("id", data.id).single();
    if (error || !appt) throw new Error("Booking not found");
    // Availability computed with this booking's own block released (excluded).
    const check = await isSlotStillOpen(appt.vehicle_type as Vehicle, appt.package as PackageName, appt.address, data.startIso, appt.id);
    if (!check.ok) return { ok: false as const, reason: "taken" as const };
    const start = new Date(data.startIso);
    const end = new Date(start.getTime() + appt.duration_minutes * 60000);
    const blockStart = new Date(start.getTime() - appt.travel_buffer_minutes * 60000);
    const oldStart = new Date(appt.start_time);
    const { data: row, error: upErr } = await sb.from("appointments").update({
      start_time: start.toISOString(), end_time: end.toISOString(), block_start: blockStart.toISOString(),
      status: "rescheduled", source: "rescheduled",
    }).eq("id", appt.id).select("*").single();
    if (upErr) {
      if (upErr.code === "23P01") return { ok: false as const, reason: "taken" as const };
      throw new Error(upErr.message);
    }
    await log([
      `Reschedule handled automatically · ${appt.confirmation_code} · ${fmtDay(oldStart)} ${fmtTime(oldStart)} → ${fmtDay(start)} ${fmtTime(start)}`,
      `Original slot released · ${fmtDay(oldStart)} ${fmtTime(oldStart)}`,
      `Updated confirmation sent to ${appt.email} · ${appt.confirmation_code}`,
    ]);
    return { ok: true as const, appointment: row };
  });

export const LEAD_ABANDON_MINUTES = 3;

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await db();
  const todayStart = new Date(Date.now() - 12 * 3600000).toISOString();
  const [upcoming, all, activity, leads] = await Promise.all([
    sb.from("appointments").select("*").neq("status", "cancelled").gte("end_time", todayStart).order("start_time"),
    sb.from("appointments").select("status, deposit_status, deposit_amount"),
    sb.from("activity_log").select("*").order("created_at", { ascending: false }).limit(40),
    sb.from("leads").select("*").neq("status", "converted")
      .lte("created_at", new Date(Date.now() - LEAD_ABANDON_MINUTES * 60000).toISOString())
      .order("created_at", { ascending: false }).limit(20),
  ]);
  for (const r of [upcoming, all, activity, leads]) if (r.error) throw new Error(r.error.message);
  const rows = all.data ?? [];
  const automated = rows.filter((r) => r.status === "confirmed" || r.status === "rescheduled").length;
  const deposits = rows.filter((r) => r.deposit_status === "paid").reduce((s, r) => s + Number(r.deposit_amount), 0);
  return { appointments: upcoming.data ?? [], activity: activity.data ?? [], leads: leads.data ?? [], metrics: { automated, deposits } };
});

export const sendFollowUp = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: lead, error } = await sb.from("leads").update({ status: "Follow-up scheduled" }).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    await log([`Follow-up scheduled for abandoned booking · ${lead.name} (${lead.phone})`]);
    return lead;
  });

export const listReviews = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await db();
  const { data, error } = await sb.from("reviews").select("id, name, rating, comment, created_at").order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const addReview = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(60),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().min(3).max(600),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { error } = await sb.from("reviews").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
