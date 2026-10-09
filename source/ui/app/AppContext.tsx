import { createContext, useContext } from "react";
import type { AppState } from "./useAppState";

export const AppContext = createContext<AppState | null>(null);

/** Shared workspace state and actions (session, current page, data, dialogs). */
export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppContext");
  return value;
}
