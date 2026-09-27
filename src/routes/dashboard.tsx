import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Activity, Bot, Clock, DollarSign, Hand, Loader2 } from "lucide-react";
import { MiniHeader } from "@/components/glossgo/MiniHeader";
import { checkOwnerPin, getDashboard, ownerCancelBooking, sendFollowUp } from "@/lib/booking.functions";
import { fmtDay, fmtTime, money } from "@/lib/glossgo";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Owner Dashboard — GlossGo" },
      { name: "description", content: "Live bookings, deposits and automation activity for GlossGo Mobile Detailing." },
      { property: "og:title", content: "Owner Dashboard — GlossGo" },
      { property: "og:description", content: "Every booking handled automatically." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

const MIN_SAVED = 8;

function Dashboard() {
  const [pin, setPin] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setPin(sessionStorage.getItem("gg_pin")); setReady(true); }, []);
  if (!ready) return <div className="min-h-screen bg-background" />;
  if (!pin) return <PinGate onOk={(p) => { sessionStorage.setItem("gg_pin", p); setPin(p); }} />;
  return <DashboardInner pin={pin} onLock={() => { sessionStorage.removeItem("gg_pin"); setPin(null); }} />;
}

function PinGate({ onOk }: { onOk: (pin: string) => void }) {
  const check = useServerFn(checkOwnerPin);
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <MiniHeader />
      <main className="mx-auto max-w-sm px-5 pt-20">
        <h1 className="font-heading text-3xl font-extrabold">Owner access</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter your PIN to see bookings.</p>
        <form className="mt-6 grid gap-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr("");
          try { const r = await check({ data: { pin: v } }); if (r.ok) onOk(v); else setErr("Wrong PIN"); } finally { setBusy(false); }
        }}>
          <input type="password" inputMode="numeric" autoFocus value={v} onChange={(e) => setV(e.target.value)}
            className="rounded-2xl border border-input bg-card px-4 py-4 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary" />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button disabled={!v || busy} className="rounded-full bg-primary py-3.5 font-semibold text-primary-foreground disabled:opacity-40">{busy ? "Checking…" : "Unlock"}</button>
        </form>
      </main>
    </div>
  );
}

function DashboardInner({ pin, onLock }: { pin: string; onLock: () => void }) {
  const cancelFn = useServerFn(ownerCancelBooking);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const fn = useServerFn(getDashboard);
  const followFn = useServerFn(sendFollowUp);
  const qc = useQueryClient();
  const [sending, setSending] = useState<string | null>(null);
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard"], queryFn: async () => { try { return await fn({ data: { pin } }); } catch (e) { if (String(e).includes("Wrong PIN")) onLock(); throw e; } }, refetchInterval: 5000, refetchOnWindowFocus: true, refetchOnMount: "always",
  });

  const automated = data?.metrics.automated ?? 0;
  return (
    <div className="min-h-screen bg-background">
      <MiniHeader />
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">Good day, Matt</h1>
            <p className="text-sm text-muted-foreground">Live from your booking database · refreshes every 5s</p>
          </div>
          <div className="flex items-center gap-3">{dataUpdatedAt > 0 && <span className="text-xs text-muted-foreground">Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}<button onClick={onLock} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-secondary">Lock</button></div>
        </div>

        {isLoading || !data ? (
          <div className="mt-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric icon={Bot} label="Bookings handled automatically" value={String(automated)} note="confirmed + rescheduled" />
              <Metric icon={Hand} label="Owner actions required" value="0" note="zero manual steps" />
              <Metric icon={DollarSign} label="Deposits collected" value={money(data.metrics.deposits)} note="sum of paid deposits" />
              <Metric icon={Clock} label="Admin time saved" value={`${Math.floor((automated * MIN_SAVED) / 60)}h ${(automated * MIN_SAVED) % 60}m`} note={`${automated} bookings × ${MIN_SAVED} min`} />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
              <section>
                <h2 className="mb-3 font-heading text-xl font-bold">Upcoming appointments ({data.appointments.length})</h2>
                <div className="grid gap-3">
                  {data.appointments.map((a) => (
                    <div key={a.id} className="gloss rounded-2xl border border-border bg-card p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">{fmtDay(a.start_time)}</div>
                          <div className="font-heading text-2xl font-extrabold">{fmtTime(a.start_time)} <span className="text-base font-semibold text-muted-foreground">– {fmtTime(a.end_time)}</span></div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${a.source === "rescheduled" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}>
                          {a.source === "rescheduled" ? "Rescheduled automatically" : "Booked automatically"}
                        </span>
                      </div>
                      <div className="mt-3 font-semibold">{a.vehicle_type} · {a.package} <span className="font-normal text-muted-foreground">({a.duration_minutes} min + {a.travel_buffer_minutes} min travel)</span></div>
                      <div className="text-sm text-muted-foreground">{a.customer_name} · {a.address}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Chip>{money(Number(a.price))}</Chip>
                        <Chip className={a.deposit_status === "paid" ? "text-success" : ""}>Deposit {a.deposit_status}</Chip>
                        <Chip>Status {a.status}</Chip>
                        <Chip className="font-mono tracking-widest">{a.confirmation_code}</Chip>
                        <button disabled={cancelling === a.id}
                          onClick={async () => {
                            if (!confirm(`Cancel ${a.customer_name}'s booking (${a.confirmation_code})? The slot will open again.`)) return;
                            setCancelling(a.id);
                            try { await cancelFn({ data: { pin, id: a.id } }); await qc.invalidateQueries({ queryKey: ["dashboard"] }); } finally { setCancelling(null); }
                          }}
                          className="ml-auto rounded-full border border-destructive/60 px-3 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50">
                          {cancelling === a.id ? "Cancelling…" : "Cancel booking"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {data.appointments.length === 0 && <p className="text-muted-foreground">No upcoming appointments.</p>}
                </div>
              </section>

              <aside className="grid content-start gap-6">
                <section className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-bold"><Activity className="h-4 w-4 text-primary" /> Automation activity</h2>
                  <ul className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
                    {data.activity.map((e) => (
                      <li key={e.id} className="border-l-2 border-primary/50 pl-3">
                        <div className="text-sm">{e.message}</div>
                        <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("en-US", { timeZone: "Africa/Lagos", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="mb-1 font-heading text-lg font-bold">Abandoned bookings</h2>
                  <p className="mb-3 text-xs text-muted-foreground">Customers who entered contact info but didn't pay within 3 min.</p>
                  <ul className="space-y-3">
                    {data.leads.map((l) => (
                      <li key={l.id} className="rounded-xl bg-secondary p-3">
                        <div className="text-sm font-semibold">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{l.phone} · {l.email}</div>
                        <div className="text-xs text-muted-foreground">Reached: {l.last_step_reached}</div>
                        {l.status === "Follow-up scheduled" ? (
                          <div className="mt-2 text-xs font-semibold text-success">Follow-up scheduled</div>
                        ) : (
                          <button disabled={sending === l.id}
                            onClick={async () => { setSending(l.id); try { await followFn({ data: { id: l.id, pin } }); await qc.invalidateQueries({ queryKey: ["dashboard"] }); } finally { setSending(null); } }}
                            className="mt-2 rounded-full border border-primary px-3 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-50">
                            {sending === l.id ? "Sending…" : "Send Follow-up"}
                          </button>
                        )}
                      </li>
                    ))}
                    {data.leads.length === 0 && <li className="text-sm text-muted-foreground">None right now.</li>}
                  </ul>
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof Bot; label: string; value: string; note: string }) {
  return (
    <div className="gloss rounded-2xl border border-border bg-card p-5">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <div className="font-heading text-3xl font-extrabold">{value}</div>
      <div className="text-sm">{label}</div>
      <div className="text-xs text-muted-foreground">{note}</div>
    </div>
  );
}
function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded-full border border-border px-2.5 py-1 ${className}`}>{children}</span>;
}
