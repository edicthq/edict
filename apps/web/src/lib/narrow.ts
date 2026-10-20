import { useSyncExternalStore } from "react";

// Below Tailwind's md breakpoint: a phone, where the rail becomes a drawer and
// a page's toolbar folds into one View menu.
const query = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
