import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import hero from "@/assets/hero.jpg";
import { PACKAGES, PACKAGE_NAMES, money } from "@/lib/glossgo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GlossGo Mobile Detailing — Book in 60 Seconds, Austin TX" },
      { name: "description", content: "Austin's premium mobile car detailing. Express, Full and Premium details at your door. Book online in 60 seconds." },
      { property: "og:title", content: "GlossGo Mobile Detailing — Austin, TX" },
      { property: "og:description", content: "Book your detail in 60 seconds. We come to you." },
    ],
  }),
  component: Landing,
});

function useTypewriter(text: string, speed = 36, startDelay = 500) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0; let iv: ReturnType<typeof setInterval>;
    const t = setTimeout(() => { iv = setInterval(() => { i++; setN(i); if (i >= text.length) clearInterval(iv); }, speed); }, startDelay);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [text, speed, startDelay]);
  return { displayed: text.slice(0, n), done: n >= text.length };
}

const NAV = [["Services", "services"], ["How It Works", "how"], ["Reviews", "reviews"]] as const;

function Landing() {
  const [open, setOpen] = useState(false);
  const { displayed, done } = useTypewriter("Book your detail in 60 seconds. We come to you.");
  const scrollTo = (id: string) => { setOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };

  return (
    <div className="relative text-foreground">
      {/* Fixed background media */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-background">
        <img src={hero} alt="" width={1920} height={1088} className="animate-slowzoom absolute inset-0 h-full w-full object-cover" />
        <video autoPlay muted loop playsInline poster={hero} className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-1000"
          onCanPlay={(e) => (e.currentTarget.style.opacity = "1")} onError={(e) => (e.currentTarget.style.display = "none")}>
          <source src="https://videos.pexels.com/video-files/6872065/6872065-uhd_2560_1440_25fps.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/15 to-background/85" />
      </div>

      {/* Navbar */}
      <nav className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <Link to="/" className="font-heading text-[21px] font-extrabold tracking-tight sm:text-[26px]">Gloss<span className="text-primary">Go</span></Link>
        <div className="hidden gap-10 md:flex">
          {NAV.map(([l, id]) => <button key={id} onClick={() => scrollTo(id)} className="text-[18px] transition-opacity hover:opacity-60">{l}</button>)}
        </div>
        <Link to="/book" className="hidden rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition hover:brightness-110 md:inline-block">Book Now</Link>
        <button aria-label="Menu" onClick={() => setOpen(!open)} className="relative z-20 h-8 w-8 md:hidden">
          <span className={`absolute left-1 top-2 h-0.5 w-6 bg-foreground transition duration-300 ${open ? "translate-y-[7px] rotate-45" : ""}`} />
          <span className={`absolute left-1 top-[15px] h-0.5 w-6 bg-foreground transition duration-300 ${open ? "opacity-0" : ""}`} />
          <span className={`absolute left-1 top-[22px] h-0.5 w-6 bg-foreground transition duration-300 ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
        </button>
      </nav>
      <div className={`fixed inset-0 z-[9] flex flex-col bg-background/90 px-6 pb-10 pt-28 backdrop-blur-md transition-opacity duration-300 md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          {NAV.map(([l, id]) => <button key={id} onClick={() => scrollTo(id)} className="text-[28px] font-heading font-bold">{l}</button>)}
          <Link to="/my-booking" className="text-lg opacity-70">My Booking</Link>
        </div>
        <Link to="/book" className="w-full rounded-full bg-primary py-4 text-center text-lg font-semibold text-primary-foreground">Book Now</Link>
      </div>

      {/* Hero */}
      <header className="relative z-[1] flex h-screen flex-col justify-end pb-12 md:justify-center md:pb-0">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <p className="mb-4 blur-[0.3px]" style={{ fontSize: "clamp(16px, 3vw, 20px)", color: "rgba(255,255,255,0.7)" }}>Austin's mobile detailing crew</p>
          <h1 className="font-heading max-w-3xl font-extrabold" style={{ fontSize: "clamp(32px, 6vw, 56px)", lineHeight: 1.1 }}>
            {displayed}
            {!done && <span className="animate-blink ml-1 inline-block h-[1em] w-[3px] translate-y-[0.12em] bg-primary" />}
          </h1>
          <div className="animate-rise mt-10" style={{ animationDelay: "400ms" }}>
            <Link to="/book" className="inline-block rounded-full bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.02] hover:brightness-110 sm:text-xl">
              Book Your Detail →
            </Link>
            <div className="mt-4">
              <button onClick={() => scrollTo("services")} className="text-sm underline opacity-70 hover:opacity-100">See pricing</button>
            </div>
          </div>
        </div>
      </header>

      {/* Below the fold */}
      <div className="relative z-[1] bg-background">
        <section id="services" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">Three ways to shine.</h2>
          <p className="mt-3 text-muted-foreground">SUVs, trucks and vans add 20 min and $20 to Full and Premium details.</p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PACKAGE_NAMES.map((p) => (
              <div key={p} className="gloss flex flex-col rounded-3xl border border-border bg-card p-7">
                <div className="text-sm text-muted-foreground">{PACKAGES[p].minutes} min</div>
                <div className="font-heading mt-1 text-2xl font-bold">{p}</div>
                <div className="font-heading mt-6 text-5xl font-extrabold">{money(PACKAGES[p].price)}</div>
                <p className="mt-4 flex-1 text-sm text-muted-foreground">{PACKAGES[p].blurb}</p>
                <Link to="/book" search={{ pkg: p }} className="mt-8 rounded-full border border-border py-3 text-center text-sm font-semibold transition hover:border-primary hover:text-primary">Book This</Link>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-y border-border">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 md:grid-cols-3">
            {[["01", "Pick your car & package", "Live pricing, no quotes, no calls."], ["02", "Choose a real open time", "Only times our crew can actually make — travel included."], ["03", "We show up & detail", "Water, power and products on board. You don't lift a finger."]].map(([n, t, d]) => (
              <div key={n}><div className="font-heading text-sm text-primary">{n}</div><div className="font-heading mt-2 text-2xl font-bold">{t}</div><p className="mt-2 text-muted-foreground">{d}</p></div>
            ))}
          </div>
        </section>

        <section id="reviews" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex text-primary">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-5 w-5 fill-current" />)}</div>
            <span className="font-heading text-xl font-bold">4.9 average · 500+ Austin cars detailed</span>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[["Booked on my lunch break, car was spotless by 3. Unreal.", "Tasha R., Mueller"], ["Marcus got the dog hair out of my 4Runner. I didn't think that was possible.", "Kevin L., South Austin"], ["Rescheduled from my phone in ten seconds. No back-and-forth.", "Ana P., Downtown"]].map(([q, a]) => (
              <blockquote key={a} className="rounded-3xl border border-border bg-card p-7"><p className="text-lg">"{q}"</p><footer className="mt-4 text-sm text-muted-foreground">{a}</footer></blockquote>
            ))}
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-6 px-5 py-10 text-sm text-muted-foreground sm:px-8">
            <div><div className="font-heading text-lg font-extrabold text-foreground">Gloss<span className="text-primary">Go</span></div>Owned by Marcus Reed · (512) 555-0100 · hello@glossgo.co</div>
            <div>Serving Austin, Round Rock & surrounding areas · 8 AM – 6 PM daily</div>
            <div className="flex gap-4"><a href="#" className="hover:text-foreground">Instagram</a><a href="#" className="hover:text-foreground">TikTok</a><Link to="/my-booking" className="hover:text-foreground">My Booking</Link><Link to="/dashboard" className="hover:text-foreground">Owner</Link></div>
          </div>
        </footer>
      </div>
    </div>
  );
}
