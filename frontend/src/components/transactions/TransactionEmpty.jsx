import { MdPeople, MdCheckCircle, MdInbox } from "react-icons/md";
import "../../styles/pages/transactions-browser.css";

const ICONS = {
  borrowed: MdPeople,
  returned: MdCheckCircle,
  requests: MdInbox,
};

/** Shared empty state. `mode` picks the icon. */
export default function TransactionEmpty({ mode = "borrowed", title, message, action = null }) {
  const Glyph = ICONS[mode] || MdInbox;
  return (
    <div className="tx-empty">
      <span className="tx-empty-icon">
        <Glyph size={48} />
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}