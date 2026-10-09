# BCIS Subscription Billing & Collection System

A connected Electron + React desktop application backed by Fastify and PostgreSQL, built from the supplied 17-page laboratory specification. The UI and API are functional; this is not a static dashboard.

## Open the local application

The development app runs at **http://127.0.0.1:5173** while the local servers are active.

Sign in as **owner**, using the generated **SEED_PASSWORD** in your local `.env` file. The password is not stored in this README or committed source. Other synthetic roles: admin, cashier, supervisor, auditor, technician, viewer.

If the servers have stopped, open two terminals in this folder:

```sh
npm run dev:db
```

```sh
npm run dev
```

The database and application are already initialized in this workspace. Do not re-run the seed against an existing database.

## Fresh setup

```sh
npm ci
# Copy .env.example to .env and configure PostgreSQL and a unique seed password.
npm run migrate
npm run seed
npm run dev
```

For an isolated local PostgreSQL instead of a system installation, use `npm run dev:db` and the connection described in docs/deployment-guide.md. Synthetic data only: 50 subscribers, 60 services, 7 plans, 7 users, 2 collectors, 3 areas and 4 billing months.

## Implemented workflows

- Authentication, expiring sessions, server-side role permissions, user administration and audit history.
- Subscriber registration, multi-service profiles, plan creation and service status history.
- Duplicate-safe monthly billing with immutable rates, adjustments/voids, exact centavo values and oldest-first allocation.
- Exact, partial and advance payments; retained credit; unique receipts; idempotent posting; preserved reversals.
- GCash reference detection, bounded proof upload, review and atomic posting after verification.
- Collector routes, batch membership, submission, cash remittance, shortage/overage, reconciliation and approval of closure.
- Current/overdue receivables, aging, suspension candidates and technician reconnection completion.
- Dashboard, subscriber ledger/SOA, receipt/route printing and seven PDF/XLSX report types.
- Database/attachment backups, checksums and a non-destructive restore tool that requires an empty target.

## Validation

```sh
npm run typecheck
npm test
npm run build
# Isolated database required; never point acceptance tests at production:
DATABASE_URL=postgres://.../bcis_test npm run migrate
DATABASE_URL=postgres://.../bcis_test npm run test:db
node --import tsx scripts/ui-check.ts
```

Evidence: tests/acceptance-status.md, tests/backup-restore-evidence.json, tests/workflow-evidence.json, tests/screenshots/ and test source. The local PostgreSQL/API acceptance suite passed, including concurrent same-account payment posting and a real restore drill. The actual Electron desktop smoke test passed on macOS, including isolated login, proof preview and native PDF saving. Read the report for scope; physical three-PC tests and production-scale load testing are not implied.

## Windows installer

The unsigned Windows x64 installer is in `release/installers/BCIS Billing Setup 1.0.0.exe`. It packages the desktop client; run the API and PostgreSQL on your central server separately. Physical Windows/LAN validation remains required.

## Desktop build

```sh
npm run build
npm run desktop
# Build on a Windows release machine:
npm run dist:win
```

Set `BCIS_API_URL` on clients to the central API address. See docs/deployment-guide.md for network, HTTPS, service setup, installer and recovery instructions. Windows installer validation and code signing remain release steps requiring the target environment.

## Deliverables

- source/: Electron, UI, shared financial rules and API.
- database/: migrations and synthetic seed.
- docs/: technical documentation, user manual, requirements/decisions, deployment guide and demo defense outline.
- tests/: acceptance tests, restore/workflow evidence, defect log and screenshots.
- reports-samples/: seven PDF/XLSX report pairs from synthetic data.
- release/electron/ and dist/: compiled desktop and renderer assets.

## Scope and remaining release work

This is a tested laboratory implementation, not a claim of production certification. The Windows installer has been built; installation on three actual Windows clients still needs target-platform verification. Large-dataset performance has not been benchmarked; full-ledger views and report generation need streaming/pagination before claiming the PDF's maximum dataset targets. Richer collector routing and large-dataset streaming remain extension work. Manual allocation is disabled under the documented oldest-first policy. Restore is intentionally performed offline into a new database, not as an in-place browser action.

Recommended-stack differences are documented: custom CSS/native forms instead of Tailwind/shadcn, SQL migrations/queries with an available Drizzle connection, PDFKit instead of pdfmake, and Vite/esbuild instead of electron-vite. Required Electron → API → PostgreSQL separation is preserved.

### Administrator access

The `admin` account now opens a system-only workspace with Dashboard, User Management, Security Audit, Backup Restore and System Settings. It cannot view or operate subscriber, billing, payment, collection, service or financial reporting modules. Use the appropriate operational role or Owner for business operations. Run `npm run migrate` when upgrading an existing database, then sign out and sign in again.

System settings store the system display name and support contact. Backup creation is available in the workspace; restoration remains an offline server operation using `npm run restore -- <backup-directory> <empty-target-database-url> <new-attachment-directory>`. The restore script verifies checksums, requires an empty target, restores attachments and invalidates restored sessions. Administrators cannot create Owner accounts or change an Owner's active status.
