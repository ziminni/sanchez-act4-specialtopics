# Demo and defense sequence

1. Log in as owner and explain receivables, collections and aging totals.
2. Open a subscriber; show separate service accounts and agreed rates.
3. Generate a month twice; show duplicate prevention.
4. Receive a partial cash payment; review oldest-first allocation and print receipt.
5. Record a GCash proof; explain why upload is not payment. Verify and show unique reference protection.
6. Show ledger, opening balance and PDF/XLSX Statement of Account.
7. Filter overdue accounts and inspect aging.
8. Show a collector batch, route sheet, remittance and explicit shortage.
9. Reverse a payment; compare preserved receipt, restored balance and audit entry.
10. Export a management report and demonstrate the cashier's denied admin request.
11. Create a backup and show the separate-database restore evidence.
12. Explain the Windows/LAN verification checklist and scale limits honestly.

## Defense answers

PostgreSQL provides concurrent transactions and row-level locking without sharing a database file. The API centralizes business rules and permissions. Unique constraints protect billing periods, receipts and GCash references. Partial payment is an allocation row smaller than the invoice balance. Advance value remains in the payment minus its active allocations. Reversals preserve provenance and produce an offsetting ledger entry. Atomic transactions prevent partial posting after a crash. Server permissions cannot be bypassed by showing a hidden UI button. Backup validity is established through a restore drill, not merely the existence of a file. A future mobile collector app should use the same API with idempotency and explicit synchronization rules.
