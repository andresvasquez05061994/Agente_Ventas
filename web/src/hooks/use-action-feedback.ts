"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedbackTone } from "@/components/ui";

export type ActionFeedback = {
  tone: FeedbackTone;
  title?: string;
  message: string;
};

export function useActionFeedback(autoDismissMs = 8000) {
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const clear = useCallback(() => setFeedback(null), []);

  const show = useCallback((tone: FeedbackTone, message: string, title?: string) => {
    setFeedback({ tone, message, title });
  }, []);

  const showSuccess = useCallback(
    (message: string, title?: string) => show("success", message, title),
    [show]
  );
  const showError = useCallback(
    (message: string, title?: string) => show("error", message, title),
    [show]
  );
  const showWarning = useCallback(
    (message: string, title?: string) => show("warning", message, title),
    [show]
  );
  const showInfo = useCallback(
    (message: string, title?: string) => show("info", message, title),
    [show]
  );

  useEffect(() => {
    if (!feedback || !autoDismissMs) return;
    if (feedback.tone === "success" || feedback.tone === "info") {
      const timer = setTimeout(clear, autoDismissMs);
      return () => clearTimeout(timer);
    }
  }, [feedback, autoDismissMs, clear]);

  return { feedback, show, showSuccess, showError, showWarning, showInfo, clear };
}
