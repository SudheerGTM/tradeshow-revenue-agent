import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      )}
      <input
        {...props}
        className={cn(
          "w-full bg-gray-800 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500 transition",
          error ? "border-red-600" : "border-gray-700",
          className
        )}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
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
        <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      )}
      <select
        {...props}
        className={cn(
          "w-full bg-gray-800 border rounded-lg px-3 py-2.5 text-sm text-white",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500 transition",
          error ? "border-red-600" : "border-gray-700",
          className
        )}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, ...props }: {
  label?: string; error?: string; className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      )}
      <textarea
        rows={3}
        {...props}
        className={cn(
          "w-full bg-gray-800 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 resize-none",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500 transition",
          error ? "border-red-600" : "border-gray-700",
          className
        )}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
