import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-label="Ładowanie"
      className={cn(
        "inline-block size-6 animate-spin rounded-full border-2 border-gray-200 border-t-dre-500",
        className,
      )}
    />
  );
}
