# Deployment and recovery

## Server

1. Install a supported Node.js runtime and PostgreSQL (the local test environment uses PostgreSQL 18). Keep the server's PostgreSQL port inaccessible to the three client PCs. Create an application database and a dedicated account with access only to that database.
2. Copy `.env.example` to `.env`; set DATABASE_URL, a unique SEED_PASSWORD for laboratory data, HOST and UI_ORIGIN. Do not commit `.env`.
3. Run `npm ci`, `npm run migrate`. On a clean laboratory database only, run `npm run seed`.
4. Run `npm run server` under an OS service manager. Set the server timezone to Asia/Manila. Configure storage on a reliable local disk and protect it with OS permissions.
5. For LAN use, set HOST to the server's LAN address and allow port 3001 only from authorized office machines. Use an internal HTTPS reverse proxy for credentials/session traffic; do not expose this application to the Internet without additional deployment hardening. Set client BCIS_API_URL to the HTTPS API address.
6. Back up the database and attachment directory regularly. Keep a separate offline/off-machine copy. The server requires matching PostgreSQL `pg_dump`/`pg_restore` binaries on PATH.

## Desktop clients

On the build machine: `npm run build` then `npm run dist:win`. Run the generated NSIS installer from `release/installers` on each Windows PC. Configure the BCIS_API_URL environment variable on each client before launch. No PostgreSQL installation or password belongs on a desktop client. For local development, the default endpoint is http://127.0.0.1:3001.

An unsigned Windows x64 NSIS installer has been built in release/installers. Installation and printing must still be validated on Windows before final release signoff. Code signing requires the organization's certificate and is not supplied with the source.

## Development on this Mac

`npm run dev:db` starts an isolated loopback-only PostgreSQL server on port 55432 with data under ignored `storage/dev-postgres`. It is for synthetic laboratory data only; use managed PostgreSQL for deployment. Run `npm run migrate`, `npm run seed`, then `npm run dev`. Visit http://127.0.0.1:5173. The generated `.env` contains the local seed password. Sign in as `owner`, `admin`, `cashier`, `supervisor`, `auditor`, `technician`, or `viewer`.

For the desktop shell: `npm run build`, then `npm run desktop` with the API running. Dependencies with necessary install scripts (Electron and embedded-postgres) must have those scripts approved if your npm version blocks them.

## Backup and verified restore

Create a backup from Administration. Each directory contains database.dump, attachments/, and a manifest with database/attachment SHA-256 hashes. Archive verification checks that pg_restore can read the dump. Archive verification is distinct from a successful restore drill.

For a restore drill or recovery:

1. Stop all writes by stopping the API, and retain the existing database and storage unchanged.
2. Create a NEW empty PostgreSQL database and a NEW empty attachment destination. Do not restore into the live database.
3. Run `npm run restore -- /path/to/backup postgres://user:password@host:5432/new_database /path/to/new-attachments` from a controlled admin session. Avoid placing credentials in shared shell history; use protected environment expansion in operational scripts.
4. The script checks checksums, refuses a nonempty target, restores in one transaction, checks invoice balances, copies attachments, and invalidates restored sessions.
5. Verify expected counts and sample ledgers/reports. Record the drill results. Point the stopped API at the restored database and parent storage directory, then start it and sign in on all clients.
6. Retain the old database until the recovered system is accepted. Rollback is switching the stopped API back to the old connection/storage configuration.

## Three-client validation

Install and launch on three Windows PCs. Log in as different users. Simultaneously post payments on separate accounts, then on one shared account. Verify unique receipts, oldest-first allocation and preserved advance credit. Run monthly billing twice while other clients read. Test direct cashier API rejection for users/backups. Check proof viewing/upload, reports, receipt printing, session expiry, and reconnect behavior after the API restarts. Record machine names, build checksum, timestamps and outcomes.
