"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { ApiRequestError } from "@/lib/api/client";
import { useSendToJarvis, type JarvisWireMessage } from "@/hooks/use-jarvis";
import type { JarvisAction } from "@/types/api";
import { JarvisPanel } from "./jarvis-panel";

/**
 * Conversation state.
 *
 * Held here rather than inside the panel so it survives navigating between
 * pages, and so the header button and the mobile floating button drive one
 * conversation instead of two. Nothing is persisted — closing the app starts
 * a fresh chat, while the meals it logged remain.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: JarvisAction[];
  /** A failed request. Shown in the thread, but never replayed to the model. */
  failed?: boolean;
}

interface JarvisContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: ChatMessage[];
  send: (text: string) => void;
  clear: () => void;
  pending: boolean;
}

const JarvisContext = createContext<JarvisContextValue | null>(null);

export function useJarvis(): JarvisContextValue {
  const value = useContext(JarvisContext);
  if (!value) throw new Error("useJarvis must be used inside <JarvisProvider>");
  return value;
}

/**
 * The server accepts 40 messages. Trimming to the most recent keeps a long
 * conversation working instead of failing validation; a leading assistant
 * message is then dropped because both providers require the transcript to
 * open with the user.
 */
function toWire(messages: ChatMessage[]): JarvisWireMessage[] {
  const usable = messages
    .filter((message) => !message.failed)
    .slice(-40)
    .map(({ role, content }) => ({ role, content }));

  return usable[0]?.role === "assistant" ? usable.slice(1) : usable;
}

export function JarvisProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chat = useSendToJarvis();

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || chat.isPending) return;

      const next: ChatMessage[] = [
        ...messages,
        { id: crypto.randomUUID(), role: "user", content: trimmed },
      ];
      setMessages(next);

      chat.mutate(toWire(next), {
        onSuccess: (result) =>
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: result.reply,
              actions: result.actions,
            },
          ]),
        onError: (error) =>
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              // The server's wording is better than a generic one: a missing
              // API key and a rate limit need different responses from the user.
              content:
                error instanceof ApiRequestError
                  ? error.message
                  : "Something went wrong. Try again.",
              failed: true,
            },
          ]),
      });
    },
    [chat, messages],
  );

  const clear = useCallback(() => setMessages([]), []);

  const value = useMemo(
    () => ({ open, setOpen, messages, send, clear, pending: chat.isPending }),
    [open, messages, send, clear, chat.isPending],
  );

  return (
    <JarvisContext.Provider value={value}>
      {children}
      <JarvisPanel />
    </JarvisContext.Provider>
  );
}
