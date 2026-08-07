import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "gray" | "orange" | "green" | "red";

const tones: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700",
  orange: "bg-dre-50 text-dre-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
};

export function Chip({
  tone = "gray",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
