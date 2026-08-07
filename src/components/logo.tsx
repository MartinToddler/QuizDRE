import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-1 text-2xl font-black tracking-tight",
        className,
      )}
    >
      <span className="text-[#373737]">Quiz</span>
      {/* nawiązanie do czarnego znaku DRE */}
      <span className="rounded-[4px] bg-[#1d1d1b] px-1.5 pb-0.5 leading-none text-white">
        DRE
      </span>
    </span>
  );
}
