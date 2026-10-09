import { X } from "lucide-react";
import type { Row } from "../lib/types";
import { useApp } from "../app/AppContext";
import { SubscriberFormDialog } from "../dialogs/subscribers/SubscriberFormDialog";
import { GenerateBillingDialog } from "../dialogs/billing/GenerateBillingDialog";
import { PaymentDialog } from "../dialogs/payments/PaymentDialog";
import { ReceiptDialog } from "../dialogs/payments/ReceiptDialog";
import { CorrectionDialog } from "../dialogs/corrections/CorrectionDialog";
import { ProofDialog } from "../dialogs/payments/ProofDialog";
import { BatchDialog } from "../dialogs/collections/BatchDialog";
import { ReconcileDialog } from "../dialogs/collections/ReconcileDialog";
import { UserDialog } from "../dialogs/system/UserDialog";
import { ServicePolicyDialog } from "../dialogs/services/ServicePolicyDialog";
import { ServiceStateDialog } from "../dialogs/services/ServiceStateDialog";
import { AreaCollectorDialog } from "../dialogs/collections/AreaCollectorDialog";
import { PlanDialog } from "../dialogs/plans/PlanDialog";
import { ServiceAccountDialog } from "../dialogs/services/ServiceAccountDialog";
import { SubscriberStatusDialog } from "../dialogs/subscribers/SubscriberStatusDialog";
import { RateDialog } from "../dialogs/services/RateDialog";
import { PlanDirectoryDialog } from "../dialogs/plans/PlanDirectoryDialog";
import { PlanEditDialog } from "../dialogs/plans/PlanEditDialog";
import { SubscriberProfileDialog } from "../dialogs/subscribers/SubscriberProfileDialog";

export function ModalHost() {
  const { error, setError, modal, setModal, profile, selected } = useApp();
  return (
    <>
      {modal && (
        <div className="modal-backdrop">
          <section
            className={
              "modal " +
              (["profile", "payment", "reconcile"].includes(modal)
                ? "wide"
                : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">BCIS WORKSPACE</div>
                <h2>
                  {
                    (
                      {
                        subscriber: "New subscriber",
                        "subscriber-edit": "Edit subscriber",
                        "subscriber-status": "Subscriber status",
                        rate: "Update future service rate",
                        plans: "Service plan directory",
                        "plan-edit": "Edit service plan",
                        billing: "Generate monthly billing",
                        payment: "Receive payment",
                        proof: "Record GCash proof",
                        batch: "Create collection batch",
                        user: "Add team member",
                        profile: profile?.subscriber.name,
                        receipt: "Payment receipt",
                        reverse: "Reverse payment",
                        verify: "Verify GCash payment",
                        reject: "Reject GCash proof",
                        reconcile: `Collection batch #${selected?.id}`,
                        "service-state": "Service status",
                        settings: "Service policy",
                        plan: "Create service plan",
                        service: "Add service account",
                        area: "Add collection area",
                        collector: "Add collector",
                        adjust: "Invoice adjustment",
                        void: "Void invoice",
                      } as Row
                    )[modal]
                  }
                </h2>
              </div>
              <button
                onClick={() => {
                  setModal("");
                  setError("");
                }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            {error && <div className="error">{error}</div>}
            {["subscriber", "subscriber-edit"].includes(modal) && (
              <SubscriberFormDialog />
            )}
            {modal === "billing" && <GenerateBillingDialog />}
            {modal === "payment" && <PaymentDialog />}
            {modal === "receipt" && selected && <ReceiptDialog />}
            {["reverse", "verify", "reject", "adjust", "void"].includes(
              modal,
            ) && <CorrectionDialog />}
            {modal === "proof" && <ProofDialog />}
            {modal === "batch" && <BatchDialog />}
            {modal === "reconcile" && selected && <ReconcileDialog />}
            {modal === "user" && <UserDialog />}
            {modal === "settings" && <ServicePolicyDialog />}
            {modal === "service-state" && <ServiceStateDialog />}
            {["area", "collector"].includes(modal) && <AreaCollectorDialog />}
            {modal === "plan" && <PlanDialog />}
            {modal === "service" && profile && <ServiceAccountDialog />}
            {modal === "subscriber-status" && <SubscriberStatusDialog />}
            {modal === "rate" && <RateDialog />}
            {modal === "plans" && <PlanDirectoryDialog />}
            {modal === "plan-edit" && selected && <PlanEditDialog />}
            {modal === "profile" && profile && <SubscriberProfileDialog />}
          </section>
        </div>
      )}
    </>
  );
}
