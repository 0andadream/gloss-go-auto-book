import { fmtDayKey, fmtTime } from "@/lib/glossgo";

type Day = { dayKey: string; slots: string[] };

export function SlotPicker({
  days, dayKey, onDay, slot, onSlot, bufferMinutes, area,
}: {
  days: Day[]; dayKey: string | null; onDay: (k: string) => void;
  slot: string | null; onSlot: (s: string) => void; bufferMinutes: number; area: string;
}) {
  const active = days.find((d) => d.dayKey === dayKey);
  return (
    <div>
      <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm text-primary">
        Includes {bufferMinutes} min travel buffer · {area}
      </p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((d) => {
          const [wd, ...rest] = fmtDayKey(d.dayKey).split(" ");
          const none = d.slots.length === 0;
          const sel = d.dayKey === dayKey;
          return (
            <button
              key={d.dayKey}
              type="button"
              disabled={none}
              onClick={() => onDay(d.dayKey)}
              className={`min-w-[92px] shrink-0 rounded-2xl border px-3 py-3 text-left transition ${
                sel ? "border-primary bg-primary/15" : "border-border bg-card hover:border-primary/50"
              } ${none ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{wd.replace(",", "")}</div>
              <div className="font-heading text-lg font-bold">{rest.join(" ")}</div>
              <div className={`text-xs ${none ? "text-destructive" : "text-muted-foreground"}`}>
                {none ? "Unavailable" : `${d.slots.length} open`}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-6">
        {!active ? (
          <p className="text-muted-foreground">Pick a day to see open times.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {active.slots.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSlot(s)}
                className={`rounded-xl border py-3 text-sm font-semibold transition ${
                  slot === s ? "border-primary bg-primary text-primary-foreground shadow-glow" : "border-border bg-card hover:border-primary/60"
                }`}
              >
                {fmtTime(s)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
