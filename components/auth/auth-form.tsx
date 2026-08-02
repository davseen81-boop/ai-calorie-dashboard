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
import { api, ApiRequestError } from "@/lib/api/client";

/** Shared login/signup form — the two differ only in copy and endpoint. */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await api.post(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        email,
        password,
        ...(isSignup && displayName.trim() ? { displayName: displayName.trim() } : {}),
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

          <CardContent>
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
