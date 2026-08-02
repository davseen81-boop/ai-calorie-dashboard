import { AppShell } from "@/components/layout/app-shell";
import { RoutineRunner } from "@/components/providers/routine-runner";
import { TimezoneSync } from "@/components/providers/timezone-sync";

/** Wraps every signed-in-style page in the shared chrome. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      {/* Renders nothing; adopts the browser timezone on first run so "today"
          is bucketed in the user's local day rather than UTC. */}
      <TimezoneSync />
      {/* Also renders nothing; logs any scheduled routine whose time has
          already passed today. */}
      <RoutineRunner />
      {children}
    </AppShell>
  );
}
