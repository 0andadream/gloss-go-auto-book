import { Link } from "@tanstack/react-router";

export function MiniHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="font-heading text-[22px] font-extrabold tracking-tight">
          Gloss<span className="text-primary">Go</span>
        </Link>
        <div className="flex items-center gap-5 text-sm text-muted-foreground">
          {right ?? (
            <>
              <Link to="/my-booking" className="hover:text-foreground">My Booking</Link>
              <Link to="/dashboard" className="hover:text-foreground">Owner</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
