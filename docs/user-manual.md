# BCIS user manual

## Sign in and lock

Open BCIS and enter your assigned username and password. Your role controls navigation and the API checks permissions independently. Use the sign-out icon beside your name to lock the workstation. Sign in again to resume.

## Register a subscriber

Choose Subscribers → New subscriber. Enter the name, address, collection area, collector, and billing/due days. The account number is generated automatically when saved (for example BCIS-00051) and shown in the success message. Existing account numbers remain unchanged. Open the new subscriber row → Services → Add service. Select the plan, enter the agreed rate, dates, and installation address. Multiple service accounts may belong to the same subscriber.

## Generate billing

Choose Billing → Generate billing. Select the month. The API bills eligible active services and applies available advance credit. Repeating the same month is safe. Review invoice balances and the subscriber Ledger tab. Invoice adjustments or voids require accounting permission and a reason. Invoices with active allocations must have their payments reversed before voiding.

## Receive payment

Choose Receive payment. Search and select the subscriber from the results. Enter the amount and method. Review oldest-first allocation and advance credit. For field collections, enter the open batch ID. Post once; the generated receipt is displayed for printing. If a network failure occurs, retry in the same payment dialog to reuse the idempotency key. Do not create a new payment without checking history first.

## Verify GCash

Payments → Record GCash proof: choose subscriber, enter reference, sender, amount, and upload PNG/JPEG evidence up to 5 MB. Authorized reviewers open GCash Verification, inspect the evidence, and compare the transaction to the company's actual GCash records. Verify and supply a reason to post, or reject with a reason. Evidence upload alone never marks an invoice paid. Duplicate references are rejected.

## Reverse a payment

Payments → Reverse is visible to authorized accounting users. State the correction reason. The original receipt remains visible as REVERSED; a linked reversal restores balances. Never erase a receipt or reuse its number. Submitted collector-batch corrections require controlled accounting handling rather than reversal of reconciled Cash.

## Collections and remittance

Create an area and collector if needed. Create a collection batch for a collector and area; subscriber balances become the route snapshot. Open the batch to show/print the route sheet. Record field receipts through Receive payment with the batch ID. Submit the batch when collections are complete. Enter actual cash remitted and a reason. Review the difference; negative is shortage, positive is overage. Confirm reconciliation, then explicitly approve closure. The difference remains on the record and report.

## Receivables and service control

Receivables filters outstanding/overdue accounts by age, area, and collector. Open a subscriber to inspect invoices and ledger. Services includes suspension candidates based on the configured overdue threshold plus grace days. Authorized operations staff may record suspension with a reason. After overdue charges are cleared, request reconnection. A technician completes a pending request to activate the service and record history.

## Reports and statements

Reports supports date-filtered collection summary, aging, collector remittance, billing by plan, subscriber master list, and reversals in PDF/XLSX. Aging is current, not historical. For a Statement of Account, open Subscribers → Ledger, choose the date range and export. The SOA includes opening balance. Printed receipts and routes use a clean print layout.

## Administration and recovery

Owners create/deactivate users and configure service policy. Use Create backup to generate a database archive and proof snapshot. Actual restoration is performed offline by the server administrator into an empty database following `deployment-guide.md`; it never overwrites the live database from an ordinary UI action.

## Troubleshooting

- Database unavailable: confirm API and PostgreSQL services are running and the API has the correct connection settings.
- Session expired: sign in again. Unsaved forms may need re-entry.
- Forbidden action: contact the owner for the appropriate role. Hiding navigation is not the only authorization check.
- Duplicate reference/account: search history before retrying. Do not invent a replacement reference for the same GCash transaction.
- Payment amount rejected: use a positive decimal with no commas and at most two decimal places.
- Cannot remit: submit the batch first. Cannot close: remit and reconcile first.
- Cannot reconnect: clear overdue charges and complete the technician request.
