# Defect and regression log

| Issue | Root cause | Fix | Evidence |
|---|---|---|---|
| Desktop report and proof requests bypassed IPC | Browser-only fetch assumed a same-origin HTTP page; packaged renderer uses file:// | Typed API bridge supports binary responses and bounded proof uploads | TypeScript build; desktop smoke test script |
| Navigation automation could not resolve GCash button | Decorative Review badge became part of accessible name | Explicit aria-label for navigation buttons | Browser navigation script |
| Returning from Audit to Subscribers blanked the UI | One shared data state still held audit rows during the first render of Subscribers; subscriber renderer accessed missing name | Clear data synchronously on navigation and ignore responses from cancelled page loads | Full navigation loop, return to Subscribers, open ledger and payment preview |
| Potential payment-history destruction | Relying only on UI workflow leaves future API mistakes possible | Database triggers reject payment deletion, immutable fact edits, and audit mutation | Migration and financial reversal tests |
| Duplicate pending reconnection | Repeated requests could enqueue multiple operations | Partial unique index permits one incomplete reconnection per service | Database constraint |

| Electron launch interpreted as Node | Host inherited ELECTRON_RUN_AS_NODE | Desktop launcher strips the flag | Real Electron smoke passed |
| Browser-style blob download was not a reliable desktop save flow | Packaged Electron download path differed from browser automation | Dedicated narrow report IPC opens native Save dialog and writes only the selected report | Real Electron PDF save test passed |

| Report calendar dates shifted one day | PostgreSQL DATE was parsed as local midnight then printed as UTC | Preserve DATE as YYYY-MM-DD text and format timestamps in Asia/Manila; pin API database timezone | Regenerated report sample and date parser regression |
