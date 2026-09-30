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

export function validateJpeg(bytes: Buffer): { width: number; height: number; channels: 3; format: "jpeg"; mimeType: "image/jpeg"; validationProfile: "jpeg-ycbcr8-baseline-444-v1" } {
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
  return { width, height, channels: 3, format: "jpeg", mimeType: "image/jpeg", validationProfile: "jpeg-ycbcr8-baseline-444-v1" };
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
