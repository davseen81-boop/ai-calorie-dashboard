"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Flame, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api, ApiRequestError } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";

/** Google's brand mark, inlined so there's no external asset to fetch. */
function GoogleMark() {
  return (
    <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"
      />
    </svg>
  );
}

/** Shared login/signup form — the two differ only in copy and endpoint. */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  // Seeded from ?error= so failures redirected back from Google are shown.
  const [error, setError] = useState<string | null>(params.get("error"));
  const [pending, setPending] = useState(false);

  // Which sign-in options this server offers. Fetched rather than baked in at
  // build time, so turning Google or the invite gate on is an env change.
  const { data: config } = useQuery({
    queryKey: ["auth", "config"],
    queryFn: () =>
      api.get<{ googleEnabled: boolean; inviteRequired: boolean }>(
        "/api/auth/config",
      ),
    staleTime: 5 * 60 * 1000,
  });

  const showInvite = isSignup && config?.inviteRequired === true;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await api.post(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        email,
        password,
        ...(isSignup && displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(showInvite ? { inviteCode: inviteCode.trim() } : {}),
      });

      // `next` comes from the middleware redirect. Only same-origin paths are
      // honoured, so a crafted link can't bounce you off-site after login.
      const next = params.get("next");
      const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

      // refresh() so server components re-render with the new session before
      // the navigation lands.
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Something went wrong. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="gradient-primary flex size-12 items-center justify-center rounded-2xl shadow-sm">
            <Flame className="size-6 text-white" />
          </span>
          <h1 className="gradient-text text-2xl font-semibold tracking-tight">
            Calorie Dashboard
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isSignup ? "Create your account" : "Welcome back"}</CardTitle>
            <CardDescription>
              {isSignup
                ? "Your meals, goals and routines stay private to you."
                : "Sign in to see your dashboard."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {config?.googleEnabled && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // A full navigation, not fetch: OAuth needs the browser to
                    // follow redirects to Google and back.
                    const url = new URL("/api/auth/google", window.location.origin);
                    if (showInvite && inviteCode.trim()) {
                      url.searchParams.set("invite", inviteCode.trim());
                    }
                    window.location.href = url.toString();
                  }}
                >
                  <GoogleMark />
                  Continue with Google
                </Button>

                {showInvite && (
                  <p className="text-center text-xs text-muted-foreground">
                    Enter your invite code below first — a new account needs it
                    either way.
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignup && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Name (optional)</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    maxLength={80}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus={!isSignup}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  // Tells password managers to offer to save vs fill.
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={isSignup ? 8 : undefined}
                />
                {isSignup && (
                  <p className="text-xs text-muted-foreground">
                    At least 8 characters. A long phrase beats a short, complex
                    one.
                  </p>
                )}
              </div>

              {showInvite && (
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Invite code</Label>
                  <Input
                    id="inviteCode"
                    required
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    autoComplete="off"
                    placeholder="Ask whoever runs this app"
                  />
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="gradient-primary w-full text-white hover:opacity-90"
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {isSignup ? "Creating account…" : "Signing in…"}
                  </>
                ) : isSignup ? (
                  "Create account"
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          {isSignup ? "Already have an account? " : "No account yet? "}
          <Link
            href={isSignup ? "/login" : "/signup"}
            className="font-medium text-primary underline underline-offset-4"
          >
            {isSignup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </div>
  );
}
