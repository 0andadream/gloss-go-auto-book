import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { addReview, listReviews } from "@/lib/booking.functions";

type Review = { id: string; name: string; rating: number; comment: string; created_at: string };

const FEATURED = [
  { name: "Chinedu O., Awka", comment: "Matt showed up right on time in Awka and my SUV looked showroom-new after. Booked and done in two minutes flat." },
  { name: "Ifeoma A., Onitsha", comment: "I didn't expect to get an actual confirmed time slot without calling back and forth. This is how it should work." },
  { name: "Uche N., Nnewi", comment: "Premium detail on my Camry was worth every naira — engine bay included. Will be booking again." },
];

function Stars({ value, onPick, size = 18 }: { value: number; onPick?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick} aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onMouseEnter={() => onPick && setHover(n)} onClick={() => onPick?.(n)}
          className={onPick ? "cursor-pointer transition hover:scale-110" : "cursor-default"}>
          <Star width={size} height={size} className={n <= shown ? "fill-primary text-primary" : "text-muted-foreground"} />
        </button>
      ))}
    </div>
  );
}

export function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = () => listReviews().then(setReviews).catch(() => {});
  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!rating) { toast.error("Tap the stars to pick a rating"); return; }
    if (!name.trim() || comment.trim().length < 3) { toast.error("Add your name and a short review"); return; }
    setBusy(true);
    try {
      await addReview({ data: { name, rating, comment } });
      setName(""); setComment(""); setRating(0);
      toast.success("Thanks for your review!");
      load();
    } catch { toast.error("Couldn't post your review — try again"); }
    finally { setBusy(false); }
  };

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section id="reviews" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <h2 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">What customers say.</h2>
      {reviews.length > 0 && (
        <div className="mt-3 flex items-center gap-3 text-muted-foreground">
          <Stars value={Math.round(avg)} /> <span>{avg.toFixed(1)} from {reviews.length} review{reviews.length > 1 ? "s" : ""}</span>
        </div>
      )}
      <div className="mt-10 grid gap-8 md:grid-cols-[1fr_1.2fr]">
        <form onSubmit={submit} className="gloss rounded-3xl border border-border bg-card p-7">
          <div className="font-heading text-xl font-bold">Leave a review</div>
          <div className="mt-4"><Stars value={rating} onPick={setRating} size={28} /></div>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Your name"
            className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" />
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={600} rows={4} placeholder="How was your detail?"
            className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary" />
          <button disabled={busy} className="mt-4 rounded-full border border-border px-6 py-2.5 text-sm font-semibold transition hover:border-primary hover:text-primary disabled:opacity-50">
            {busy ? "Posting…" : "Post review"}
          </button>
        </form>
        <div className="space-y-4">
          {(() => {
            const all = [
              ...FEATURED.map((r) => ({ id: r.name, name: r.name, rating: 5, comment: r.comment, created_at: "" })),
              ...reviews,
            ];
            const shown = expanded ? all : all.slice(0, 3);
            return (
              <>
                {shown.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{r.name}</div>
                      <Stars value={r.rating} size={14} />
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{r.comment}</p>
                    {r.created_at && (
                      <div className="mt-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                    )}
                  </div>
                ))}
                {all.length > 3 && (
                  <button onClick={() => setExpanded(!expanded)} className="text-sm font-semibold text-primary hover:underline">
                    {expanded ? "See less" : `See more (${all.length - 3})`}
                  </button>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
