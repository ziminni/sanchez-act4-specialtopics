import { Printer } from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import { useApp } from "../../app/AppContext";

export function ReceiptDialog() {
  const { user, selected, branding } = useApp();
  if (!selected || !user) return null;
  return (
    <>
      <div className="receipt printable">
        <div
          className={branding.logo ? "receipt-brand has-logo" : "receipt-brand"}
        >
          {branding.logo ? (
            <img src={branding.logo} alt="System logo" />
          ) : (
            user.system?.displayName || "BCIS"
          )}
        </div>
        <h3>{user.system?.businessName || branding.businessName}</h3>
        {[
          user.system?.address,
          user.system?.contactNumber,
          user.system?.email,
          user.system?.tin && `TIN ${user.system.tin}`,
        ].some(Boolean) && (
          <p className="receipt-business">
            {[
              user.system?.address,
              user.system?.contactNumber,
              user.system?.email,
              user.system?.tin && `TIN ${user.system.tin}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <p>Payment acknowledgment · {selected.receipt_no}</p>
        <hr />
        <dl>
          <dt>Subscriber</dt>
          <dd>{selected.name || `Account ID ${selected.subscriber_id}`}</dd>
          <dt>Date</dt>
          <dd>{date(selected.paid_at)}</dd>
          <dt>Payment method</dt>
          <dd>{selected.method}</dd>
          <dt>Reference</dt>
          <dd>{selected.reference || "—"}</dd>
          <dt>Status</dt>
          <dd>{selected.reversed ? "REVERSED" : "POSTED"}</dd>
        </dl>
        <div className="receipt-total">
          Amount received<strong>{money(selected.amount)}</strong>
        </div>
        <p>Thank you for choosing {user.system?.displayName || "BCIS"}.</p>
        <button className="primary no-print" onClick={() => window.print()}>
          <Printer size={16} /> Print receipt
        </button>
      </div>
    </>
  );
}
