import { useEffect } from "react";

interface ToastProps {
  message: string;
  type?: "error" | "success" | "info";
  onDismiss: () => void;
  duration?: number;
}

const COLORS = {
  error: "bg-red-900/80 text-red-200 border-red-800",
  success: "bg-green-900/80 text-green-200 border-green-800",
  info: "bg-neutral-800 text-neutral-200 border-neutral-700",
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
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg border text-xs font-medium shadow-lg animate-fade-in ${COLORS[type]}`}
    >
      {message}
    </div>
  );
}
