import type { Row } from "../lib/types";
import { useApp } from "../app/AppContext";
import { pages } from "../app/pages";

export function PageHeading() {
  const { page, systemAdmin, collectionSupervisor, auditor, technician } =
    useApp();
  const Actions = pages[page]?.Actions;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BCIS OPERATIONS</div>
          <h1>
            {page === "Dashboard"
              ? systemAdmin
                ? "System dashboard"
                : collectionSupervisor
                  ? "Collection overview"
                  : auditor
                    ? "Audit overview"
                    : technician
                      ? "Field overview"
                      : "Overview"
              : page}
          </h1>
          <p>
            {
              (
                {
                  Dashboard: systemAdmin
                    ? "System health, user access, and backup status."
                    : collectionSupervisor
                      ? "Batches in the field, remittances to check, and collector results."
                      : auditor
                        ? "Corrections, receivables, and audit activity to review."
                        : technician
                          ? "Reconnections to complete and service status in the field."
                          : "Your billing and collection performance, at a glance.",
                  "User Management": "Manage user accounts and access.",
                  "Security Audit":
                    "Review sign-ins and system administration activity.",
                  "Backup Restore":
                    "Create backups and follow the recovery procedure.",
                  "System Settings":
                    "Manage system identity and support information.",
                  Subscribers:
                    "Manage subscriber relationships and service accounts.",
                  Billing:
                    "Consistent monthly billing. A complete financial history.",
                  Payments: "Receive, track, and reconcile every payment.",
                  "GCash Verification":
                    "Review payment evidence before posting to the ledger.",
                  Collections:
                    "From assigned routes to accountable remittances.",
                  Batches:
                    "Create route batches and follow each one to remittance.",
                  "Areas & Routes":
                    "Collection areas, assigned collectors, and outstanding balances.",
                  "Remittance & Reconciliation":
                    "Record collector remittances and reconcile every batch.",
                  "Service Accounts":
                    "Look up service accounts, installation addresses and status.",
                  Suspensions:
                    "Disconnected services and accounts due for suspension.",
                  Reconnections:
                    "Complete reconnection requests after restoring service.",
                  Ledger:
                    "Find a subscriber to review their full ledger and export a statement of account.",
                  "Adjustments & Reversals":
                    "Review every payment reversal, invoice adjustment and void.",
                  "Collector Performance":
                    "Compare collectors by amount collected, rate, and remittance accuracy.",
                  Receivables:
                    "Stay ahead of outstanding balances and overdue accounts.",
                  Services: "Manage service status and reconnection requests.",
                  Reports: "Reliable reports for better operational decisions.",
                  Administration: "Manage your team, access, and recovery.",
                  "Audit Trail":
                    "An immutable record of operational and financial activity.",
                } as Row
              )[page]
            }
          </p>
        </div>
        <div className="actions">{Actions && <Actions />}</div>
      </div>
    </>
  );
}
