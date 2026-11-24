import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

// Test-only PNG writer for 8-bit grayscale inputs and their R=G=B controls.
// Filters are encoded here from known raw samples, so decoded pixels can be compared
// against values the test defines itself instead of against the product decoder.

export const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const GRAY8_PROFILE = "png-gray8-tolerant-v1" as const;

export function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function chunk(type: string, data: Buffer, badCrc = false): Buffer {
  const name = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([name, data]));
  out.writeUInt32BE(badCrc ? (crc ^ 1) >>> 0 : crc, 8 + data.length);
  return out;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Deterministic non-uniform gray samples: every value is known to the test. */
export function grayPattern(width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = (x * 37 + y * 101 + ((x * y) % 7) * 19) % 256;
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Encodes scanlines for samples of `bpp` bytes per pixel using the given filter per row. */
export function filteredScanlines(raw: Uint8Array, width: number, height: number, bpp: number, filters: number | number[]): Buffer {
  const stride = width * bpp;
  const out = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = Array.isArray(filters) ? filters[y % filters.length] : filters;
    out[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const value = raw[y * stride + i];
      const left = i >= bpp ? raw[y * stride + i - bpp] : 0;
      const up = y > 0 ? raw[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= bpp ? raw[(y - 1) * stride + i - bpp] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upLeft);
      out[y * (stride + 1) + 1 + i] = (value - predictor) & 0xff;
    }
  }
  return out;
}

export type GrayPngOptions = {
  pixels?: Uint8Array;
  filters?: number | number[];
  bitDepth?: number;
  colorType?: number;
  compression?: number;
  filterMethod?: number;
  interlace?: number;
  /** Chunks inserted between IHDR and the first IDAT. */
  beforeIdat?: Buffer[];
  /** Chunks inserted between the last IDAT and IEND. */
  afterIdat?: Buffer[];
  /** Overrides the scanline payload before deflate. */
  scan?: Buffer;
  /** Overrides the compressed IDAT payload. */
  idatData?: Buffer;
  /** Splits the compressed payload into this many IDAT chunks. */
  idatCount?: number;
};

export function ihdr(width: number, height: number, bitDepth: number, colorType: number, compression = 0, filterMethod = 0, interlace = 0): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0); data.writeUInt32BE(height, 4);
  data[8] = bitDepth; data[9] = colorType; data[10] = compression; data[11] = filterMethod; data[12] = interlace;
  return chunk("IHDR", data);
}

export function grayPng(width: number, height: number, options: GrayPngOptions = {}): Buffer {
  const bitDepth = options.bitDepth ?? 8;
  const colorType = options.colorType ?? 0;
  let compressed = options.idatData;
  if (!compressed) {
    let scan = options.scan;
    if (!scan) {
      if (bitDepth === 8 && colorType === 0) {
        scan = filteredScanlines(options.pixels ?? grayPattern(width, height), width, height, 1, options.filters ?? 0);
      } else {
        const samples = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
        const rowBytes = Math.ceil((width * samples * bitDepth) / 8);
        scan = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(rowBytes, 0x11)])));
      }
    }
    compressed = deflateSync(scan);
  }
  const count = Math.max(1, options.idatCount ?? 1);
  const size = Math.ceil(compressed.length / count);
  const idats = Array.from({ length: count }, (_, index) => chunk("IDAT", compressed!.subarray(index * size, (index + 1) * size)));
  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(width, height, bitDepth, colorType, options.compression ?? 0, options.filterMethod ?? 0, options.interlace ?? 0),
    ...(options.beforeIdat ?? []),
    ...idats,
    ...(options.afterIdat ?? []),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Metadata-free R=G=B control (IHDR, IDAT, IEND only) carrying the same gray samples. */
export function rgbControlPng(width: number, height: number, gray: Uint8Array): Buffer {
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < gray.length; index++) rgb.fill(gray[index], index * 3, index * 3 + 3);
  const scan = filteredScanlines(rgb, width, height, 3, 0);
  return Buffer.concat([PNG_SIGNATURE, ihdr(width, height, 8, 2), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]);
}

/** Identity rule from the approved policy §5.2: sha256(path \0 sha256 \0 profile) for non-strict profiles. */
export function expectedArtifactId(canonicalPath: string, sourceSha: string, profile: string | null): string {
  const input = `${canonicalPath}\0${sourceSha}` + (profile === null ? "" : `\0${profile}`);
  return `image_${sha256Hex(input).slice(0, 16)}`;
}

const int = { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 };
/** Advertised JSON Schema expected for the fifth (gray8) image record variant. */
export const graySchemaVariant = {
  type: "object",
  properties: {
    artifactId: { type: "string" }, path: { type: "string" }, sha256: { type: "string" }, byteLength: int,
    format: { type: "string", const: "png" }, mimeType: { type: "string", const: "image/png" },
    width: int, height: int, channels: { type: "number", const: 1 }, bitDepth: { type: "number", const: 8 },
    validationProfile: { type: "string", const: GRAY8_PROFILE },
    ignoredChunks: { type: "array", items: { type: "string" } }, alpha: { type: "string", const: "none" },
  },
  required: ["artifactId", "path", "sha256", "byteLength", "format", "mimeType", "width", "height", "channels", "bitDepth", "validationProfile", "ignoredChunks", "alpha"],
  additionalProperties: false,
};
