import { createContext, useCallback, useContext, useState } from "react";

// Whether the rail is hidden on a wide screen. It stays as the person left it,
// across reloads. A phone always opens the rail as a drawer instead.
const KEY = "edict.rail";

export interface RailState {
  collapsed: boolean;
  toggle: () => void;
}

export const RailContext = createContext<RailState | null>(null);

export function useRail(): RailState | null {
  return useContext(RailContext);
}

export function useRailState(): RailState {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "collapsed";
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setCollapsed((was) => {
      try {
        localStorage.setItem(KEY, was ? "open" : "collapsed");
      } catch {
        // Private windows may refuse storage; the rail still toggles.
      }
      return !was;
    });
  }, []);
  return { collapsed, toggle };
}
