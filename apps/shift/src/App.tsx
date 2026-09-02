import { Route, Router } from "@solidjs/router";
import ShiftGuard from "./layouts/ShiftGuard";
import AvailabilityPage from "./pages/AvailabilityPage";
import LoginPage from "./pages/LoginPage";
import MySchedulePage from "./pages/MySchedulePage";

export default function App() {
  return (
    <Router>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={ShiftGuard}>
        <Route path="/" component={MySchedulePage} />
        <Route
          path="/periods/:periodId/availability"
          component={AvailabilityPage}
        />
      </Route>
    </Router>
  );
}
