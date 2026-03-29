import { useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "error" | "success" | "info";
  onDismiss: () => void;
  duration?: number;
}

const COLORS = {
  error: "bg-[var(--status-error)]/10 text-[var(--status-error)] border-[var(--status-error)]/20",
  success: "bg-[var(--status-success)]/10 text-[var(--status-success)] border-[var(--status-success)]/20",
  info: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
};

export function Toast({
  message,
  type = "info",
  onDismiss,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl border text-xs font-medium shadow-lg animate-fade-in backdrop-blur-sm ${COLORS[type]}`}
    >
      {message}
    </div>
  );
}
