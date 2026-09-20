import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { decode } from "fast-png";

import type { ImageArtifactRecord } from "./types.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_AXIS = 8192;
const MAX_PIXELS = 16_777_216;

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
    return record === undefined ? undefined : { ...record };
  }

  put(record: ImageArtifactRecord): void {
    this.records.set(record.artifactId, { ...record });
  }
}

export const defaultImageArtifactStore = new MemoryImageArtifactStore();

export async function indexImageArtifact(input: {
  path: string;
  allowedRoots?: string[];
  store?: ImageArtifactStore;
}): Promise<ImageArtifactRecord> {
  const source = await readBoundedSource(input.path, input.allowedRoots ?? [process.cwd()]);
  const metadata = validatePng(source.bytes);
  const sha256 = createHash("sha256").update(source.bytes).digest("hex");
  const identity = createHash("sha256").update(`${source.path}\0${sha256}`).digest("hex");
  const record: ImageArtifactRecord = {
    artifactId: `image_${identity.slice(0, 16)}`,
    path: source.path,
    sha256,
    byteLength: source.bytes.length,
    format: "png",
    mimeType: "image/png",
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    bitDepth: 8,
    validationProfile: "png-rgb8-static-v1",
  };
  const output = { ...record };
  (input.store ?? defaultImageArtifactStore).put({ ...record });
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
  validatePng(source.bytes);
  return { ...record };
}

async function readBoundedSource(
  path: string,
  allowedRoots: string[],
): Promise<{ path: string; bytes: Buffer }> {
  if (allowedRoots.length === 0) throw new ImageValidationError("path_denied");
  let canonical: string;
  let roots: string[];
  try { canonical = await realpath(resolve(path)); }
  catch { throw new ImageValidationError("read_failure"); }
  roots = (await Promise.all(allowedRoots.map(async (root) => {
    try { return await realpath(resolve(root)); } catch { return null; }
  }))).filter((root): root is string => root !== null);
  if (!roots.some((root) => isInside(root, canonical))) throw new ImageValidationError("path_denied");
  let pathBefore;
  try { pathBefore = await stat(canonical); }
  catch { throw new ImageValidationError("read_failure"); }
  if (!pathBefore.isFile()) throw new ImageValidationError("non_regular_file");
  if (pathBefore.size > MAX_BYTES) throw new ImageValidationError("encoded_size_exceeded");
  const flags = fsConstants.O_RDONLY |
    (process.platform === "win32" ? 0 : fsConstants.O_NONBLOCK) |
    (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  try { handle = await open(canonical, flags); }
  catch { throw new ImageValidationError("read_failure"); }
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new ImageValidationError("non_regular_file");
    if (before.size > MAX_BYTES) throw new ImageValidationError("encoded_size_exceeded");
    const bytes = Buffer.alloc(before.size + 1);
    let total = 0;
    while (total < bytes.length) {
      const result = await handle.read(bytes, total, bytes.length - total, total);
      if (result.bytesRead === 0) break;
      total += result.bytesRead;
    }
    const after = await handle.stat();
    let pathAfter;
    try {
      pathAfter = await stat(canonical);
      const canonicalAfter = await realpath(resolve(path));
      if (canonicalAfter !== canonical) throw new Error();
    } catch { throw new ImageValidationError("source_changed"); }
    if (!sameFileSnapshot(pathBefore, before) || !sameFileSnapshot(before, after) || !sameFileSnapshot(pathBefore, pathAfter) ||
      before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || total > before.size) {
      throw new ImageValidationError("source_changed");
    }
    if (total > MAX_BYTES) throw new ImageValidationError("encoded_size_exceeded");
    return { path: canonical, bytes: bytes.subarray(0, total) };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError("read_failure");
  } finally { try { await handle.close(); } catch { /* sanitized source errors must not expose close details */ } }
}

function validatePng(bytes: Buffer): { width: number; height: number; channels: 3 | 4 } {
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
  try {
    const decoded = decode(bytes, { checkCrc: true });
    if (decoded.width !== width || decoded.height !== height || decoded.depth !== 8 || decoded.channels !== channels) throw new Error();
  } catch { throw new ImageValidationError("malformed_png"); }
  return { width, height, channels };
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

function isInside(root: string, target: string): boolean {
  const relation = relative(root, target);
  return relation === "" ||
    (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(`..${requireSeparator()}`));
}

function sameFileSnapshot(left: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }, right: { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }): boolean {
  return left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs;
}

function requireSeparator(): string { return process.platform === "win32" ? "\\" : "/"; }
