import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Car, CarFront, Truck, Bus, Gauge, ArrowLeft, Check, Loader2, MapPin } from "lucide-react";
import { MiniHeader } from "@/components/glossgo/MiniHeader";
import { SlotPicker } from "@/components/glossgo/SlotPicker";
import { createLead, getAvailability, initDeposit, verifyDeposit } from "@/lib/booking.functions";
import {
  depositOf, PACKAGES, PACKAGE_NAMES, VEHICLES, fmtDay, fmtTime, money, quote, travelBuffer,
  type PackageName, type Vehicle,
} from "@/lib/glossgo";

export const Route = createFileRoute("/book")({
  validateSearch: (s) => z.object({
    pkg: z.enum(PACKAGE_NAMES as [PackageName, ...PackageName[]]).optional(),
    status: z.string().optional(), tx_ref: z.string().optional(), transaction_id: z.string().optional(),
  }).parse(s),
  head: () => ({
    meta: [
      { title: "Book a Mobile Detail — GlossGo Anambra" },
      { name: "description", content: "Pick your vehicle, package and a real open time. We come to you anywhere in Awka, Onitsha, Nnewi and environs." },
      { property: "og:title", content: "Book a Mobile Detail — GlossGo Anambra" },
      { property: "og:description", content: "Live availability, 30% deposit, confirmed in 60 seconds." },
    ],
  }),
  component: BookPage,
});

const STEPS = ["Vehicle", "Package", "Address", "Time", "Summary", "Details", "Done"];
const ICONS: Record<Vehicle, typeof Car> = { Sedan: Car, SUV: CarFront, Truck: Truck, Van: Bus, Coupe: Gauge };

type Appt = { confirmation_code: string; start_time: string; price: number; deposit_amount: number; vehicle_type: string; package: string; address: string; customer_name: string; travel_buffer_minutes: number; duration_minutes: number };

function BookPage() {
  const { pkg: prePkg, tx_ref, transaction_id } = Route.useSearch();
  const [step, setStep] = useState(0);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [pkg, setPkg] = useState<PackageName | null>(prePkg ?? null);
  const [address, setAddress] = useState("");
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [leadId, setLeadId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [booked, setBooked] = useState<Appt | null>(null);

  const availFn = useServerFn(getAvailability);
  const leadFn = useServerFn(createLead);
  const initFn = useServerFn(initDeposit);
  const verifyFn = useServerFn(verifyDeposit);

  // Returning from Flutterwave checkout: verify the payment, then create the booking.
  useEffect(() => {
    if (!tx_ref || !transaction_id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await verifyFn({ data: { txRef: tx_ref, transactionId: transaction_id } });
        if (cancelled) return;
        if (r.ok) {
          setBooked(r.appointment as Appt);
          setStep(6);
        } else if (r.reason === "taken") {
          const p = r.payload;
          setVehicle(p.vehicle); setPkg(p.pkg); setAddress(p.address);
          setContact({ name: p.name, phone: p.phone, email: p.email });
          setLeadId(p.leadId ?? null);
          toast.error("Payment received, but that time was just booked — please choose another. You won't be charged twice.");
          setStep(3);
        } else {
          toast.error(r.reason === "unpaid" ? "Payment wasn't completed — no charge was made. Please try again." : "We couldn't find that payment. Please start again.");
          setStep(0);
        }
      } catch {
        if (!cancelled) { toast.error("Could not verify your payment. If you were charged, contact us with your receipt."); setStep(0); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avail = useQuery({
    queryKey: ["avail", vehicle, pkg, address],
    queryFn: () => availFn({ data: { vehicle: vehicle!, pkg: pkg!, address } }),
    enabled: step === 3 && !!vehicle && !!pkg && address.trim().length >= 3,
    staleTime: 0,
  });

  useEffect(() => {
    if (avail.data && !dayKey) setDayKey(avail.data.days.find((d) => d.slots.length)?.dayKey ?? null);
  }, [avail.data, dayKey]);

  const q = vehicle && pkg ? quote(vehicle, pkg) : null;
  const buf = travelBuffer(address);

  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await leadFn({ data: contact });
      setLeadId(r.leadId);
    } catch {
      toast.error("Please check your name, phone and email.");
    }
  }

  async function pay() {
    if (!vehicle || !pkg || !slot) return;
    setPaying(true);
    try {
      const r = await initFn({
        data: { vehicle, pkg, address, startIso: slot, ...contact, leadId: leadId ?? undefined, redirectUrl: `${window.location.origin}/book` },
      });
      if (!r.ok) {
        toast.error("That time was just booked — please choose another.");
        setSlot(null); setDayKey(null);
        await avail.refetch();
        go(3);
        return;
      }
      window.location.href = r.link; // off to Flutterwave's secure checkout
    } catch {
      toast.error("Could not start the payment — please try again.");
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MiniHeader />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:px-8">
        {step < 6 && (
          <div className="mb-10">
            <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
              {step > 0 ? (
                <button onClick={() => go(step - 1)} className="inline-flex items-center gap-1 hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              ) : <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Home</Link>}
              <span>Step {step + 1} of 6 · {STEPS[step]}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {STEPS.slice(0, 6).map((s, i) => (
                <div key={s} className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`} />
              ))}
            </div>
          </div>
        )}

        <div key={step} className="animate-rise">
          {step === 0 && (
            <Section title="What are we detailing?">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {VEHICLES.map((v) => {
                  const Icon = ICONS[v];
                  return (
                    <button key={v} onClick={() => { setVehicle(v); go(pkg ? 2 : 1); }}
                      className={`gloss group rounded-2xl border p-6 text-left transition hover:-translate-y-0.5 hover:border-primary ${vehicle === v ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                      <Icon className="mb-6 h-9 w-9 text-primary" strokeWidth={1.5} />
                      <div className="font-heading text-xl font-bold">{v}</div>
                      <div className="text-sm text-muted-foreground">{["SUV", "Truck", "Van"].includes(v) ? "Large vehicle" : "Standard"}</div>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {step === 1 && vehicle && (
            <Section title="Choose your package" sub={`Prices shown for your ${vehicle}.`}>
              <div className="grid gap-3">
                {PACKAGE_NAMES.map((p) => {
                  const qq = quote(vehicle, p);
                  return (
                    <button key={p} onClick={() => { setPkg(p); go(2); }}
                      className={`gloss flex items-center justify-between gap-4 rounded-2xl border p-6 text-left transition hover:border-primary ${pkg === p ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
                      <div>
                        <div className="font-heading text-xl font-bold">{p} — {vehicle}: {qq.minutes} min, {money(qq.price)}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{PACKAGES[p].blurb}</div>
                        {qq.surchargePrice > 0 && (
                          <div className="mt-2 text-xs text-primary">Base {qq.baseMinutes} min / {money(qq.basePrice)} + {vehicle} surcharge 20 min / ₦5,000</div>
                        )}
                      </div>
                      <div className="font-heading text-3xl font-extrabold">{money(qq.price)}</div>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {step === 2 && (
            <Section title="Where's the car?" sub="We come to your home or office anywhere in Awka, Onitsha, Nnewi and environs.">
              <form onSubmit={(e) => { e.preventDefault(); if (address.trim().length >= 3) { setDayKey(null); setSlot(null); go(3); } }}>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Onitsha, Fegge or Awka, Amawbia"
                    className="w-full rounded-2xl border border-input bg-card py-5 pl-12 pr-4 text-lg outline-none focus:border-primary" />
                </div>
                {address.trim().length >= 3 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Service area: <span className="text-foreground">{buf.area}</span> · {buf.minutes} min travel buffer{!buf.matched && " (default)"}
                  </p>
                )}
                <PrimaryButton disabled={address.trim().length < 3} className="mt-8">See available times</PrimaryButton>
              </form>
            </Section>
          )}

          {step === 3 && (
            <Section title="Pick a time" sub={q ? `${pkg} · ${q.minutes} min on site. Times shown are arrival times (Nigeria time).` : ""}>
              {avail.isLoading || !avail.data ? (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking live availability…</div>
              ) : (
                <>
                  <SlotPicker days={avail.data.days} dayKey={dayKey} onDay={(k) => { setDayKey(k); setSlot(null); }}
                    slot={slot} onSlot={setSlot} bufferMinutes={avail.data.buffer.minutes} area={avail.data.buffer.area} />
                  <PrimaryButton disabled={!slot} className="mt-8" onClick={() => go(4)}>Continue</PrimaryButton>
                </>
              )}
            </Section>
          )}

          {step === 4 && q && slot && (
            <Section title="Your price">
              <div className="gloss rounded-2xl border border-border bg-card p-6">
                <Line label={`${pkg} (base, ${q.baseMinutes} min)`} value={money(q.basePrice)} />
                {q.surchargePrice > 0 && <Line label={`${vehicle} surcharge (+${q.surchargeMinutes} min)`} value={money(q.surchargePrice)} />}
                <Line label={`Travel buffer (${buf.minutes} min, ${buf.area})`} value="Included" />
                <div className="my-4 border-t border-border" />
                <Line label="Total" value={money(q.price)} big />
                <Line label="Due today (30% deposit)" value={money(depositOf(q.price))} />
                <Line label="Due after service" value={money(q.price - depositOf(q.price))} />
                <div className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
                  {fmtDay(slot)} at {fmtTime(slot)} · {address}
                </div>
              </div>
              <PrimaryButton className="mt-8" onClick={() => go(5)}>Looks good</PrimaryButton>
            </Section>
          )}

          {step === 5 && q && slot && (
            <Section title={leadId ? "Secure your spot" : "Your details"} sub={leadId ? `${fmtDay(slot)} at ${fmtTime(slot)} · ${pkg}` : "So we can confirm and text you when we're on the way."}>
              {!leadId ? (
                <form onSubmit={submitContact} className="grid gap-3">
                  <Field label="Full name" value={contact.name} onChange={(v) => setContact({ ...contact, name: v })} />
                  <Field label="Phone" type="tel" value={contact.phone} onChange={(v) => setContact({ ...contact, phone: v })} />
                  <Field label="Email" type="email" value={contact.email} onChange={(v) => setContact({ ...contact, email: v })} />
                  <PrimaryButton className="mt-5" disabled={!contact.name || contact.phone.replace(/\D/g, "").length < 7 || !contact.email.includes("@")}>
                    Continue to deposit
                  </PrimaryButton>
                </form>
              ) : (
                <div className="gloss rounded-2xl border border-border bg-card p-6">
                  <div className="mb-4 rounded-xl border border-border bg-secondary p-4 font-mono text-sm tracking-widest text-muted-foreground">
                    •••• •••• •••• 4242 <span className="float-right">12/29</span>
                  </div>
                  <p className="mb-6 text-sm text-muted-foreground">Demo payment (card or bank transfer) — nothing is actually charged. Your {money(depositOf(q.price))} deposit (30%) is applied to your {money(q.price)} total.</p>
                  <PrimaryButton onClick={pay} disabled={paying}>
                    {paying ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing…</> : `Pay ${money(depositOf(q.price))} Deposit`}
                  </PrimaryButton>
                </div>
              )}
            </Section>
          )}

          {step === 6 && booked && (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary shadow-glow">
                <Check className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="font-heading text-5xl font-extrabold tracking-tight">You're booked!</h1>
              <p className="mt-3 text-muted-foreground">Confirmation sent to {contact.email}</p>
              <div className="mx-auto mt-8 inline-block rounded-2xl border border-primary/50 bg-primary/10 px-8 py-5">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Confirmation code</div>
                <div className="font-heading text-4xl font-extrabold tracking-[0.25em] text-primary">{booked.confirmation_code}</div>
              </div>
              <div className="gloss mx-auto mt-8 max-w-md rounded-2xl border border-border bg-card p-6 text-left">
                <Line label="When" value={`${fmtDay(booked.start_time)}, ${fmtTime(booked.start_time)}`} />
                <Line label="Service" value={`${booked.vehicle_type} · ${booked.package}`} />
                <Line label="Duration" value={`${booked.duration_minutes} min`} />
                <Line label="Where" value={booked.address} />
                <Line label="Total" value={money(Number(booked.price))} />
                <Line label="Deposit paid (30%)" value={money(Number(booked.deposit_amount))} />
              </div>
              <div className="mt-8 flex justify-center gap-6 text-sm">
                <Link to="/my-booking" search={{ code: booked.confirmation_code }} className="underline opacity-70 hover:opacity-100">Manage booking</Link>
                <Link to="/" className="underline opacity-70 hover:opacity-100">Back home</Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {sub && <p className="mt-2 text-muted-foreground">{sub}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}
function Line({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${big ? "font-heading text-2xl font-extrabold" : "text-sm"}`}>
      <span className={big ? "" : "text-muted-foreground"}>{label}</span><span className="text-right">{value}</span>
    </div>
  );
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required
        className="w-full rounded-xl border border-input bg-card px-4 py-4 text-base outline-none focus:border-primary" />
    </label>
  );
}
function PrimaryButton({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${className}`}>
      {children}
    </button>
  );
}
