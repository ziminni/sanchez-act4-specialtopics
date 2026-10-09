import { FileText, ShieldCheck } from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { useApp } from "../../app/AppContext";

export function GCashVerificationPage() {
  const { setModal, selected, setSelected, proofUrl, rows } = useApp();
  return (
    <>
      <div className="proof-layout">
        <section className="panel">
          <div className="panel-head">
            <h2>Payment review queue</h2>
            <Badge
              value={`${rows.filter((r: Row) => r.status === "PENDING").length} pending`}
            />
          </div>
          {rows.map((r: Row) => (
            <button
              className={
                "proof-row " + (selected?.id === r.id ? "selected" : "")
              }
              onClick={() => setSelected(r)}
              key={r.id}
            >
              <div>
                <strong>{r.name}</strong>
                <small>{r.reference}</small>
                <Badge value={r.status} />
              </div>
              <strong>{money(r.amount)}</strong>
            </button>
          ))}
          {!rows.length && <div className="empty">No proofs to review</div>}
        </section>
        <section className="panel proof-detail">
          {selected ? (
            <>
              <div className="panel-head">
                <div>
                  <h2>{selected.name}</h2>
                  <p>Reference {selected.reference}</p>
                </div>
                <strong>{money(selected.amount)}</strong>
              </div>
              <div className="proof-preview">
                {proofUrl ? (
                  <img
                    src={proofUrl}
                    alt="Customer-submitted GCash payment evidence"
                  />
                ) : (
                  <div className="empty">
                    <FileText size={36} />
                    <p>No proof image attached</p>
                  </div>
                )}
              </div>
              <div className="proof-meta">
                <span>
                  Sender<strong>{selected.sender}</strong>
                </span>
                <span>
                  Received<strong>{date(selected.created_at)}</strong>
                </span>
                <span>
                  Status
                  <Badge value={selected.status} />
                </span>
              </div>
              {selected.status === "PENDING" && (
                <>
                  <p className="info-note">
                    Verify the reference and amount against the business GCash
                    transaction history. A screenshot alone does not confirm
                    payment.
                  </p>
                  <div className="actions pad">
                    <button
                      className="danger"
                      onClick={() => {
                        setModal("reject");
                      }}
                    >
                      Reject proof
                    </button>
                    <button
                      className="primary"
                      onClick={() => setModal("verify")}
                    >
                      Verify & post payment
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="empty">
              <ShieldCheck size={36} />
              <h3>Select a payment proof</h3>
              <p>Review the evidence and confirm the transaction.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
