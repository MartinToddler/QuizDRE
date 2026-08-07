import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("select-none text-2xl font-black tracking-tight", className)}>
      <span className="text-gray-800">Quiz</span>
      <span className="text-dre-500">DRE</span>
    </span>
  );
}
