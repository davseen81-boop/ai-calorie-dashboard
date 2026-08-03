"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useJarvis, type ChatMessage } from "./jarvis-provider";

/**
 * Things worth doing that aren't obvious from a blank box. Deliberately shows
 * the range — logging, asking, exercise, planning — rather than four ways to
 * log food.
 */
const SUGGESTIONS = [
  "What's left today?",
  "Two eggs on toast and a flat white",
  "I ran for 30 minutes",
  "Make today an active day",
];

export function JarvisPanel() {
  const { open, setOpen, messages, send, clear, pending } = useJarvis();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Follow the conversation down, including while the typing indicator shows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  function submit() {
    if (!draft.trim() || pending) return;
    send(draft);
    setDraft("");
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          {/* Clear sits beside the title rather than inside it: nested in
              SheetTitle it becomes part of the dialog's accessible name, which
              a screen reader announces as "JarvisClear". */}
          <div className="flex items-center gap-2">
            <SheetTitle className="flex items-center gap-2">
              <span className="gradient-primary flex size-7 items-center justify-center rounded-lg">
                <Bot className="size-4 text-white" />
              </span>
              Jarvis
            </SheetTitle>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto mr-6 h-7 text-xs font-normal text-muted-foreground"
                onClick={clear}
                disabled={pending}
              >
                Clear
              </Button>
            )}
          </div>
          <SheetDescription>
            Tell me what you ate and I&apos;ll log it. Ask how the day is going.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                I can log meals and workouts, set today as a rest or active day,
                and tell you what&apos;s left against your target.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}

          {pending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Working on it…
            </div>
          )}

          <div ref={endRef} />
        </div>

        <div className="border-t px-5 py-4">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a newline. The composer is one
                // line most of the time, so sending is the common case.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Chicken salad and an apple"
              rows={2}
              maxLength={2000}
              className="min-h-0 flex-1 resize-none"
              aria-label="Message Jarvis"
            />
            <Button
              size="icon"
              className="gradient-primary shrink-0 text-white hover:opacity-90"
              onClick={submit}
              disabled={!draft.trim() || pending}
              aria-label="Send"
            >
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Estimates, not measurements — correct anything that looks off on the
            dashboard.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex flex-col gap-1.5", isUser && "items-end")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
          isUser
            ? "gradient-primary rounded-br-sm text-white"
            : "rounded-bl-sm bg-secondary text-foreground",
          message.failed && "bg-destructive/10 text-destructive",
        )}
      >
        {message.content}
      </div>

      {/* What actually changed, stated separately from the prose. The reply is
          the model's account of events; these are the writes that happened. */}
      {message.actions?.map((action, index) => (
        <span
          key={`${action.tool}-${index}`}
          className="flex items-center gap-1.5 text-xs text-success"
        >
          <Check className="size-3.5 shrink-0" />
          {action.summary}
        </span>
      ))}
    </div>
  );
}
