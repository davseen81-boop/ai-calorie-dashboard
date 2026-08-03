"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, PencilLine, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MEAL_TYPES } from "@/lib/db/schema";
import { useAnalyzeMeal, useSaveMeal } from "@/hooks/use-meals";
import type { AnalyzedItem, AnalyzeResponse, MealType } from "@/types/api";
import {
  ImageProcessingError,
  formatBytes,
  prepareImageForUpload,
} from "@/lib/images";
import { AnalyzedItemsEditor } from "./analyzed-items-editor";
import { RepeatPicker } from "./repeat-picker";

export function LogMealSheet({ floating = false }: { floating?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        {floating ? (
          <Button
            size="icon"
            className="gradient-primary size-14 rounded-full text-white shadow-lg hover:opacity-90"
            aria-label="Log a meal"
          >
            <Plus className="size-6" />
          </Button>
        ) : (
          <Button className="gradient-primary text-white hover:opacity-90">
            <Plus className="mr-2 size-4" />
            Log meal
          </Button>
        )}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="h-[92dvh] rounded-t-2xl p-0 sm:h-[90dvh]"
      >
        {/* Remounting on each open resets all internal state, so a previous
            analysis never bleeds into the next entry. */}
        {open && <LogMealForm onDone={() => setOpen(false)} />}
      </SheetContent>
    </Sheet>
  );
}

type Stage = "input" | "review";

function LogMealForm({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>("input");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [mealTypeHint, setMealTypeHint] = useState<MealType | "auto">("auto");

  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [items, setItems] = useState<AnalyzedItem[]>([]);
  const [mealName, setMealName] = useState("");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [source, setSource] = useState<"text" | "photo" | "manual">("text");

  const fileInput = useRef<HTMLInputElement>(null);
  const analyze = useAnalyzeMeal();
  const save = useSaveMeal();

  function applyAnalysis(result: AnalyzeResponse, from: "text" | "photo") {
    setAnalysis(result);
    setItems(result.items);
    setMealName(result.name);
    setMealType(mealTypeHint === "auto" ? result.mealType : mealTypeHint);
    setSource(from);
    setStage("review");
  }

  function handleAnalyzeText() {
    analyze.mutate(
      {
        mode: "text",
        description: description.trim(),
        ...(mealTypeHint !== "auto" ? { mealTypeHint } : {}),
      },
      { onSuccess: (result) => applyAnalysis(result, "text") },
    );
  }

  function handleAnalyzePhoto() {
    if (!image) return;
    analyze.mutate(
      {
        mode: "photo",
        image,
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        ...(mealTypeHint !== "auto" ? { mealTypeHint } : {}),
      },
      { onSuccess: (result) => applyAnalysis(result, "photo") },
    );
  }

  async function handleFile(file: File) {
    setPreparing(true);
    try {
      // Compressed in the browser: the raw file is far too big to POST, and
      // this also re-encodes HEIC and fixes EXIF rotation.
      const prepared = await prepareImageForUpload(file);
      setImage(prepared.dataUrl);
      setImageInfo(
        `${formatBytes(prepared.originalBytes)} → ${formatBytes(prepared.encodedBytes)}`,
      );
    } catch (error) {
      toast.error(
        error instanceof ImageProcessingError
          ? error.message
          : "Could not read that image.",
      );
    } finally {
      setPreparing(false);
    }
  }

  /** Skip analysis entirely and go straight to the editor with a blank row. */
  function startManual() {
    setAnalysis(null);
    setSource("manual");
    setItems([
      { name: "", quantity: 1, unit: "serving", calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    ]);
    setStage("review");
  }

  function handleSave() {
    save.mutate(
      {
        name: mealName.trim(),
        mealType,
        source,
        rawInput:
          source === "text"
            ? description.trim()
            : source === "photo"
              ? caption.trim() || null
              : null,
        notes: analysis?.notes ?? null,
        // Null for manual entries, so the UI never shows a confidence badge
        // for numbers the user typed themselves.
        aiConfidence: analysis?.confidence ?? null,
        items,
      },
      { onSuccess: onDone },
    );
  }

  // Every item needs a name — the server rejects blanks, and catching it here
  // means the user sees a disabled button rather than a 422 after saving.
  const canSave =
    mealName.trim().length > 0 &&
    items.length > 0 &&
    items.every((item) => item.name.trim().length > 0);

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b px-5 py-4 text-left">
        <SheetTitle>
          {stage === "input"
            ? "Log a meal"
            : source === "manual"
              ? "Add the details"
              : "Check the estimate"}
        </SheetTitle>
        <SheetDescription>
          {stage === "input"
            ? "Repeat something you eat often, or describe it, photograph it, or enter it yourself."
            : source === "manual"
              ? "Add each food and its nutrition, then save."
              : "These are estimates. Correct anything that looks off before saving."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {stage === "input" ? (
          <Tabs defaultValue="repeat" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="repeat">Repeat</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="photo">Photo</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            {/* Listed first and selected by default: re-logging something you
                eat regularly is the most common action, and it's one tap. */}
            <TabsContent value="repeat" className="mt-4">
              <RepeatPicker onLogged={onDone} />
            </TabsContent>

            <TabsContent value="text" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">What did you eat?</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Two scrambled eggs, a slice of sourdough with butter, and a flat white"
                  rows={5}
                  maxLength={2000}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Quantities help — &ldquo;150g chicken&rdquo; beats
                  &ldquo;some chicken&rdquo;.
                </p>
              </div>

              <MealTypeSelect
                value={mealTypeHint}
                onChange={(v) => setMealTypeHint(v as MealType | "auto")}
              />

              <Button
                className="gradient-primary w-full text-white hover:opacity-90"
                disabled={description.trim().length < 2 || analyze.isPending}
                onClick={handleAnalyzeText}
              >
                {analyze.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Analysing…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    Analyse
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="photo" className="mt-4 space-y-4">
              <input
                ref={fileInput}
                type="file"
                // Any image type: an iPhone may hand over HEIC, which the
                // browser can decode and we re-encode to JPEG. Listing only
                // JPEG/PNG would grey those photos out in the picker.
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = "";
                }}
              />

              {image ? (
                <div className="relative overflow-hidden rounded-xl border">
                  {/* eslint-disable-next-line @next/next/no-img-element --
                      the source is a client-side data URL, which next/image
                      cannot optimise. */}
                  <img
                    src={image}
                    alt="Meal preview"
                    className="max-h-72 w-full object-cover"
                  />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-2 size-8 rounded-full"
                    onClick={() => {
                      setImage(null);
                      setImageInfo(null);
                    }}
                    aria-label="Remove photo"
                  >
                    <X className="size-4" />
                  </Button>
                  {imageInfo && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                      compressed {imageInfo}
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={preparing}
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed py-12 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  {preparing ? (
                    <>
                      <Loader2 className="size-8 animate-spin" />
                      <span className="text-sm font-medium">Preparing photo…</span>
                    </>
                  ) : (
                    <>
                      <Camera className="size-8" />
                      <span className="text-sm font-medium">
                        Take or choose a photo
                      </span>
                      <span className="text-xs">
                        Any size — it&apos;s resized on your device before upload
                      </span>
                    </>
                  )}
                </button>
              )}

              <div className="space-y-2">
                <Label htmlFor="caption">Anything to add? (optional)</Label>
                <Textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Cooked in olive oil, large portion"
                  rows={2}
                  maxLength={500}
                  className="resize-none"
                />
              </div>

              <MealTypeSelect
                value={mealTypeHint}
                onChange={(v) => setMealTypeHint(v as MealType | "auto")}
              />

              <Button
                className="gradient-primary w-full text-white hover:opacity-90"
                disabled={!image || analyze.isPending}
                onClick={handleAnalyzePhoto}
              >
                {analyze.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Analysing photo…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    Analyse photo
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Photos are analysed and then discarded — nothing is stored.
              </p>
            </TabsContent>

            {/* No AI involved: the app stays fully usable when analysis is
                unavailable, and this is the fallback when an estimate is
                wrong enough that correcting it is slower than typing it. */}
            <TabsContent value="manual" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-name">Meal name</Label>
                <Input
                  id="manual-name"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder="Chicken salad"
                  maxLength={120}
                />
              </div>

              <MealTypeSelect
                value={mealTypeHint}
                onChange={(v) => setMealTypeHint(v as MealType | "auto")}
              />

              <Button
                variant="outline"
                className="w-full"
                disabled={mealName.trim().length === 0}
                onClick={() => {
                  if (mealTypeHint !== "auto") setMealType(mealTypeHint);
                  startManual();
                }}
              >
                <PencilLine className="mr-2 size-4" />
                Enter nutrition myself
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                You&apos;ll add each food and its calories on the next step.
              </p>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {analysis && <ConfidenceBadge value={analysis.confidence} />}
              <Badge variant="secondary">{items.length} items</Badge>
            </div>

            {analysis?.notes && (
              <p className="rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                {analysis.notes}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meal-name">Meal name</Label>
                <input
                  id="meal-name"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <MealTypeSelect
                value={mealType}
                onChange={(value) => setMealType(value as MealType)}
                includeAuto={false}
              />
            </div>

            <AnalyzedItemsEditor items={items} onChange={setItems} />
          </div>
        )}
      </div>

      {stage === "review" && (
        <div className="flex gap-2 border-t px-5 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setStage("input")}
            disabled={save.isPending}
          >
            Back
          </Button>
          <Button
            className="gradient-primary flex-1 text-white hover:opacity-90"
            onClick={handleSave}
            disabled={!canSave || save.isPending}
          >
            {save.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save meal"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function MealTypeSelect({
  value,
  onChange,
  includeAuto = true,
}: {
  value: string;
  onChange: (value: string) => void;
  includeAuto?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>Meal</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {includeAuto && <SelectItem value="auto">Detect automatically</SelectItem>}
          {MEAL_TYPES.map((type) => (
            <SelectItem key={type} value={type} className="capitalize">
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Low confidence is worth flagging — it tells the user to check the numbers. */
function ConfidenceBadge({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const level = value >= 0.7 ? "high" : value >= 0.4 ? "medium" : "low";

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        level === "high" && "border-success/40 text-success",
        level === "medium" && "border-warning/40 text-warning",
        level === "low" && "border-destructive/40 text-destructive",
      )}
    >
      {percent}% confident
    </Badge>
  );
}

