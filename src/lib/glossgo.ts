// Shared, pure business rules for GlossGo (safe on client and server).
export const TZ = "America/Chicago";
export const OPEN_MIN = 8 * 60; // 8:00 AM
export const CLOSE_MIN = 18 * 60; // 6:00 PM
export const SLOT_STEP = 15;
export const DEPOSIT = 25;

export const VEHICLES = ["Sedan", "SUV", "Truck", "Van", "Coupe"] as const;
export type Vehicle = (typeof VEHICLES)[number];
export const LARGE_VEHICLES: Vehicle[] = ["SUV", "Truck", "Van"];

export const PACKAGES = {
  "Express Wash": { minutes: 30, price: 59, blurb: "Hand wash, wheels, tire shine, windows." },
  "Full Detail": { minutes: 90, price: 189, blurb: "Deep interior + exterior, clay & sealant." },
  "Premium Detail": { minutes: 150, price: 299, blurb: "Paint enhancement, leather care, engine bay." },
} as const;
export type PackageName = keyof typeof PACKAGES;
export const PACKAGE_NAMES = Object.keys(PACKAGES) as PackageName[];

export function quote(vehicle: Vehicle, pkg: PackageName) {
  const base = PACKAGES[pkg];
  const surcharge = pkg !== "Express Wash" && LARGE_VEHICLES.includes(vehicle);
  return {
    basePrice: base.price,
    baseMinutes: base.minutes,
    surchargePrice: surcharge ? 20 : 0,
    surchargeMinutes: surcharge ? 20 : 0,
    price: base.price + (surcharge ? 20 : 0),
    minutes: base.minutes + (surcharge ? 20 : 0),
  };
}

export const BUFFER_TABLE: { keywords: string[]; area: string; minutes: number }[] = [
  { keywords: ["downtown", "78701"], area: "Downtown", minutes: 15 },
  { keywords: ["east austin", "east 6th", "e 6th", "78702"], area: "East Austin", minutes: 20 },
  { keywords: ["south austin", "south congress", "s congress", "soco", "78745", "78704"], area: "South Austin", minutes: 25 },
  { keywords: ["domain", "north austin", "78758"], area: "Domain / North Austin", minutes: 30 },
  { keywords: ["hyde park", "78751"], area: "Hyde Park", minutes: 20 },
  { keywords: ["mueller", "78723"], area: "Mueller", minutes: 20 },
  { keywords: ["zilker", "barton", "78746"], area: "Zilker / Barton Hills", minutes: 20 },
  { keywords: ["round rock", "78664", "78681"], area: "Round Rock", minutes: 35 },
];
export const DEFAULT_BUFFER = 20;

export function travelBuffer(address: string) {
  const a = address.toLowerCase();
  for (const row of BUFFER_TABLE) {
    if (row.keywords.some((k) => a.includes(k))) return { area: row.area, minutes: row.minutes, matched: true };
  }
  return { area: "Greater Austin", minutes: DEFAULT_BUFFER, matched: false };
}

// ---------- Time zone helpers (all business hours are Austin local time) ----------
function tzOffsetMin(date: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}
export function localToUtc(dayKey: string, minutes: number) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d) + minutes * 60000;
  const off = tzOffsetMin(new Date(guess));
  return new Date(guess - off * 60000);
}
export function dayKeyOf(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function nextDayKeys(n: number, from = new Date()) {
  const first = dayKeyOf(from);
  const keys: string[] = [];
  for (let i = 0; i < n; i++) keys.push(dayKeyOf(new Date(localToUtc(first, 12 * 60).getTime() + i * 86400000)));
  return keys;
}
export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const fmtDay = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
export const fmtDayKey = (k: string) => fmtDay(localToUtc(k, 12 * 60));
export const money = (n: number) => `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`;

// ---------- The scheduling engine ----------
export type Busy = { block_start: string; end_time: string };

/**
 * Valid service start times for a day. A candidate block begins at C (crew departs),
 * service starts at C + buffer, ends at C + buffer + duration. Block must fit in
 * 8:00–18:00 and must not overlap any existing [start_time - buffer, end_time] range.
 */
export function computeSlots(dayKey: string, bufferMin: number, durationMin: number, busy: Busy[], now = new Date()) {
  const ranges = busy.map((b) => [new Date(b.block_start).getTime(), new Date(b.end_time).getTime()] as const);
  const out: string[] = [];
  for (let c = OPEN_MIN; c + bufferMin + durationMin <= CLOSE_MIN; c += SLOT_STEP) {
    const bs = localToUtc(dayKey, c).getTime();
    if (bs < now.getTime()) continue;
    const start = bs + bufferMin * 60000;
    const end = start + durationMin * 60000;
    if (ranges.some(([s, e]) => bs < e && end > s)) continue;
    out.push(new Date(start).toISOString());
  }
  return out;
}
