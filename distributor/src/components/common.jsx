import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Page title, one-line description and actions on the right. */
export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Figure card for the top of a page. `tone` colours the icon tile. */
const TONES = {
  primary: "bg-primary/10 text-primary",
  green: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600",
  rose: "bg-rose-500/10 text-rose-600",
  sky: "bg-sky-500/10 text-sky-600",
};
export function StatCard({ label, value, hint, icon: Icon, tone = "primary", loading }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <p className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          )}
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONES[tone])}>
            <Icon className="size-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Shown in place of a table that has no rows. */
export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="size-6" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

/** Rows of grey bars while a table loads. */
export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/** From / To date pair. */
export function DateRange({ from, to, onFrom, onTo }) {
  return (
    <div className="flex items-center gap-2">
      <Input type="date" className="w-38" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} aria-label="From date" />
      <span className="text-sm text-muted-foreground">to</span>
      <Input type="date" className="w-38" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} aria-label="To date" />
    </div>
  );
}
