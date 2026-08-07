import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-800",
        "placeholder:text-gray-400 focus:border-dre-500 focus:outline-2 focus:outline-dre-200",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-800",
        "focus:border-dre-500 focus:outline-2 focus:outline-dre-200",
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-gray-600", className)}
      {...props}
    />
  );
}
