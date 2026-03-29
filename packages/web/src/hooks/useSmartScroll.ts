import { useRef, useState, useCallback, useEffect } from "react";

const BOTTOM_THRESHOLD = 100;
const EMPTY_DEPS: unknown[] = [];

export function useSmartScroll(deps: unknown[] = EMPTY_DEPS) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const userScrolledUp = useRef(false);

  const checkIfAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  // Listen for scroll events
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      userScrolledUp.current = !atBottom;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [checkIfAtBottom]);

  // Auto-scroll when new content arrives, but only if user is near bottom
  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    // Deps are passed dynamically by the caller to trigger auto-scroll on content changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottom = useCallback(() => {
    userScrolledUp.current = false;
    setIsAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return { containerRef, bottomRef, isAtBottom, scrollToBottom };
}
