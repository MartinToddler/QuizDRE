import { cn } from "@/lib/cn";

/** Pomarańczowy pasek postępu — sygnatura wizualna DRE. */
export function Progress({
  value,
  max = 100,
  className,
}: {
  value: number;
  max?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-gray-100", className)}
    >
      <div
        className="h-full rounded-full bg-dre-500 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
