import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-[#475569] mb-1.5">{label}</label>
      )}
      <input
        {...props}
        className={cn(
          "w-full bg-white border rounded-xl px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8]",
          "focus:outline-none focus:ring-2 focus:ring-[#00B8D9] focus:border-[#00B8D9] transition",
          error ? "border-[#DC2626]" : "border-[#E2E8F0]",
          className
        )}
      />
      {error && <p className="text-xs text-[#DC2626] mt-1">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className, children, ...props }: SelectProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-[#475569] mb-1.5">{label}</label>
      )}
      <select
        {...props}
        className={cn(
          "w-full bg-white border rounded-xl px-3 py-2.5 text-sm text-[#0F172A]",
          "focus:outline-none focus:ring-2 focus:ring-[#00B8D9] focus:border-[#00B8D9] transition",
          error ? "border-[#DC2626]" : "border-[#E2E8F0]",
          className
        )}
      >
        {children}
      </select>
      {error && <p className="text-xs text-[#DC2626] mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, ...props }: {
  label?: string; error?: string; className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-[#475569] mb-1.5">{label}</label>
      )}
      <textarea
        rows={3}
        {...props}
        className={cn(
          "w-full bg-white border rounded-xl px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] resize-none",
          "focus:outline-none focus:ring-2 focus:ring-[#00B8D9] focus:border-[#00B8D9] transition",
          error ? "border-[#DC2626]" : "border-[#E2E8F0]",
          className
        )}
      />
      {error && <p className="text-xs text-[#DC2626] mt-1">{error}</p>}
    </div>
  );
}
