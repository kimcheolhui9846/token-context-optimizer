import { createHash } from "node:crypto";
import jpeg from "jpeg-js";
import type { ImageArtifactRecord } from "./types.js";
import type { ImageArtifactStore } from "./image-artifacts.js";
import { defaultImageArtifactStore, ImageValidationError, readValidatedImageArtifact } from "./image-artifacts.js";
import { validateJpeg } from "./jpeg-validation.js";

export type OverviewOutput = {
  image: string;
  width: number; height: number;
  format: "jpeg"; mimeType: "image/jpeg";
  byteLength: number; sha256: string; quality: 75;
  encoder: { name: "jpeg-js"; version: "0.4.4" };
  resample: "area-average-v1";
  validation: ReturnType<typeof validateJpeg>;
};
export type OverviewResult = { source: ImageArtifactRecord; output: OverviewOutput };

export function areaAverageRgba(pixels: Uint8Array, W: number, H: number, channels: 3 | 4, w: number, h: number): Buffer {
  const output = Buffer.alloc(w * h * 4);
  const accumulated = new Float64Array(w * 3);
  const horizontal = new Uint32Array(w * 3);
  for (let r = 0; r < h; r += 1) {
    accumulated.fill(0);
    const sourceRowStart = Math.floor(r * H / h);
    const sourceRowEnd = Math.ceil((r + 1) * H / h) - 1;
    for (let s = sourceRowStart; s <= sourceRowEnd; s += 1) {
      horizontal.fill(0);
      for (let j = 0; j < w; j += 1) {
        const sourceColumnStart = Math.floor(j * W / w);
        const sourceColumnEnd = Math.ceil((j + 1) * W / w) - 1;
        for (let i = sourceColumnStart; i <= sourceColumnEnd; i += 1) {
          const wx = Math.max(0, Math.min((i + 1) * w, (j + 1) * W) - Math.max(i * w, j * W));
          const sourceOffset = (s * W + i) * channels;
          const target = j * 3;
          horizontal[target] += pixels[sourceOffset] * wx;
          horizontal[target + 1] += pixels[sourceOffset + 1] * wx;
          horizontal[target + 2] += pixels[sourceOffset + 2] * wx;
        }
      }
      const wy = Math.max(0, Math.min((s + 1) * h, (r + 1) * H) - Math.max(s * h, r * H));
      for (let target = 0; target < w * 3; target += 1) accumulated[target] += horizontal[target] * wy;
    }
    for (let j = 0; j < w; j += 1) {
      const outputOffset = (r * w + j) * 4;
      const target = j * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        output[outputOffset + channel] = Math.floor((2 * accumulated[target + channel] + W * H) / (2 * W * H));
      }
      output[outputOffset + 3] = 255;
    }
  }
  return output;
}

export async function overviewImageArtifact(input: {
  artifactId: string; maxSide?: number;
  allowedRoots?: string[]; store?: ImageArtifactStore;
}): Promise<OverviewResult> {
  if (typeof input?.artifactId !== "string" || input.artifactId.length === 0 ||
      (input.maxSide !== undefined && (!Number.isSafeInteger(input.maxSide) || input.maxSide < 64 || input.maxSide > 1536))) {
    throw new ImageValidationError("invalid_overview_input");
  }
  const store = input.store ?? defaultImageArtifactStore;
  const indexed = store.get(input.artifactId);
  if (!indexed) throw new ImageValidationError("artifact_not_indexed");
  const source = "ignoredChunks" in indexed
    ? { ...indexed, ignoredChunks: Array.isArray(indexed.ignoredChunks) ? [...indexed.ignoredChunks] : indexed.ignoredChunks }
    : { ...indexed };
  const pixels = await readValidatedImageArtifact(source, input.allowedRoots ?? [process.cwd()]);
  if (source.channels === 4 && !(source.validationProfile === "png-rgb8-tolerant-v1" && "alpha" in source && source.alpha === "opaque")) {
    throw new ImageValidationError("alpha_unsupported");
  }
  const maxSide = input.maxSide ?? 512;
  const longest = Math.max(source.width, source.height);
  const width = longest > maxSide ? Math.max(1, Math.round(source.width * maxSide / longest)) : source.width;
  const height = longest > maxSide ? Math.max(1, Math.round(source.height * maxSide / longest)) : source.height;
  const rgba = areaAverageRgba(pixels.pixels, source.width, source.height, source.channels, width, height);
  let encoded: Buffer;
  try {
    encoded = Buffer.from(jpeg.encode({ data: rgba, width, height }, 75).data);
  } catch {
    throw new ImageValidationError("encode_failed");
  }
  let validation: ReturnType<typeof validateJpeg>;
  try {
    validation = validateJpeg(encoded);
    if (validation.width !== width || validation.height !== height) throw new Error("dimensions");
  } catch {
    throw new ImageValidationError("output_validation_failed");
  }
  return {
    source,
    output: {
      image: encoded.toString("base64"), width, height,
      format: "jpeg", mimeType: "image/jpeg", byteLength: encoded.length,
      sha256: createHash("sha256").update(encoded).digest("hex"), quality: 75,
      encoder: { name: "jpeg-js", version: "0.4.4" }, resample: "area-average-v1", validation,
    },
  };
}
