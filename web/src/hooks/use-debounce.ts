import { useEffect, useRef, useState } from "react";

export function useDebounce<T>(value: T, delayMs = 300, onDebounced?: (v: T) => void): T {
  const [debounced, setDebounced] = useState(value);
  const onDebouncedRef = useRef(onDebounced);

  useEffect(() => {
    onDebouncedRef.current = onDebounced;
  }, [onDebounced]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
      onDebouncedRef.current?.(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
