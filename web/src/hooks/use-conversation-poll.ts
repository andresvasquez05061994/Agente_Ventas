import { useEffect, useRef } from "react";

const DEFAULT_INTERVAL_MS = 4000;

export function useConversationPoll(
  onTick: () => void | Promise<void>,
  enabled = true,
  intervalMs = DEFAULT_INTERVAL_MS
) {
  const tickRef = useRef(onTick);

  useEffect(() => {
    tickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      void tickRef.current();
    };

    run();
    const id = window.setInterval(run, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, onTick]);
}
