import type { ComponentType } from "react";
import { DashboardPage } from "../pages/overview/DashboardPage";
import { DashboardActions } from "../pages/overview/OperationsDashboardPage";
import {
  SubscribersActions,
  SubscribersPage,
} from "../pages/customers/SubscribersPage";
import { ServicesPage } from "../pages/customers/ServicesPage";
import { BillingActions, BillingPage } from "../pages/billing/BillingPage";
import { PaymentsActions, PaymentsPage } from "../pages/billing/PaymentsPage";
import { GCashVerificationPage } from "../pages/billing/GCashVerificationPage";
import { BatchesActions, BatchesPage } from "../pages/collections/BatchesPage";
import { AreasRoutesPage } from "../pages/collections/AreasRoutesPage";
import { RemittancePage } from "../pages/collections/RemittancePage";
import { CollectorPerformancePage } from "../pages/collections/CollectorPerformancePage";
import { ReceivablesPage } from "../pages/accounts/ReceivablesPage";
import { LedgerPage } from "../pages/accounts/LedgerPage";
import { ReportsPage } from "../pages/accounts/ReportsPage";
import { CorrectionsPage } from "../pages/audit/CorrectionsPage";
import { AuditTrailPage } from "../pages/audit/AuditTrailPage";
import { ServiceAccountsPage } from "../pages/field/ServiceAccountsPage";
import { SuspensionsPage } from "../pages/field/SuspensionsPage";
import { ReconnectionsPage } from "../pages/field/ReconnectionsPage";
import {
  UserManagementActions,
  UserManagementPage,
} from "../pages/system/UserManagementPage";
import { SecurityAuditPage } from "../pages/system/SecurityAuditPage";
import { BackupRestorePage } from "../pages/system/BackupRestorePage";
import { SystemSettingsPage } from "../pages/system/SystemSettingsPage";

type PageEntry = { Page: ComponentType; Actions?: ComponentType };

/** Page registry: sidebar label → page component and its header actions. */
export const pages: Record<string, PageEntry> = {
  Dashboard: { Page: DashboardPage, Actions: DashboardActions },
  Subscribers: { Page: SubscribersPage, Actions: SubscribersActions },
  Services: { Page: ServicesPage },
  Billing: { Page: BillingPage, Actions: BillingActions },
  Payments: { Page: PaymentsPage, Actions: PaymentsActions },
  "GCash Verification": { Page: GCashVerificationPage },
  Collections: { Page: BatchesPage, Actions: BatchesActions },
  Batches: { Page: BatchesPage, Actions: BatchesActions },
  "Areas & Routes": { Page: AreasRoutesPage },
  "Remittance & Reconciliation": { Page: RemittancePage },
  "Collector Performance": { Page: CollectorPerformancePage },
  Receivables: { Page: ReceivablesPage },
  Ledger: { Page: LedgerPage },
  Reports: { Page: ReportsPage },
  "Adjustments & Reversals": { Page: CorrectionsPage },
  "Audit Trail": { Page: AuditTrailPage },
  "Service Accounts": { Page: ServiceAccountsPage },
  Suspensions: { Page: SuspensionsPage },
  Reconnections: { Page: ReconnectionsPage },
  Administration: { Page: UserManagementPage, Actions: UserManagementActions },
  "User Management": {
    Page: UserManagementPage,
    Actions: UserManagementActions,
  },
  "Security Audit": { Page: SecurityAuditPage },
  "Backup Restore": { Page: BackupRestorePage },
  "System Settings": { Page: SystemSettingsPage },
};
