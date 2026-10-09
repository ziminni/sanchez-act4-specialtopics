import { useApp } from "../../app/AppContext";
import { SystemDashboardPage } from "../system/SystemDashboardPage";
import { CollectionOverviewPage } from "../collections/CollectionOverviewPage";
import { AuditOverviewPage } from "../audit/AuditOverviewPage";
import { FieldOverviewPage } from "../field/FieldOverviewPage";
import { OperationsDashboardPage } from "./OperationsDashboardPage";

/** Each role lands on its own dashboard. */
export function DashboardPage() {
  const { systemAdmin, collectionSupervisor, auditor, technician } = useApp();
  if (systemAdmin) return <SystemDashboardPage />;
  if (collectionSupervisor) return <CollectionOverviewPage />;
  if (auditor) return <AuditOverviewPage />;
  if (technician) return <FieldOverviewPage />;
  return <OperationsDashboardPage />;
}
