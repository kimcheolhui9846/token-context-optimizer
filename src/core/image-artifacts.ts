import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { decode } from "fast-png";
import { JpegValidationError, validateJpeg, validateJpegWithPixels } from "./jpeg-validation.js";
import { ReadBoundedFileError, readBoundedFile } from "./read-bounded-file.js";
import type { ReadBoundedFileErrorCode } from "./read-bounded-file.js";

import type { ImageArtifactRecord } from "./types.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_AXIS = 8192;
const MAX_PIXELS = 16_777_216;
const STRICT_PROFILES = new Set(["png-rgb8-static-v1", "jpeg-ycbcr8-baseline-444-v1"]);

export class ImageValidationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

export interface ImageArtifactStore {
  get(artifactId: string): ImageArtifactRecord | undefined;
  put(record: ImageArtifactRecord): void;
}

export class MemoryImageArtifactStore implements ImageArtifactStore {
  private readonly records = new Map<string, ImageArtifactRecord>();
  get size(): number {
    return this.records.size;
  }

  get(artifactId: string): ImageArtifactRecord | undefined {
    const record = this.records.get(artifactId);
    return record === undefined ? undefined : cloneImageArtifactRecord(record);
  }

  put(record: ImageArtifactRecord): void {
    this.records.set(record.artifactId, cloneImageArtifactRecord(record));
  }
}

export const defaultImageArtifactStore = new MemoryImageArtifactStore();

export async function indexImageArtifact(input: {
  path: string;
  allowedRoots?: string[];
  store?: ImageArtifactStore;
  profile?: "strict" | "tolerant";
}): Promise<ImageArtifactRecord> {
  const source = await readBoundedSource(input.path, input.allowedRoots ?? [process.cwd()]);
  let metadata;
  try {
    metadata = source.bytes[0] === 0xff && source.bytes[1] === 0xd8 ? validateJpeg(source.bytes) : input.profile === "tolerant" ? validatePngTolerant(source.bytes) : validatePng(source.bytes);
  } catch (error) {
    if (error instanceof JpegValidationError) throw new ImageValidationError(error.code);
    throw error;
  }
  const sha256 = createHash("sha256").update(source.bytes).digest("hex");
  const identityInput = `${source.path}\0${sha256}` + (STRICT_PROFILES.has(metadata.validationProfile) ? "" : `\0${metadata.validationProfile}`);
  const identity = createHash("sha256").update(identityInput).digest("hex");
  const record = {
    artifactId: `image_${identity.slice(0, 16)}`,
    path: source.path,
    sha256,
    byteLength: source.bytes.length,
    format: metadata.format,
    mimeType: metadata.mimeType,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    bitDepth: 8,
    validationProfile: metadata.validationProfile,
    ...(metadata.validationProfile === "png-rgb8-tolerant-v1" ? { ignoredChunks: [...metadata.ignoredChunks], alpha: metadata.alpha } : {}),
  } as ImageArtifactRecord;
  const output = cloneImageArtifactRecord(record);
  (input.store ?? defaultImageArtifactStore).put(cloneImageArtifactRecord(record));
  return output;
}

export async function inspectImageArtifact(input: {
  artifactId: string;
  allowedRoots?: string[];
  store?: ImageArtifactStore;
}): Promise<ImageArtifactRecord> {
  const store = input.store ?? defaultImageArtifactStore;
  const record = store.get(input.artifactId);
  if (!record) throw new ImageValidationError("unknown_artifact_id");
  let source: { path: string; bytes: Buffer };
  try { source = await readBoundedSource(record.path, input.allowedRoots ?? [process.cwd()]); }
  catch (error) { if (error instanceof ImageValidationError && error.code === "path_denied") throw error; throw new ImageValidationError("source_missing_or_unreadable"); }
  const hash = createHash("sha256").update(source.bytes).digest("hex");
  if (hash !== record.sha256 || source.bytes.length !== record.byteLength) throw new ImageValidationError("source_changed");
  try {
    const metadata = validateForRecord(source.bytes, record);
    if (record.validationProfile === "png-rgb8-tolerant-v1" && !recordMetadataMatches(record, metadata)) {
      throw new ImageValidationError("decode_failed");
    }
  } catch (error) {
    if (error instanceof JpegValidationError) throw new ImageValidationError(error.code);
    throw error;
  }
  return cloneImageArtifactRecord(record);
}

// Index codes; inspect and crop narrow these in their own catch blocks.
const readerErrorCodes: Record<ReadBoundedFileErrorCode, string> = {
  empty_roots: "path_denied",
  denied: "path_denied",
  read_failure: "read_failure",
  changed: "source_changed",
  non_regular: "non_regular_file",
  too_large: "encoded_size_exceeded",
};

async function readBoundedSource(
  path: string,
  allowedRoots: string[],
): Promise<{ path: string; bytes: Buffer }> {
  try {
    const source = await readBoundedFile({ path, allowedRoots, maxBytes: MAX_BYTES });
    return { path: source.canonicalPath, bytes: source.bytes };
  } catch (error) {
    if (error instanceof ReadBoundedFileError) throw new ImageValidationError(readerErrorCodes[error.code]);
    throw new ImageValidationError("read_failure");
  }
}

export type ValidatedImagePixels = {
  pixels: Uint8Array;
};
type ValidatedImage = { width: number; height: number; channels: 3 | 4; pixels: Uint8Array | Uint8ClampedArray; format: "png" | "jpeg"; mimeType: "image/png" | "image/jpeg"; validationProfile: string };
type TolerantPngImage = ValidatedImage & { format: "png"; mimeType: "image/png"; validationProfile: "png-rgb8-tolerant-v1"; ignoredChunks: string[]; alpha: "none" | "opaque" | "present" };

export async function readValidatedImageArtifact(record: ImageArtifactRecord, allowedRoots: string[]): Promise<ValidatedImagePixels> {
  let source: { path: string; bytes: Buffer };
  try { source = await readBoundedSource(record.path, allowedRoots); }
  catch (error) {
    if (error instanceof ImageValidationError && ["path_denied", "source_changed"].includes(error.code)) throw error;
    throw new ImageValidationError("source_missing_or_unreadable");
  }
  const hash = createHash("sha256").update(source.bytes).digest("hex");
  if (hash !== record.sha256 || source.bytes.length !== record.byteLength) throw new ImageValidationError("source_changed");
  try {
    const metadata = validateForRecord(source.bytes, record, true);
    const pixels = metadata.pixels;
    if (!(pixels instanceof Uint8Array) ||
      metadata.width !== record.width || metadata.height !== record.height ||
      metadata.channels !== record.channels || metadata.format !== record.format ||
      metadata.mimeType !== record.mimeType || metadata.validationProfile !== record.validationProfile ||
      pixels.length !== record.width * record.height * record.channels ||
      (record.validationProfile === "png-rgb8-tolerant-v1" && !recordMetadataMatches(record, metadata))) {
      throw new ImageValidationError("decode_failed");
    }
    return { pixels };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    if (error instanceof JpegValidationError) throw new ImageValidationError(error.code);
    throw new ImageValidationError("decode_failed");
  }
}

function validateForRecord(
  bytes: Buffer,
  record: ImageArtifactRecord,
  withPixels = false,
): ValidatedImage | TolerantPngImage {
  if (record.format === "jpeg") {
    return (withPixels ? validateJpegWithPixels(bytes) : validateJpeg(bytes)) as unknown as ValidatedImage;
  }
  return record.validationProfile === "png-rgb8-tolerant-v1"
    ? validatePngTolerant(bytes)
    : validatePng(bytes);
}

function recordMetadataMatches(
  record: ImageArtifactRecord,
  metadata: ValidatedImage | TolerantPngImage,
): boolean {
  if (record.width !== metadata.width || record.height !== metadata.height ||
      record.channels !== metadata.channels || record.bitDepth !== 8 ||
      record.format !== metadata.format || record.mimeType !== metadata.mimeType ||
      record.validationProfile !== metadata.validationProfile) return false;
  if (record.validationProfile !== "png-rgb8-tolerant-v1") return true;
  if (!("ignoredChunks" in record) || !("alpha" in record) ||
      !("ignoredChunks" in metadata) || !("alpha" in metadata) ||
      !Array.isArray(record.ignoredChunks) || !Array.isArray(metadata.ignoredChunks)) return false;
  return record.alpha === metadata.alpha &&
    record.ignoredChunks.length === metadata.ignoredChunks.length &&
    record.ignoredChunks.every((value, index) => value === metadata.ignoredChunks[index]);
}

function validatePng(bytes: Buffer): ValidatedImage & { format: "png"; mimeType: "image/png"; validationProfile: "png-rgb8-static-v1" } {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if ((bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) ||
      (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) {
      throw new ImageValidationError("unsupported_image_format");
    }
    throw new ImageValidationError("malformed_png");
  }
  let offset = 8; let sawHeader = false; let sawData = false; let ended = false;
  let width = 0; let height = 0; let channels: 3 | 4 = 3; const idats: Buffer[] = [];
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new ImageValidationError("malformed_png");
    const length = bytes.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > bytes.length) throw new ImageValidationError("malformed_png");
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString("ascii");
    if (![...typeBytes].every((byte) => (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) {
      throw new ImageValidationError("malformed_png");
    }
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBytes, data])) !== expectedCrc) throw new ImageValidationError("malformed_png");
    if (!sawHeader) {
      if (type !== "IHDR") throw new ImageValidationError("malformed_png");
      if (length !== 13) throw new ImageValidationError("malformed_png");
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS) throw new ImageValidationError("image_dimensions_exceeded");
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new ImageValidationError("unsupported_png_profile");
      channels = data[9] === 2 ? 3 : 4; sawHeader = true;
    } else if (type === "IDAT") {
      if (ended) throw new ImageValidationError("malformed_png");
      sawData = true; idats.push(data);
    } else if (type === "IHDR") {
      throw new ImageValidationError("malformed_png");
    } else if (type === "IEND") {
      if (length !== 0 || ended || !sawData) throw new ImageValidationError("malformed_png");
      ended = true;
      if (end !== bytes.length) throw new ImageValidationError("malformed_png");
    } else {
      throw new ImageValidationError("unsupported_png_profile");
    }
    offset = end;
  }
  if (!sawHeader || !sawData || !ended || offset !== bytes.length) throw new ImageValidationError("malformed_png");
  const compressed = Buffer.concat(idats);
  const expectedLength = (width * channels + 1) * height;
  let inflated: Buffer; let engine: { bytesWritten?: number } | undefined;
  try {
    const result = inflateSync(compressed, { maxOutputLength: expectedLength, info: true } as never) as unknown as { buffer: Buffer; engine: { bytesWritten?: number } };
    inflated = result.buffer; engine = result.engine;
  } catch { throw new ImageValidationError("malformed_png"); }
  if (inflated.length !== expectedLength || engine?.bytesWritten !== compressed.length) throw new ImageValidationError("malformed_png");
  for (let row = 0; row < height; row++) {
    const filter = inflated[row * (width * channels + 1)];
    if (filter > 4) throw new ImageValidationError("malformed_png");
  }
  let decoded: ReturnType<typeof decode>;
  try {
    decoded = decode(bytes, { checkCrc: true });
    if (decoded.width !== width || decoded.height !== height || decoded.depth !== 8 || decoded.channels !== channels) throw new Error();
  } catch { throw new ImageValidationError("malformed_png"); }
  return { width, height, channels, pixels: decoded.data as unknown as Uint8Array, format: "png", mimeType: "image/png", validationProfile: "png-rgb8-static-v1" };
}

function validatePngTolerant(bytes: Buffer): TolerantPngImage {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if ((bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")) throw new ImageValidationError("unsupported_image_format");
    throw new ImageValidationError("malformed_png");
  }
  let offset = 8; let sawHeader = false; let sawData = false; let ended = false; let idatClosed = false;
  let width = 0; let height = 0; let channels: 3 | 4 = 3;
  const ignoredChunks: string[] = []; const seen = new Set<string>(); const idats: Buffer[] = []; const core: Buffer[] = [PNG_SIGNATURE];
  while (offset < bytes.length) {
    if (bytes.length - offset < 12) throw new ImageValidationError("malformed_png");
    const length = bytes.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > bytes.length) throw new ImageValidationError("malformed_png");
    const typeBytes = bytes.subarray(offset + 4, offset + 8); const type = typeBytes.toString("ascii");
    if (![...typeBytes].every((byte) => (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) throw new ImageValidationError("malformed_png");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(Buffer.concat([typeBytes, data])) !== bytes.readUInt32BE(offset + 8 + length)) throw new ImageValidationError("malformed_png");
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) throw new ImageValidationError("malformed_png");
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (!width || !height || width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS) throw new ImageValidationError("image_dimensions_exceeded");
      if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw new ImageValidationError("unsupported_png_profile");
      channels = data[9] === 2 ? 3 : 4; sawHeader = true; core.push(bytes.subarray(offset, end));
    } else if (type === "IDAT") {
      if (ended || idatClosed) throw new ImageValidationError("malformed_png");
      sawData = true; idats.push(data); core.push(bytes.subarray(offset, end));
    } else if (type === "IHDR") {
      throw new ImageValidationError("malformed_png");
    } else if (type === "IEND") {
      if (!sawData || ended || length !== 0 || end !== bytes.length) throw new ImageValidationError("malformed_png");
      ended = true; core.push(bytes.subarray(offset, end));
    } else {
      if (sawData) idatClosed = true;
      const ancillary = typeBytes[0] >= 97;
      if (!ancillary || type === "PLTE" || type === "tRNS" || type === "acTL" || type === "fcTL" || type === "fdAT") throw new ImageValidationError("unsupported_png_profile");
      if (!seen.has(type)) { seen.add(type); ignoredChunks.push(type); if (ignoredChunks.length > 32) throw new ImageValidationError("unsupported_png_profile"); }
    }
    offset = end;
  }
  if (!sawHeader || !sawData || !ended) throw new ImageValidationError("malformed_png");
  const compressed = Buffer.concat(idats); const expectedLength = (width * channels + 1) * height;
  let inflated: Buffer; let engine: { bytesWritten?: number } | undefined;
  try { const result = inflateSync(compressed, { maxOutputLength: expectedLength, info: true } as never) as unknown as { buffer: Buffer; engine: { bytesWritten?: number } }; inflated = result.buffer; engine = result.engine; } catch { throw new ImageValidationError("malformed_png"); }
  if (inflated.length !== expectedLength || engine?.bytesWritten !== compressed.length) throw new ImageValidationError("malformed_png");
  for (let row = 0; row < height; row++) if (inflated[row * (width * channels + 1)] > 4) throw new ImageValidationError("malformed_png");
  let decoded: ReturnType<typeof decode>;
  try { decoded = decode(Buffer.concat(core), { checkCrc: true }); if (decoded.width !== width || decoded.height !== height || decoded.depth !== 8 || decoded.channels !== channels) throw new Error(); } catch { throw new ImageValidationError("malformed_png"); }
  const pixels = decoded.data as unknown as Uint8Array;
  const alpha = channels === 3 ? "none" : (() => { for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) return "present" as const; return "opaque" as const; })();
  return { width, height, channels, pixels, format: "png", mimeType: "image/png", validationProfile: "png-rgb8-tolerant-v1", ignoredChunks, alpha };
}

function cloneImageArtifactRecord(record: ImageArtifactRecord): ImageArtifactRecord {
  return "ignoredChunks" in record
    ? { ...record, ignoredChunks: Array.isArray(record.ignoredChunks) ? [...record.ignoredChunks] : record.ignoredChunks } as ImageArtifactRecord
    : { ...record };
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
