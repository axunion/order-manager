import { Route, Router } from "@solidjs/router";
import CheckEmailPage from "./pages/CheckEmailPage";
import RegisterPage from "./pages/RegisterPage";

export default function App() {
  return (
    <Router>
      <Route path="/" component={RegisterPage} />
      <Route path="/check-email" component={CheckEmailPage} />
    </Router>
  );
}
