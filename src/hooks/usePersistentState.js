import { useEffect, useState } from "react";

export function usePersistentState(key, fallback) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // no-op
    }
  }, [key, state]);

  return [state, setState];
}
