import { Route, Router } from "@solidjs/router";
import ShiftGuard from "./layouts/ShiftGuard";
import AvailabilityPage from "./pages/AvailabilityPage";
import BuilderPage from "./pages/BuilderPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={ShiftGuard}>
        <Route path="/" component={HomePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/periods/:periodId" component={BuilderPage} />
        <Route
          path="/periods/:periodId/availability"
          component={AvailabilityPage}
        />
      </Route>
    </Router>
  );
}
