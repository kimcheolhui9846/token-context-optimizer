import { createHash } from "node:crypto";
import jpeg from "jpeg-js";
import { validateJpeg } from "./jpeg-validation.js";
import { defaultImageArtifactStore, ImageValidationError, readValidatedImageArtifact } from "./image-artifacts.js";
import type { ImageArtifactStore } from "./image-artifacts.js";
import type { ImageArtifactRecord } from "./types.js";

export type CropRegion = { x: number; y: number; width: number; height: number };
export type CropResult =
  | { status: "original"; fullFrame: true; source: ImageArtifactRecord; region: CropRegion }
  | { status: "rejected"; code: "resize_required"; fullFrame: false; source: ImageArtifactRecord; region: CropRegion }
  | { status: "cropped"; fullFrame: false; source: ImageArtifactRecord; region: CropRegion; output: {
      image: string; width: number; height: number; format: "jpeg"; mimeType: "image/jpeg"; byteLength: number; sha256: string; quality: 75;
      encoder: { name: "jpeg-js"; version: "0.4.4" }; validation: ReturnType<typeof validateJpeg>;
    } };

export async function cropImageArtifact(input: { artifactId: string; region: CropRegion; allowedRoots?: string[]; store?: ImageArtifactStore }): Promise<CropResult> {
  const artifactId = input?.artifactId;
  const region = input?.region && { x: input.region.x, y: input.region.y, width: input.region.width, height: input.region.height };
  if (!isShape(artifactId, region)) throw new ImageValidationError("invalid_region");
  const indexed = (input.store ?? defaultImageArtifactStore).get(artifactId);
  if (!indexed) throw new ImageValidationError("artifact_not_indexed");
  const source = "ignoredChunks" in indexed
    ? { ...indexed, ignoredChunks: Array.isArray(indexed.ignoredChunks) ? [...indexed.ignoredChunks] : indexed.ignoredChunks }
    : { ...indexed };
  if (region.width <= 0 || region.height <= 0) throw new ImageValidationError("region_empty");
  const validated = await readValidatedImageArtifact(source, input.allowedRoots ?? [process.cwd()]);
  if (region.x < 0 || region.y < 0 || region.x + region.width > source.width || region.y + region.height > source.height) throw new ImageValidationError("region_out_of_bounds");
  if (region.x === 0 && region.y === 0 && region.width === source.width && region.height === source.height) return { status: "original", fullFrame: true, source, region };
  if (region.width > 1536 || region.height > 1536) return { status: "rejected", code: "resize_required", fullFrame: false, source, region };
  const tolerantOpaque = source.validationProfile === "png-rgb8-tolerant-v1" &&
    "alpha" in source && source.alpha === "opaque";
  if (source.channels === 4 && !tolerantOpaque) throw new ImageValidationError("alpha_unsupported");
  const pixels = Buffer.alloc(region.width * region.height * 4);
  for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
    const from = ((region.y + y) * source.width + region.x + x) * source.channels;
    const to = (y * region.width + x) * 4;
    pixels[to] = validated.pixels[from]; pixels[to + 1] = validated.pixels[from + 1]; pixels[to + 2] = validated.pixels[from + 2]; pixels[to + 3] = 255;
  }
  let encoded: Buffer;
  try { encoded = Buffer.from(jpeg.encode({ data: pixels, width: region.width, height: region.height }, 75).data); }
  catch { throw new ImageValidationError("encode_failed"); }
  let validation: ReturnType<typeof validateJpeg>;
  try { validation = validateJpeg(encoded); } catch { throw new ImageValidationError("output_validation_failed"); }
  if (validation.width !== region.width || validation.height !== region.height) throw new ImageValidationError("output_validation_failed");
  return {
    status: "cropped", fullFrame: false, source, region,
    output: {
      image: encoded.toString("base64"), width: region.width, height: region.height,
      format: "jpeg", mimeType: "image/jpeg", byteLength: encoded.length,
      sha256: createHash("sha256").update(encoded).digest("hex"), quality: 75,
      encoder: { name: "jpeg-js", version: "0.4.4" }, validation,
    },
  };
}

function isShape(artifactId: unknown, region: CropRegion | undefined): region is CropRegion {
  return typeof artifactId === "string" && artifactId.length > 0 && !!region && [region.x, region.y, region.width, region.height].every(Number.isSafeInteger) && Number.isSafeInteger(region.x + region.width) && Number.isSafeInteger(region.y + region.height);
}
