# Acceptance test report

BCIS Subscription Billing and Collection System
Initial laboratory verification on 5 October 2026; final regression on 9 October 2026 (Asia/Manila).

## Automated domain tests

9 passed: exact, partial, advance, oldest-first arrears, decimal parsing, allocation conservation, aging boundaries, role permission boundaries, and Manila calendar-day report windows.

## PostgreSQL and authenticated API tests

18 passed against an isolated PostgreSQL 18 database:

- AT-01: PHP 999 exact payment creates receipt, zero invoice balance, PAID state, and balanced ledger.
- AT-02: PHP 500 on PHP 999 leaves PHP 499, PARTIALLY_PAID.
- AT-03: PHP 3,000 on PHP 1,000 retains credit; future invoice consumes credit without losing value.
- AT-04: PHP 1,200 against two PHP 999 invoices clears August and leaves September PHP 798.
- AT-05: duplicate GCash reference is rejected by a database uniqueness constraint. Direct unverified GCash posting is also rejected.
- AT-06: reversal preserves the original payment, restores invoice balance and ledger, and creates an audit entry.
- AT-07: PHP 20,000 collection and remittance yields zero difference.
- AT-08: PHP 20,000 collection and PHP 19,500 remittance yields PHP 500 shortage, retained in REMITTED state.
- AT-09: three concurrent payments on the same subscriber yield unique receipts and exactly the correct allocation; no over-allocation.
- AT-10: direct cashier requests to users and backups receive HTTP 403.
- AT-11: repeated monthly billing produces zero duplicate invoices.
- Additional: same payment idempotency key returns the original receipt.
- Additional: injected transaction failure leaves no partial payment behind.

Additional regressions passed for unchanged PostgreSQL calendar dates, immutable invoice voiding, blocking credits below allocated payments, and preserving finalized invoices after a future-rate change.

## Backup and restore

AT-12 passed: the synthetic database was backed up, checksum verified, and restored transactionally into a different empty PostgreSQL database. All 50 subscribers and invoice/payment/allocation counts matched. Foreign keys were restored, no negative invoice balances were found, and sessions were invalidated. Evidence: backup-restore-evidence.json. A second drill verified attachment checksums and that a change made after the backup was absent from the restored snapshot. This was a restore drill, not an overwrite of the source database.

## End-to-end workflow checks

The synthetic GCash proof was uploaded, reviewed, and atomically posted; the resulting payment appeared in the subscriber history. A field payment was assigned to a collection batch; PHP 500 shortage remained after explicit reconciliation. Evidence: workflow-evidence.json.

Browser checks cover login, navigation, subscriber ledger, and payment allocation preview. Screenshots are saved in tests/screenshots. Final UI test result is recorded in ui-evidence.json.

## Build checks

Strict TypeScript check and production renderer/Electron bundle build pass. Actual Electron on macOS also passed secure login, sandbox/context isolation, no renderer Node access, binary GCash proof preview and native PDF report saving. Evidence: desktop-evidence.json. The actual Windows NSIS installation, Windows printing and three physical Windows client deployment remain environment-dependent release checks. Concurrent PostgreSQL/API testing does not substitute for physical LAN deployment.

## Not yet established by testing

No benchmark has established performance at 20,000 subscribers / 500,000 invoices / 500,000 payments / 1,000,000 ledger entries. Queries and indexes support paginated operational screens, but profile ledger and exports still need large-dataset streaming/pagination before a production-scale performance claim. No external payment provider or Facebook integration is implemented; GCash verification is manual as specified.

## Subscriber account-number update

The registration API now generates subscriber numbers using a PostgreSQL sequence and preserves existing accounts. The expanded PostgreSQL suite passes 20 tests, including simultaneous registration, generated-number audit evidence, reserved seed numbers and identifiers longer than five digits. The registration form was checked in the browser without creating live demo records.

## Payment subscriber autocomplete update

The payment subscriber field now presents a dropdown of partial-name/account matches with address and outstanding balance. Browser verification passed for mouse and keyboard selection, account search, no-match feedback, dismissal, and out-of-order search/profile responses. Editing the chosen subscriber disables payment posting until the newly selected account loads. No payments were posted during these checks. Evidence: payment-search-evidence.json and screenshots/payment-subscriber-dropdown.png.

### Editable generated subscriber account number

New subscriber now requests a sequence-generated suggestion before opening the form. The visible account number is editable and the server saves the submitted value. Duplicate numbers remain rejected by the database unique constraint. Cancelled forms may leave gaps in the sequence. TypeScript validation and all 20 database integration tests passed, including concurrent generation, saving suggested/custom numbers and duplicate rejection. A Chrome check confirmed the generated value is visible and editable.

### Locked generated identifiers (supersedes editable account behavior)

Subscriber account numbers, service account numbers and plan codes are generated before their forms open and shown in disabled gray fields. Server-side, actor-bound, single-use reservations preserve the displayed ID on save; client-supplied account numbers/codes are ignored. Editing subscribers or plans preserves existing identifiers. Receipt/invoice/batch IDs remain generated; external payment references and selection of existing batch IDs retain their existing meaning. All 20 database tests passed, covering displayed-ID preservation, override protection, edit protection, token reuse and wrong-kind rejection. `scripts/generated-id-check.ts` checks disabled gray fields in Chrome. Cancelled forms can leave numbering gaps.

### System-only Administrator workspace

Administrator permissions are now limited to system dashboard, user management, security audit, backup/recovery and system settings. Migration 005 replaces existing Administrator permissions; request authorization also enforces this boundary for sessions and combined role assignments. The security audit lists sign-ins and administration events without exposing financial audit payloads. Admin cannot create an Owner or change an Owner's active status. Existing business service policy remains separate from system settings. Restore remains the existing offline, empty-target recovery script; the Backup Restore page documents the procedure.

Validation: TypeScript passed; 9 unit tests passed; 21 database integration tests passed including Admin allow/deny checks, staff management, system settings and privilege restrictions. Chrome verified the exact five navigation sections and working pages (`scripts/admin-workspace-check.ts`, screenshot `tests/screenshots/admin-system-dashboard.png`).

### Security Audit upgrade

Security Audit now provides filtered outcome counts, search by user/event/IP/record, category and outcome filters, Philippine-time date ranges and timestamps, 25-row pagination, refresh, event detail dialogs and CSV export of the current page. The UI displays loading, empty and validation states and is read-only. Failed sign-ins, successful sign-ins, sign-outs and permission denials record outcome, source IP and request ID; passwords and tokens are excluded. Older events may lack request context. API details are allowlisted and financial audit records remain outside the system-admin audit feed.

Validation: 22 PostgreSQL integration tests passed, including filter counts, failed authentication, secret exclusion, date validation and authorization. TypeScript and production UI build passed. `scripts/security-audit-check.ts` passed in Chrome for filters, details, export, empty results and invalid dates. Layout reviewed in `tests/screenshots/security-audit.png`.

Windows packaging was attempted twice but could not complete due to insufficient disk space (NSIS could not write its output). Incomplete installer output was removed and release metadata now marks the installer unavailable. The application source and production UI build are validated; a new Windows installer requires a rebuild after freeing disk space.

### Administration dashboard upgrade

The system dashboard now presents clickable user/session/security/backup metrics, a seven-day Philippine-time security activity chart, recovery reminders, recent administrative events, active users by role, database connectivity and API uptime, plus quick navigation actions. All metrics come from a consistent database snapshot; backup age and unexpired sessions are labelled accurately, without implying a restore test or online presence. Business data remains excluded. Production build, 23 database integration tests and the Admin Chrome check passed; screenshot reviewed at `tests/screenshots/admin-system-dashboard.png`. Windows installer packaging remains unavailable as documented above; no installer rebuild attempted for this change.

### User Management upgrade

User Management now includes account summary cards, name/username/ID search, role and status filters, ten-row pagination, last recorded sign-in, active session counts, a role guide and account access dialogs. Activation/deactivation requires confirmation and a reason in the UI, retained in the security audit. Existing server protections for self-deactivation and Owner accounts remain enforced; unknown user IDs are rejected. User directory responses exclude password hashes and session tokens. The production build and all 23 database tests passed. `scripts/user-management-check.ts` verified filters, details, cancellation and Owner protection without changing demo accounts; screenshot reviewed at `tests/screenshots/user-management.png`. Windows packaging remains unavailable as previously documented.
