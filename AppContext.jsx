// Shared app state container. Currently a no-op skeleton — App.jsx will
// progressively migrate state, effects, and handlers in here so screens can
// pull what they need via useApp() instead of prop-drilling.
import { createContext, useContext } from "react";

const AppContext = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
};

export function AppProvider({ value, children }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
