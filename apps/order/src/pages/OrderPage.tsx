import { useParams } from "@solidjs/router";
import OrderScreen from "../components/OrderScreen";

export default function OrderPage() {
  const params = useParams<{ seatToken: string }>();
  return <OrderScreen seatToken={params.seatToken} />;
}
