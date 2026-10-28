// Unsent form answers are kept on this phone until the hub confirms it saved them.
// This covers the power-cut demo: the hub reboots, the phone still has every answer.
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useDraft<T>(key: string, value: T, restore: (v: T) => void) {
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        restore(JSON.parse(raw));
        toast.info("Tumerejesha majibu ambayo hayakutumwa. / We restored your unsent answers.");
      }
    } catch { /* storage unavailable: carry on without drafts */ }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }, [key, value]);
}

export function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
