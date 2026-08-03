"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutDashboard, Repeat2, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { EnergyArcLogo } from "@/components/brand/energy-arc";
import { LogMealSheet } from "@/components/meals/log-meal-sheet";
import { JarvisButton } from "@/components/jarvis/jarvis-button";
import { JarvisProvider } from "@/components/jarvis/jarvis-provider";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/routines", label: "Routines", icon: Repeat2 },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * App chrome: header on every breakpoint, plus a bottom tab bar on mobile.
 *
 * The primary action (Log meal) appears in the header on desktop and as a
 * floating button on mobile, where the header is too cramped for it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <JarvisProvider>
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 items-center gap-4">
            <Link href="/dashboard" aria-label="Energy Arc — dashboard">
              <EnergyArcLogo />
            </Link>

            <nav className="ml-6 hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              {/* Desktop only: the mobile header has no room, so Jarvis gets a
                floating button down by the log-meal action instead. */}
              <div className="hidden md:block">
                <JarvisButton />
              </div>
              <ThemeToggle />
              <UserMenu />
              <div className="hidden md:block">
                <LogMealSheet />
              </div>
            </div>
          </div>
        </header>

        {/* pb-28 on mobile keeps content clear of the tab bar and FAB. */}
        <main className="container flex-1 py-6 pb-28 md:pb-10">{children}</main>

        {/* Mobile-only floating actions, stacked so Jarvis sits above the
          primary log-meal button rather than competing with it. */}
        <div className="fixed bottom-36 right-4 z-40 md:hidden">
          <JarvisButton floating />
        </div>
        <div className="fixed bottom-20 right-4 z-40 md:hidden">
          <LogMealSheet floating />
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
          <div className="grid grid-cols-4">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </JarvisProvider>
  );
}
