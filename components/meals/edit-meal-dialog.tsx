"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Camera, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MEAL_TYPES } from "@/lib/db/schema";
import { useAnalyzeMeal, useProfile, useUpdateMeal } from "@/hooks/use-meals";
import { ImageProcessingError, prepareImageForUpload } from "@/lib/images";
import { MAX_PHOTOS } from "@/lib/validation/meals";
import type { AnalyzedItem, ApiMeal, MealType } from "@/types/api";
import { AnalyzedItemsEditor } from "./analyzed-items-editor";

interface Props {
  meal: ApiMeal | null;
  onClose: () => void;
}

/**
 * Edit an existing meal.
 *
 * Sending `items` replaces the whole list server-side and re-derives the
 * totals, so the local edits and the stored totals can never disagree.
 */
export function EditMealDialog({ meal, onClose }: Props) {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [items, setItems] = useState<AnalyzedItem[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const update = useUpdateMeal();
  const analyze = useAnalyzeMeal();

  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  // The profile's zone, not the device's. A meal belongs to the day the user
  // experienced, and every other surface — the dashboard, the reports — buckets
  // it that way; editing in device time would move meals between days for
  // anyone travelling.
  const profile = useProfile();
  const zone = profile.data?.timezone ?? "UTC";

  // Re-seed the form whenever a different meal is opened.
  useEffect(() => {
    if (!meal) return;
    setName(meal.name);
    setMealType(meal.mealType);

    const local = toZonedTime(parseISO(meal.loggedAt), zone);
    setDate(format(local, "yyyy-MM-dd"));
    setTime(format(local, "HH:mm"));

    setItems(
      meal.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
      })),
    );
  }, [meal, zone]);

  /**
   * Replace the meal's foods from a new photo.
   *
   * The image is compressed in the browser first — a phone photo is far too
   * large to POST, and this also re-encodes HEIC and fixes EXIF rotation. The
   * name is only overwritten if the user has not renamed the meal themselves.
   */
  async function analysePhotos(files: File[]) {
    if (files.length === 0) return;
    setPhotoBusy(true);
    try {
      const prepared: string[] = [];
      for (const file of files.slice(0, MAX_PHOTOS)) {
        prepared.push((await prepareImageForUpload(file)).dataUrl);
      }
      analyze.mutate(
        { mode: "photo", images: prepared },
        {
          onSuccess: (result) => {
            setItems(result.items);
            if (meal && name.trim() === meal.name) setName(result.name);
            toast.success(
              prepared.length > 1
                ? `Re-read from ${prepared.length} photos`
                : "Re-read from the photo",
              {
                description: `${result.items.length} food${result.items.length === 1 ? "" : "s"} — check them before saving.`,
              },
            );
          },
          onSettled: () => setPhotoBusy(false),
        },
      );
    } catch (error) {
      setPhotoBusy(false);
      toast.error(
        error instanceof ImageProcessingError
          ? error.message
          : "Could not read that image.",
      );
    }
  }

  function handleSave() {
    if (!meal) return;

    // Only sent when both parts parse. A half-typed date would otherwise move
    // the meal to an arbitrary instant, which is worse than leaving it alone.
    const when =
      date && time ? fromZonedTime(`${date}T${time}`, zone) : null;
    const loggedAt =
      when && !Number.isNaN(when.getTime()) ? when.toISOString() : undefined;

    update.mutate(
      { id: meal.id, name: name.trim(), mealType, items, ...(loggedAt ? { loggedAt } : {}) },
      { onSuccess: onClose },
    );
  }

  // Moving a meal across midnight changes which day's totals it counts toward,
  // so it is worth saying rather than leaving them to notice.
  const movedDay =
    meal && date
      ? format(toZonedTime(parseISO(meal.loggedAt), zone), "yyyy-MM-dd") !== date
      : false;

  return (
    <Dialog open={meal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit meal</DialogTitle>
          <DialogDescription>
            Correct the name, meal type, when you ate it, or any of the
            nutrition figures.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Meal</Label>
              <Select
                value={mealType}
                onValueChange={(value) => setMealType(value as MealType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-time">Time</Label>
              <Input
                id="edit-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* Photos are analysed and discarded, never stored, so there is no
              existing image to show — this replaces the estimate from a new
              one rather than editing the old picture. */}
          <input
            ref={libraryInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void analysePhotos(files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void analysePhotos([file]);
              e.target.value = "";
            }}
          />

          <div className="space-y-2">
            <Label>Got a photo of it?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={photoBusy}
                onClick={() => libraryInput.current?.click()}
              >
                {photoBusy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ImageIcon className="mr-2 size-4" />
                )}
                Choose photos
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={photoBusy}
                onClick={() => cameraInput.current?.click()}
              >
                <Camera className="mr-2 size-4" />
                Take photo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Re-reads the meal from the pictures and replaces the foods below.
              Up to {MAX_PHOTOS} of the same meal — another angle, or the packet.
              The photos themselves are never stored.
            </p>
          </div>

          {movedDay && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              This moves the meal to a different day, so both days&apos; totals
              will change.
            </p>
          )}

          <AnalyzedItemsEditor items={items} onChange={setItems} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              update.isPending || name.trim().length === 0 || items.length === 0
            }
          >
            {update.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
