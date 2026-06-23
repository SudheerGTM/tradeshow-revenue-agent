import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "turquoise";
  size?: "sm" | "md";
}

const variants = {
  primary:   "bg-[#0F4C81] hover:bg-[#0a3660] text-white shadow-sm",
  turquoise: "bg-[#00B8D9] hover:bg-[#009ab8] text-white shadow-sm",
  secondary: "bg-white hover:bg-slate-50 text-[#0F172A] border border-[#E2E8F0] shadow-sm",
  ghost:     "text-[#475569] hover:text-[#0F172A] hover:bg-slate-100",
  danger:    "bg-[#DC2626] hover:bg-red-700 text-white shadow-sm",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs min-h-[36px]",
  md: "px-4 py-2.5 text-sm min-h-[44px]",
};

export function Button({
  loading, variant = "primary", size = "md", children, className, disabled, ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}
