import { AppContext } from "./app/AppContext";
import { useAppState } from "./app/useAppState";
import { AppShell } from "./layout/AppShell";
import { LoginPage } from "./pages/auth/LoginPage";

export function App() {
  const state = useAppState();
  return (
    <AppContext.Provider value={state}>
      {state.user ? <AppShell /> : <LoginPage />}
    </AppContext.Provider>
  );
}
