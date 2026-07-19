import { useParams } from "@solidjs/router";
import ReceiptScreen from "../components/ReceiptScreen";

export default function ReceiptPage() {
  const params = useParams<{ seatToken: string; orderId: string }>();
  return (
    <ReceiptScreen seatToken={params.seatToken} orderId={params.orderId} />
  );
}
