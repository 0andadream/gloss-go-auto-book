import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";
import { MiniHeader } from "@/components/glossgo/MiniHeader";
import { SlotPicker } from "@/components/glossgo/SlotPicker";
import { getAvailability, lookupBooking, rescheduleBooking } from "@/lib/booking.functions";
import { fmtDay, fmtTime, money, type PackageName, type Vehicle } from "@/lib/glossgo";

export const Route = createFileRoute("/my-booking")({
  validateSearch: (s) => z.object({ code: z.string().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "My Booking — GlossGo Mobile Detailing" },
      { name: "description", content: "Look up your GlossGo detail by confirmation code or phone and reschedule instantly." },
      { property: "og:title", content: "My Booking — GlossGo Mobile Detailing" },
      { property: "og:description", content: "Reschedule your mobile detail in seconds — no phone calls." },
    ],
  }),
  component: MyBooking,
});

type Appt = NonNullable<Awaited<ReturnType<typeof lookupBooking>>>;

function MyBooking() {
  const { code } = Route.useSearch();
  const [query, setQuery] = useState(code ?? "");
  const [appt, setAppt] = useState<Appt | null>(null);
  const [mode, setMode] = useState<"view" | "pick" | "done">("view");
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lookupFn = useServerFn(lookupBooking);
  const availFn = useServerFn(getAvailability);
  const reschedFn = useServerFn(rescheduleBooking);

  async function find(q = query) {
    setBusy(true);
    try {
      const r = await lookupFn({ data: { query: q } });
      if (!r) toast.error("No booking found for that code or phone.");
      setAppt(r); setMode("view");
    } finally { setBusy(false); }
  }
  useEffect(() => { if (code) void find(code); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const avail = useQuery({
    queryKey: ["resched-avail", appt?.id],
    queryFn: () => availFn({ data: { vehicle: appt!.vehicle_type as Vehicle, pkg: appt!.package as PackageName, address: appt!.address, excludeId: appt!.id } }),
    enabled: mode === "pick" && !!appt,
    staleTime: 0,
  });
  useEffect(() => {
    if (avail.data && !dayKey) setDayKey(avail.data.days.find((d) => d.slots.length)?.dayKey ?? null);
  }, [avail.data, dayKey]);

  async function confirm() {
    if (!appt || !slot) return;
    setBusy(true);
    try {
      const r = await reschedFn({ data: { id: appt.id, startIso: slot } });
      if (!r.ok) {
        toast.error("That time was just booked — please choose another.");
        setSlot(null); setDayKey(null); await avail.refetch();
        return;
      }
      setAppt(r.appointment as Appt); setMode("done");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-background">
      <MiniHeader />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-10 sm:px-8">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">My Booking</h1>
        <p className="mt-2 text-muted-foreground">Enter your 6-character confirmation code, or the phone number you booked with.</p>
        <form onSubmit={(e) => { e.preventDefault(); void find(); }} className="mt-6 flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. K7Q2MX or 512-555-0142"
            className="flex-1 rounded-full border border-input bg-card px-5 py-3.5 uppercase outline-none placeholder:normal-case focus:border-primary" />
          <button disabled={busy || query.trim().length < 3} className="rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-40">
            {busy && mode !== "pick" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}
          </button>
        </form>

        {appt && (
          <div className="animate-rise mt-10">
            {mode === "done" && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/50 bg-primary/10 p-5">
                <Check className="h-6 w-6 text-primary" />
                <div>
                  <div className="font-heading text-xl font-bold">You're rescheduled!</div>
                  <div className="text-sm text-muted-foreground">Same confirmation code · updated confirmation sent to {appt.email}</div>
                </div>
              </div>
            )}
            <div className="gloss rounded-2xl border border-border bg-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Confirmation</div>
                  <div className="font-heading text-3xl font-extrabold tracking-[0.2em] text-primary">{appt.confirmation_code}</div>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs capitalize">{appt.status}</span>
              </div>
              <div className="mt-6 grid gap-1 text-sm">
                <Row l="When" v={`${fmtDay(appt.start_time)}, ${fmtTime(appt.start_time)}`} />
                <Row l="Service" v={`${appt.vehicle_type} · ${appt.package} · ${appt.duration_minutes} min`} />
                <Row l="Where" v={appt.address} />
                <Row l="Total" v={`${money(Number(appt.price))} (deposit ${appt.deposit_status})`} />
              </div>
              {mode !== "pick" && (
                <button onClick={() => { setMode("pick"); setSlot(null); setDayKey(null); }}
                  className="mt-6 w-full rounded-full bg-primary py-3.5 font-semibold text-primary-foreground shadow-glow hover:brightness-110">
                  Reschedule
                </button>
              )}
            </div>

            {mode === "pick" && (
              <div className="mt-10">
                <h2 className="mb-4 font-heading text-2xl font-bold">Choose a new time</h2>
                {!avail.data ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Recalculating availability…</div>
                ) : (
                  <>
                    <SlotPicker days={avail.data.days} dayKey={dayKey} onDay={(k) => { setDayKey(k); setSlot(null); }}
                      slot={slot} onSlot={setSlot} bufferMinutes={avail.data.buffer.minutes} area={avail.data.buffer.area} />
                    <div className="mt-8 flex gap-3">
                      <button onClick={() => setMode("view")} className="rounded-full border border-border px-6 py-3.5 text-sm hover:bg-secondary">Cancel</button>
                      <button onClick={confirm} disabled={!slot || busy}
                        className="flex-1 rounded-full bg-primary py-3.5 font-semibold text-primary-foreground shadow-glow hover:brightness-110 disabled:opacity-40">
                        {busy ? "Confirming…" : slot ? `Move to ${fmtDay(slot)}, ${fmtTime(slot)}` : "Pick a time"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <p className="mt-12 text-sm text-muted-foreground">No booking yet? <Link to="/book" className="text-primary underline">Book a detail</Link></p>
      </main>
    </div>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between gap-4 py-1"><span className="text-muted-foreground">{l}</span><span className="text-right">{v}</span></div>;
}
