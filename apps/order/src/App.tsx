import { Route, Router } from "@solidjs/router";
import NotFoundPage from "./pages/NotFoundPage";
import OrderPage from "./pages/OrderPage";
import ReceiptPage from "./pages/ReceiptPage";

export default function App() {
  return (
    <Router>
      <Route path="/:seatToken/receipt/:orderId" component={ReceiptPage} />
      <Route path="/:seatToken" component={OrderPage} />
      <Route path="*" component={NotFoundPage} />
    </Router>
  );
}
