import { AppShell } from "@/components/layout/app-shell";

/** Wraps every signed-in-style page in the shared chrome. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
