import jpeg from "jpeg-js";

export class JpegValidationError extends Error {
  readonly code: "malformed_jpeg" | "unsupported_jpeg_profile" | "jpeg_resource_limit" | "image_dimensions_exceeded";
  constructor(code: JpegValidationError["code"]) {
    super(code);
    this.name = "JpegValidationError";
    this.code = code;
  }
}

const MAX_AXIS = 8192, MAX_PIXELS = 16_777_216, MAX_MEMORY = 128 * 1024 * 1024;
const fail = (code: JpegValidationError["code"] = "malformed_jpeg"): never => {
  throw new JpegValidationError(code);
};
type Huffman = { values: number[]; lookup: Map<number, number> };
type Component = { id: number; q: number; dc: number; ac: number };
type Tables = { q: Set<number>; dc: Map<number, Huffman>; ac: Map<number, Huffman> };

type JpegMetadata = { width: number; height: number; channels: 3; format: "jpeg"; mimeType: "image/jpeg"; validationProfile: "jpeg-ycbcr8-baseline-444-v1" };
type JpegWithPixels = JpegMetadata & { pixels: Uint8Array };
export function validateJpeg(bytes: Buffer): JpegMetadata { return validateJpegInternal(bytes, false) as JpegMetadata; }
export function validateJpegWithPixels(bytes: Buffer): JpegWithPixels { return validateJpegInternal(bytes, true) as JpegWithPixels; }
function validateJpegInternal(bytes: Buffer, includePixels: boolean): JpegMetadata | JpegWithPixels {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail();
  let p = 2, app0 = false, sof = false, sos = false, width = 0, height = 0;
  let components: Component[] = [];
  const tables: Tables = { q: new Set(), dc: new Map(), ac: new Map() };
  while (p < bytes.length) {
    if (bytes[p++] !== 0xff) fail();
    while (p < bytes.length && bytes[p] === 0xff) p++;
    const marker = bytes[p++];
    if (marker === undefined || marker === 0 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd9) fail();
    if (p + 2 > bytes.length) fail();
    const length = bytes.readUInt16BE(p);
    if (length < 2 || p + length > bytes.length) fail();
    const payload = bytes.subarray(p + 2, p + length);
    if (!app0 && marker !== 0xe0) fail("unsupported_jpeg_profile");
    if (marker === 0xe0) {
      if (app0 || !isJfif(payload)) fail(app0 ? "malformed_jpeg" : "unsupported_jpeg_profile");
      app0 = true;
    } else if (marker === 0xdb) parseDqt(payload, tables);
    else if (marker === 0xc0) {
      if (sof || payload.length < 6 || payload.length !== 6 + payload[5] * 3) fail();
      if (payload[0] !== 8 || payload[5] !== 3) fail("unsupported_jpeg_profile");
      height = payload.readUInt16BE(1);
      width = payload.readUInt16BE(3);
      if (!width || !height || width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS) fail("image_dimensions_exceeded");
      components = [];
      for (let i = 0; i < 3; i++) {
        const at = 6 + i * 3;
        const id = payload[at];
        const sampling = payload[at + 1];
        const q = payload[at + 2];
        if (![1, 2, 3].includes(id) || components.some((c) => c.id === id) || id !== i + 1 || sampling !== 0x11 || q > 3) fail("unsupported_jpeg_profile");
        if (!tables.q.has(q)) fail();
        components.push({ id, q, dc: -1, ac: -1 });
      }
      sof = true;
    } else if (marker === 0xc4) parseDht(payload, tables);
    else if (marker === 0xda) {
      if (!app0 || !sof || sos || payload.length !== 10 || payload[0] !== 3 || payload[1] !== 1 || payload[3] !== 2 || payload[5] !== 3 || payload[7] !== 0 || payload[8] !== 63 || payload[9] !== 0) fail("unsupported_jpeg_profile");
      for (let i = 0; i < 3; i++) {
        const id = payload[1 + i * 2];
        if (components.slice(0, i).some((x) => x.id === id)) fail();
        const c = components.find((x) => x.id === id)!;
        if (!c) fail();
        c.dc = payload[2 + i * 2] >> 4;
        c.ac = payload[2 + i * 2] & 15;
        if (!tables.dc.has(c.dc) || !tables.ac.has(c.ac) || !tables.q.has(c.q)) fail();
      }
      if (estimateMemory(width, height, tables) > MAX_MEMORY) fail("jpeg_resource_limit");
      const end = findScanEnd(bytes, p + length);
      decodeEntropy(bytes.subarray(p + length, end), components, tables, Math.ceil(width / 8) * Math.ceil(height / 8));
      if (end + 2 !== bytes.length || bytes[end] !== 0xff || bytes[end + 1] !== 0xd9) fail();
      sos = true;
      p = bytes.length;
      break;
    } else if (marker === 0xe1 || marker === 0xe2 || marker === 0xfe || (marker >= 0xe3 && marker <= 0xef)) fail("unsupported_jpeg_profile");
    else if (marker >= 0xc1 && marker <= 0xcf) fail("unsupported_jpeg_profile");
    else fail("unsupported_jpeg_profile");
    p += length;
  }
  if (!app0 || !sof || !sos) fail();
  let decoded!: { width: number; height: number; data: Uint8Array };
  try {
    decoded = jpeg.decode(bytes, {
      tolerantDecoding: false,
      useTArray: true,
      formatAsRGBA: false,
      maxMemoryUsageInMB: 128,
      maxResolutionInMP: 16.777216,
    });
  } catch {
    fail();
  }
  if (decoded.width !== width || decoded.height !== height || decoded.data.length !== width * height * 3) fail();
  const metadata = { width, height, channels: 3 as const, format: "jpeg" as const, mimeType: "image/jpeg" as const, validationProfile: "jpeg-ycbcr8-baseline-444-v1" as const };
  return includePixels ? { ...metadata, pixels: decoded.data } : metadata;
}

function isJfif(payload: Buffer): boolean {
  return payload.length === 14
    && payload.subarray(0, 5).equals(Buffer.from("JFIF\0", "ascii"))
    && (payload.readUInt16BE(5) === 0x0101 || payload.readUInt16BE(5) === 0x0102)
    && payload[7] <= 2
    && payload[12] === 0
    && payload[13] === 0
    && payload.readUInt16BE(8) > 0
    && payload.readUInt16BE(10) > 0;
}
function parseDqt(payload: Buffer, tables: Tables): void {
  let p = 0;
  if (payload.length === 0) fail();
  while (p < payload.length) {
    const spec = payload[p++];
    const id = spec & 15;
    if (spec >> 4 !== 0 || id > 3 || tables.q.has(id) || p + 64 > payload.length) fail();
    for (let i = 0; i < 64; i++) {
      if (payload[p + i] === 0) fail();
    }
    p += 64;
    tables.q.add(id);
  }
  if (p !== payload.length) fail();
}
function parseDht(payload: Buffer, tables: Tables): void {
  let p = 0;
  if (payload.length === 0) fail();
  while (p < payload.length) {
    const spec = payload[p++];
    const kind = spec >> 4;
    const id = spec & 15;
    if ((kind !== 0 && kind !== 1) || id > 1) fail();
    const map = kind === 0 ? tables.dc : tables.ac;
    if (map.has(id) || p + 16 > payload.length) fail();
    const counts = Array.from(payload.subarray(p, p + 16));
    p += 16;
    const total = counts.reduce((a, b) => a + b, 0);
    if (total < 1 || total > 256 || p + total > payload.length) fail();
    const values = Array.from(payload.subarray(p, p + total));
    p += total;
    if (new Set(values).size !== values.length) fail();
    for (const value of values) {
      if (kind === 0 && value > 11) fail();
      const run = value >> 4;
      const size = value & 15;
      if (kind === 1 && (size > 10 || (size === 0 && run !== 0 && value !== 0xf0))) fail();
    }
    let code = 0;
    let symbolIndex = 0;
    const lookup = new Map<number, number>();
    for (let len = 1; len <= 16; len++) {
      for (let j = 0; j < counts[len - 1]; j++) {
        if (code === (1 << len) - 1) fail();
        const key = (len << 16) | code;
        lookup.set(key, symbolIndex++);
        code++;
      }
      if (code > (1 << len)) fail();
      code <<= 1;
    }
    map.set(id, { values, lookup });
  }
  if (p !== payload.length) fail();
}
function findScanEnd(bytes: Buffer, start: number): number {
  for (let p = start; p < bytes.length - 1; p++) {
    if (bytes[p] !== 0xff) continue;
    if (bytes[p + 1] === 0) {
      p++;
      continue;
    }
    if (bytes[p + 1] === 0xd9) return p;
    fail();
  }
  fail();
  return 0;
}
class BitReader {
  private byte = 0;
  private bit = 8;
  private byteValue = 0;

  constructor(private readonly bytes: Buffer) {}

  read(): number {
    if (this.bit === 8) {
      if (this.byte >= this.bytes.length) fail();
      const value = this.bytes[this.byte++];
      if (value === 0xff) {
        if (this.byte >= this.bytes.length || this.bytes[this.byte++] !== 0) fail();
      }
      this.byteValue = value;
      this.bit = 0;
    }
    return (this.byteValue >> (7 - this.bit++)) & 1;
  }

  readBits(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i++) value = value * 2 + this.read();
    return value;
  }

  finish(): void {
    if (this.bit < 8) {
      const remainingMask = (1 << (8 - this.bit)) - 1;
      if ((this.byteValue & remainingMask) !== remainingMask) fail();
    }
    if (this.byte === this.bytes.length) return;
    if (this.bit === 8 && this.byte + 2 === this.bytes.length &&
      this.bytes[this.byte] === 0xff && this.bytes[this.byte + 1] === 0) return;
    fail();
  }
}
function symbol(reader: BitReader, table: Huffman): number {
  let code = 0;
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | reader.read();
    const index = table.lookup.get((len << 16) | code);
    if (index !== undefined) return table.values[index];
  }
  fail();
  return 0;
}
function decodeEntropy(data: Buffer, components: Component[], tables: Tables, mcus: number): void {
  const reader = new BitReader(data);
  for (let mcu = 0; mcu < mcus; mcu++) {
    for (const component of components) decodeBlock(reader, component, tables);
  }
  reader.finish();
}
function decodeBlock(reader: BitReader, component: Component, tables: Tables): void {
  const dc = symbol(reader, tables.dc.get(component.dc)!);
  if (dc > 11) fail();
  if (dc) reader.readBits(dc);
  let k = 1;
  while (k < 64) {
    const rs = symbol(reader, tables.ac.get(component.ac)!);
    const run = rs >> 4;
    const size = rs & 15;
    if (size === 0) {
      if (run === 0) return;
      if (run !== 15 || k + 16 > 64) fail();
      k += 16;
      continue;
    }
    if (size > 10 || k + run >= 64) fail();
    k += run;
    reader.readBits(size);
    k++;
  }
}
function estimateMemory(width: number, height: number, tables: Tables): number {
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  return blocks * 960 + width * height * 6 + tables.q.size * 256 + [...tables.dc.values(), ...tables.ac.values()].reduce((n, table) => n + 16 + table.values.length, 0);
}

// ---------------------------------------------------------------------------
// WBS 6.12c tolerant profile (plan section 3). Independent of the strict path
// above: own marker walker, table state, EXIF reader and decoder accounting.
// Entropy data is decoded by jpeg-js (tolerantDecoding: false); this code only
// checks marker structure, restart order and the exact allocation estimate.
// ---------------------------------------------------------------------------
export type TolerantJpegMetadata = {
  width: number; height: number; channels: 3;
  format: "jpeg"; mimeType: "image/jpeg";
  validationProfile: "jpeg-ycbcr8-tolerant-v1";
  coding: "baseline" | "extended" | "progressive";
  sampling: "1x1,1x1,1x1" | "2x1,1x1,1x1" | "1x2,1x1,1x1" | "2x2,1x1,1x1";
  ignoredSegments: string[];
  exifOrientation: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
};
export function validateJpegTolerant(bytes: Buffer): TolerantJpegMetadata {
  return validateJpegTolerantInternal(bytes).metadata;
}
export function validateJpegTolerantWithPixels(bytes: Buffer): TolerantJpegMetadata & { pixels: Uint8Array } {
  const { metadata, pixels } = validateJpegTolerantInternal(bytes);
  return { ...metadata, pixels };
}

type ExifOrientation = TolerantJpegMetadata["exifOrientation"];
type TolerantComponent = { id: number; h: number; v: number; q: number };
type TolerantFrame = {
  coding: TolerantJpegMetadata["coding"];
  sampling: TolerantJpegMetadata["sampling"];
  width: number; height: number;
  components: TolerantComponent[];
};
type TolerantState = {
  frame: TolerantFrame | null;
  qDefined: Set<number>; dcDefined: Set<number>; acDefined: Set<number>;
  dqtDefinitions: number; dhtAllocationBytes: number;
  restartInterval: number; scans: number;
  segmentNames: string[]; seenSegments: Set<string>;
  orientation: ExifOrientation;
};

const TOLERANT_MAX_MEMORY = 256 * 1024 * 1024;
const TOLERANT_Y_SAMPLING = new Map<number, TolerantJpegMetadata["sampling"]>([
  [0x11, "1x1,1x1,1x1"], [0x21, "2x1,1x1,1x1"], [0x12, "1x2,1x1,1x1"], [0x22, "2x2,1x1,1x1"],
]);
const ADOBE_SIGNATURE = Buffer.from("Adobe", "ascii");
const EXIF_SIGNATURE = Buffer.from("Exif\0\0", "latin1");

function validateJpegTolerantInternal(bytes: Buffer): { metadata: TolerantJpegMetadata; pixels: Uint8Array } {
  const { frame, state } = walkTolerantJpeg(bytes);
  if (tolerantDecoderBytes(frame, state) > TOLERANT_MAX_MEMORY) fail("jpeg_resource_limit");
  let decoded!: { width: number; height: number; data: Uint8Array };
  try {
    decoded = jpeg.decode(bytes, {
      tolerantDecoding: false,
      useTArray: true,
      formatAsRGBA: false,
      maxMemoryUsageInMB: 256,
      maxResolutionInMP: 16.777216,
    });
  } catch {
    fail();
  }
  if (!decoded || decoded.width !== frame.width || decoded.height !== frame.height ||
    !decoded.data || decoded.data.length !== frame.width * frame.height * 3) fail();
  const metadata: TolerantJpegMetadata = {
    width: frame.width,
    height: frame.height,
    channels: 3,
    format: "jpeg",
    mimeType: "image/jpeg",
    validationProfile: "jpeg-ycbcr8-tolerant-v1",
    coding: frame.coding,
    sampling: frame.sampling,
    ignoredSegments: [...state.segmentNames],
    exifOrientation: state.orientation,
  };
  return { metadata, pixels: decoded.data };
}

// Walks every marker from SOI to the final EOI (tables after scans included).
function walkTolerantJpeg(bytes: Buffer): { frame: TolerantFrame; state: TolerantState } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail();
  const state: TolerantState = {
    frame: null, qDefined: new Set(), dcDefined: new Set(), acDefined: new Set(),
    dqtDefinitions: 0, dhtAllocationBytes: 0, restartInterval: 0, scans: 0,
    segmentNames: [], seenSegments: new Set(), orientation: null,
  };
  let p = 2;
  for (;;) {
    if (p >= bytes.length || bytes[p] !== 0xff) fail();
    while (p < bytes.length && bytes[p] === 0xff) p++;
    if (p >= bytes.length) fail();
    const marker = bytes[p++];
    if (marker === 0xd9) {
      const frame = state.frame;
      if (!frame || state.scans === 0 || p !== bytes.length) return fail();
      return { frame, state };
    }
    if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) fail();
    if (bytes.length - p < 2) fail();
    const length = bytes.readUInt16BE(p);
    if (length < 2 || length > bytes.length - p) fail();
    const payload = bytes.subarray(p + 2, p + length);
    p += length;
    if (marker === 0xda) p = tolerantScan(bytes, p, payload, state);
    else tolerantSegment(marker, payload, state);
  }
}

function tolerantSegment(marker: number, payload: Buffer, state: TolerantState): void {
  if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) tolerantMetadataSegment(marker, payload, state);
  else if (marker === 0xdb) tolerantDqt(payload, state);
  else if (marker === 0xc4) tolerantDht(payload, state);
  else if (marker === 0xdd) {
    if (payload.length !== 2) fail();
    state.restartInterval = payload.readUInt16BE(0);
  } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) tolerantSof(marker, payload, state);
  else if ((marker >= 0xc0 && marker <= 0xcf) || (marker >= 0xdc && marker <= 0xdf) || (marker >= 0xf0 && marker <= 0xfd)) {
    fail("unsupported_jpeg_profile");
  } else fail();
}

function tolerantMetadataSegment(marker: number, payload: Buffer, state: TolerantState): void {
  if (marker === 0xe0 && !isJfif(payload)) fail("unsupported_jpeg_profile");
  if (marker === 0xee) {
    // Every APP14 must be Adobe: "Adobe" + version(2) + flags0(2) + flags1(2) + transform(1) = 1.
    if (payload.length !== 12 || !payload.subarray(0, ADOBE_SIGNATURE.length).equals(ADOBE_SIGNATURE) ||
      payload[11] !== 1) fail("unsupported_jpeg_profile");
  }
  if (marker === 0xe1 && state.orientation === null) state.orientation = readExifOrientation(payload);
  const name = marker === 0xfe ? "COM" : `APP${marker - 0xe0}`;
  if (!state.seenSegments.has(name)) {
    state.seenSegments.add(name);
    state.segmentNames.push(name);
  }
}

function tolerantSof(marker: number, payload: Buffer, state: TolerantState): void {
  if (state.frame) fail();
  if (payload.length < 6 || payload.length !== 6 + payload[5] * 3) fail();
  if (payload[0] !== 8 || payload[5] !== 3) fail("unsupported_jpeg_profile");
  const height = payload.readUInt16BE(1);
  const width = payload.readUInt16BE(3);
  if (!width || !height || width > MAX_AXIS || height > MAX_AXIS || width * height > MAX_PIXELS) fail("image_dimensions_exceeded");
  const components: TolerantComponent[] = [];
  for (let i = 0; i < 3; i++) {
    const at = 6 + i * 3;
    const id = payload[at];
    const hv = payload[at + 1];
    const q = payload[at + 2];
    if (id !== i + 1) fail("unsupported_jpeg_profile");
    if (i === 0 ? !TOLERANT_Y_SAMPLING.has(hv) : hv !== 0x11) fail("unsupported_jpeg_profile");
    if (q > 3 || !state.qDefined.has(q)) fail();
    components.push({ id, h: hv >> 4, v: hv & 15, q });
  }
  state.frame = {
    coding: marker === 0xc0 ? "baseline" : marker === 0xc1 ? "extended" : "progressive",
    sampling: TOLERANT_Y_SAMPLING.get(payload[7])!,
    width, height, components,
  };
}

function tolerantDqt(payload: Buffer, state: TolerantState): void {
  if (payload.length === 0) fail();
  let p = 0;
  while (p < payload.length) {
    const precision = payload[p] >> 4;
    const id = payload[p] & 15;
    p++;
    if (precision === 1) fail("unsupported_jpeg_profile");
    if (precision !== 0 || id > 3 || payload.length - p < 64) fail();
    for (let i = 0; i < 64; i++) {
      if (payload[p + i] === 0) fail();
    }
    // Tables referenced by the frame must not change after SOF.
    if (state.frame && state.frame.components.some((c) => c.q === id)) fail();
    p += 64;
    state.qDefined.add(id);
    state.dqtDefinitions++;
  }
}

// Structural checks only (jpeg-js builds the decode tree). No strict AC symbol
// restriction, so progressive EOBRUN symbols are accepted.
function tolerantDht(payload: Buffer, state: TolerantState): void {
  if (payload.length === 0) fail();
  let p = 0;
  while (p < payload.length) {
    const tableClass = payload[p] >> 4;
    const id = payload[p] & 15;
    p++;
    if (tableClass > 1 || id > 3 || payload.length - p < 16) fail();
    let total = 0;
    let code = 0;
    for (let len = 1; len <= 16; len++) {
      const count = payload[p + len - 1];
      total += count;
      code += count;
      // Oversubscribed tree or use of the reserved all-ones code.
      if (code >= 2 ** len) fail();
      code *= 2;
    }
    p += 16;
    if (total < 1 || total > 256 || payload.length - p < total) fail();
    p += total;
    (tableClass === 0 ? state.dcDefined : state.acDefined).add(id);
    state.dhtAllocationBytes += 16 + total;
  }
}

function tolerantScan(bytes: Buffer, start: number, payload: Buffer, state: TolerantState): number {
  const frame = state.frame;
  if (!frame || payload.length < 1) return fail();
  const ns = payload[0];
  if (ns < 1 || ns > 3 || payload.length !== 4 + 2 * ns) fail();
  const ss = payload[1 + 2 * ns];
  const se = payload[2 + 2 * ns];
  const ah = payload[3 + 2 * ns] >> 4;
  const al = payload[3 + 2 * ns] & 15;
  let needDc: boolean;
  let needAc: boolean;
  if (frame.coding !== "progressive") {
    if (ss !== 0 || se !== 63 || ah !== 0 || al !== 0) fail();
    needDc = true;
    needAc = true;
  } else {
    if (ss > se || se > 63 || ah > 13 || al > 13 || (ah !== 0 && ah !== al + 1)) fail();
    if (ss === 0) {
      if (se !== 0) fail();
      needDc = ah === 0; // DC refinement uses no Huffman table.
      needAc = false;
    } else {
      if (ns !== 1) fail();
      needDc = false;
      needAc = true;
    }
  }
  const selected = new Set<number>();
  for (let i = 0; i < ns; i++) {
    const id = payload[1 + 2 * i];
    const selectors = payload[2 + 2 * i];
    if (selected.has(id) || !frame.components.some((c) => c.id === id)) fail();
    selected.add(id);
    if (needDc && !state.dcDefined.has(selectors >> 4)) fail();
    if (needAc && !state.acDefined.has(selectors & 15)) fail();
  }
  if (state.scans >= 64) fail("jpeg_resource_limit");
  state.scans++;
  return walkTolerantEntropy(bytes, start, state.restartInterval);
}

// Skips entropy-coded data (FF00 stuffing, FF fill), enforcing RST D0..D7
// order from D0 in every scan. Returns the offset of the next marker's FF.
function walkTolerantEntropy(bytes: Buffer, start: number, restartInterval: number): number {
  let p = start;
  let expected = 0;
  while (p + 1 < bytes.length) {
    if (bytes[p] !== 0xff) {
      p++;
      continue;
    }
    const next = bytes[p + 1];
    if (next === 0x00) {
      p += 2;
      continue;
    }
    if (next === 0xff) {
      p++;
      continue;
    }
    if (next >= 0xd0 && next <= 0xd7) {
      if (restartInterval === 0 || next !== 0xd0 + expected) fail();
      expected = (expected + 1) & 7;
      p += 2;
      continue;
    }
    return p;
  }
  return fail();
}

// jpeg-js 0.4.4 allocation accounting (plan section 3.4), over all definitions.
function tolerantDecoderBytes(frame: TolerantFrame, state: TolerantState): number {
  const { width, height, components } = frame;
  const maxH = Math.max(...components.map((c) => c.h));
  const maxV = Math.max(...components.map((c) => c.v));
  const mcusPerLine = Math.ceil(width / 8 / maxH);
  const mcusPerColumn = Math.ceil(height / 8 / maxV);
  let estimatedBytes = width * height * 6;
  for (const c of components) {
    const blocksPerLine = Math.ceil(Math.ceil(width / 8) * c.h / maxH);
    const blocksPerColumn = Math.ceil(Math.ceil(height / 8) * c.v / maxV);
    estimatedBytes += 256 * (mcusPerLine * c.h) * (mcusPerColumn * c.v);
    estimatedBytes += 64 * blocksPerLine * blocksPerColumn;
  }
  estimatedBytes += state.dqtDefinitions * 256;
  estimatedBytes += state.dhtAllocationBytes;
  return estimatedBytes;
}

// Reads IFD0 orientation from one APP1 payload only; any defect yields null.
function readExifOrientation(payload: Buffer): ExifOrientation {
  if (payload.length < EXIF_SIGNATURE.length || !payload.subarray(0, EXIF_SIGNATURE.length).equals(EXIF_SIGNATURE)) return null;
  const tiff = payload.subarray(EXIF_SIGNATURE.length);
  if (tiff.length < 8) return null;
  const order = tiff.toString("latin1", 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const little = order === "II";
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd > tiff.length - 2) return null;
  const count = u16(ifd);
  if (count > Math.floor((tiff.length - ifd - 2) / 12)) return null;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) !== 0x0112) continue;
    if (u16(entry + 2) !== 3 || u32(entry + 4) !== 1) return null;
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? (value as ExifOrientation) : null;
  }
  return null;
}
