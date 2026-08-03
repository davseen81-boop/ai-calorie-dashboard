"use client";

import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useJarvis } from "./jarvis-provider";

/**
 * Opens the panel. Two placements, one conversation — mirrors how the log-meal
 * action appears in the header on desktop and as a floating button on mobile,
 * where the header has no room left.
 */
export function JarvisButton({ floating = false }: { floating?: boolean }) {
  const { setOpen } = useJarvis();

  if (floating) {
    return (
      <Button
        size="icon"
        variant="secondary"
        className="size-12 rounded-full border shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Ask Jarvis"
      >
        <Bot className="size-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setOpen(true)}
      aria-label="Ask Jarvis"
    >
      <Bot className="size-5" />
    </Button>
  );
}
