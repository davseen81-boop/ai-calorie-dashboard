"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Chrome's install event. Not in TypeScript's DOM types, because it isn't a
 * standard — Safari never implemented it, which is why iOS needs instructions
 * instead of a button.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "install-prompt-dismissed";

/**
 * Offers to install the app to the home screen.
 *
 * Two paths, because the platforms differ: Android and desktop Chrome fire an
 * event we can turn into a real button, while iOS has no such API and can only
 * be told where the Share menu is.
 *
 * Hidden once installed, and once dismissed — nagging about installation is
 * how an app earns an uninstall.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume until checked

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    // `standalone` means it's already been installed and is running from the
    // home screen — there is nothing to offer.
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (installed) return;

    setDismissed(false);

    const onPrompt = (event: Event) => {
      // Suppress Chrome's own mini-infobar so ours is the only offer.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari never fires that event, so detect it and show instructions.
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos && isSafari) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  if (dismissed || (!deferred && !showIosHint)) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="gradient-primary mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
          {/* Inherits the near-black label colour `.gradient-primary` sets. */}
          <Download className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install this as an app</p>

          {deferred ? (
            <>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Get an icon on your home screen and open it without the browser
                bar.
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={async () => {
                  await deferred.prompt();
                  const { outcome } = await deferred.userChoice;
                  setDeferred(null);
                  if (outcome === "accepted") dismiss();
                }}
              >
                Install
              </Button>
            </>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              Tap
              <Share className="inline size-4" aria-label="Share" />
              in Safari, then
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <SquarePlus className="size-4" aria-hidden />
                Add to Home Screen
              </span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </CardContent>
    </Card>
  );
}
