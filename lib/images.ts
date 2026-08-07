/**
 * Client-side image preparation for the analyze endpoint.
 *
 * A phone photo is 2–8MB, and base64 inflates it by a third — comfortably past
 * the 4.5MB request-body limit on Vercel, which rejects the request before any
 * of our code runs. Downscaling and re-encoding in the browser turns a typical
 * photo into 100–400KB.
 *
 * Three other problems it solves at the same time:
 *  - HEIC from iPhones: the canvas re-encodes to JPEG, which the API accepts.
 *  - EXIF rotation: decoded with `from-image` orientation, so sideways photos
 *    are analysed the right way up.
 *  - Cost and latency: fewer pixels means fewer image tokens.
 */

/** Long edge, in pixels. Well past what portion estimation needs. */
const MAX_EDGE = 1280;

/** Starting JPEG quality; reduced if the result is still too large. */
const INITIAL_QUALITY = 0.82;

/**
 * Ceiling for one encoded data URL.
 *
 * Sized so several photos of the same meal still fit in one request: four at
 * this limit stay under the platform's body cap with room to spare. A 1280px
 * JPEG lands far below it anyway — the quality step-down only engages on
 * unusually busy images.
 */
const MAX_DATA_URL_CHARS = 750_000;

export class ImageProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap applies EXIF orientation; the <img> fallback does not,
  // but browsers without it are rare and modern ones auto-orient anyway.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Falls through — some browsers reject the options bag, others can't
      // decode the format here but can via an <img> tag.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new ImageProcessingError(
          "That image couldn't be read. Try a different photo.",
        ),
      );
    };
    img.src = url;
  });
}

function toDataUrl(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new ImageProcessingError("Could not process that image."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new ImageProcessingError("Could not process that image."));
        reader.onerror = () =>
          reject(new ImageProcessingError("Could not process that image."));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

export interface PreparedImage {
  dataUrl: string;
  /** For showing the user what the upload actually saved. */
  originalBytes: number;
  encodedBytes: number;
}

/** Downscale, re-encode as JPEG, and return a data URL safe to POST. */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const source = await decode(file);

  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  if (!width || !height) {
    throw new ImageProcessingError("That image appears to be empty.");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageProcessingError("Could not process that image.");

  // JPEG has no alpha; without this, transparent PNGs render on black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  if ("close" in source) source.close();

  // Step the quality down rather than failing outright — a busy photo can
  // still be large at the starting quality.
  let quality = INITIAL_QUALITY;
  let dataUrl = await toDataUrl(canvas, quality);

  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.4) {
    quality -= 0.15;
    dataUrl = await toDataUrl(canvas, quality);
  }

  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new ImageProcessingError(
      "That image is too complex to compress. Try a smaller photo.",
    );
  }

  return {
    dataUrl,
    originalBytes: file.size,
    // base64 encodes 3 bytes per 4 characters.
    encodedBytes: Math.round((dataUrl.length * 3) / 4),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
