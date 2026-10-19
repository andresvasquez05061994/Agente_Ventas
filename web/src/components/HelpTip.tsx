"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";

export function HelpTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setAbove(rect.bottom > window.innerHeight - 200);
    setOpen((value) => !value);
  }

  return (
    <span
      className="help-tip"
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="help-tip__btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <CircleHelp size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <span id={panelId} className={`help-tip__pop${above ? " help-tip__pop--above" : ""}`} role="note">
          {children}
        </span>
      ) : null}
    </span>
  );
}

export function PageHeading({ title, help }: { title: string; help: string }) {
  return (
    <div className="page-heading">
      <h1 className="page-title">{title}</h1>
      <HelpTip label={`Ayuda de ${title}`}>{help}</HelpTip>
    </div>
  );
}
