import { cn } from "@/lib/cn";
import type { ComponentProps } from "react";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
