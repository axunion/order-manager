import { Route, Router } from "@solidjs/router";
import NotFoundPage from "./pages/NotFoundPage";
import OrderPage from "./pages/OrderPage";

export default function App() {
  return (
    <Router>
      <Route path="/:seatToken" component={OrderPage} />
      <Route path="*" component={NotFoundPage} />
    </Router>
  );
}
