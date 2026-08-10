import type { AppRoute } from "@/app/model/types";
import { DashboardOverview } from "@/widgets/dashboard-overview";

export function DashboardPage({
  onNavigate,
}: {
  onNavigate: (route: AppRoute) => void;
}) {
  return <DashboardOverview onNavigate={onNavigate} />;
}
