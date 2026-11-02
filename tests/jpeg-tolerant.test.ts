// WBS 6.12c JPEG tolerant profile -- attempt 2, Stage 1 tests.
//
// Written against compiling WRONG-VALUE stubs (src/core/jpeg-validation.ts):
// RED must come from value assertions (dimensions, coding, sampling, codes,
// decoder call counts), never from import/compile errors or throws.
// All fixtures come from tests/fixtures/jpeg-tolerant/ (generate-fixtures.mjs,
// provenance.json, decoder-proof.json). Every test uses the REAL jpeg-js
// decoder except the four 256 MiB boundary tests, which spy on jpeg.decode
// only to observe predecode acceptance/rejection without a 256 MiB decode.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import jpeg from "jpeg-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JpegValidationError,
  validateJpeg,
  validateJpegTolerant,
  validateJpegTolerantWithPixels,
} from "../src/core/jpeg-validation.js";

// ------------------------------------------------------------------ data ----
const ROOT = join(process.cwd(), "tests", "fixtures", "jpeg-tolerant");
type MutationRecord = { op: "replace" | "insert" | "delete"; offset: number; old: string; new: string };
type FixtureRecord = {
  file: string; kind: "root" | "mutation"; lineage: "handcrafted" | "sharp";
  parent: string | null; parentSha256: string | null; mutations: MutationRecord[];
  method: string; purpose: string; decoderRequired: "accept" | "reject" | "record";
  byteLength: number; sha256: string;
  sharp?: { version: string; libvips: string; options: Record<string, unknown>; rgbFormula: string; width: number; height: number };
  sharpProof?: { appSegments: string[]; scanCount: number; dhtAfterFirstSos: number; eobrunSymbols: string[] };
  bitMutation?: { offset: number; mask: string };
};
type Provenance = {
  attempt: string;
  generator: { file: string; sha256Lf: string; invocation: string };
  decoder: { package: string; version: string; options: Record<string, unknown> };
  encoders: { sharp: { version: string; libvips: string; location: string } };
  accountingExamples: Array<{ fixture: string; total: number; calculation: string }>;
  fixtures: FixtureRecord[];
};
type Proof = { file: string; required: string; observed: "accept" | "reject"; width?: number; height?: number; dataLength?: number; rgbSha256?: string; allRgb128?: boolean };

const provenanceText = await readFile(join(ROOT, "provenance.json"), "utf8");
const provenance = JSON.parse(provenanceText) as Provenance;
const decoderProof = JSON.parse(await readFile(join(ROOT, "decoder-proof.json"), "utf8")) as { decoder: { options: Record<string, unknown> }; results: Proof[] };
type ScanCapRecord = { file: string; parent: string; baseScanCount: number; addedScanCount: number; totalScanCount: number; byteLength: number; sha256: string; expected: string; decoderRgbSha256: string };
const scanCapProvenance = JSON.parse(await readFile(join(ROOT, "scan-cap-provenance.json"), "utf8")) as {
  generatorSha256Lf: string; parentSha256: string; baseScanCount: number; records: ScanCapRecord[];
  historicalGenerator: { recordedPath: string; preservedCopy: string; sha256Lf: string };
};

const fixtureCache = new Map<string, Buffer>();
async function fx(name: string): Promise<Buffer> {
  let bytes = fixtureCache.get(name);
  if (!bytes) { bytes = await readFile(join(ROOT, name)); fixtureCache.set(name, bytes); }
  return Buffer.from(bytes);
}
function record(name: string): FixtureRecord {
  const found = provenance.fixtures.find((f) => f.file === name);
  if (!found) throw new Error(`fixture ${name} missing from provenance`);
  return found;
}
function proofOf(name: string): Proof {
  const found = decoderProof.results.find((p) => p.file === name);
  if (!found) throw new Error(`fixture ${name} missing from decoder proof`);
  return found;
}
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
// Synchronous access to preloaded fixtures (callers copy before mutating).
const preloaded = new Map<string, Buffer>();
for (const f of provenance.fixtures) preloaded.set(f.file, await readFile(join(ROOT, f.file)));
function fixtureBytes(name: string): Buffer {
  const bytes = preloaded.get(name);
  if (!bytes) throw new Error(`fixture ${name} not preloaded`);
  return bytes;
}

const PLAN_DECODE_OPTIONS = {
  tolerantDecoding: false, useTArray: true, formatAsRGBA: false,
  maxMemoryUsageInMB: 256, maxResolutionInMP: 16.777216,
} as const;

// Returns the thrown error code, or null when nothing was thrown, so that a
// non-throwing stub fails on expect(code).toBe(expected) (value assertion).
function errorCode(run: () => unknown): string | null {
  try { run(); return null; } catch (error) {
    if (error && typeof error === "object" && "code" in error) return String((error as { code: unknown }).code);
    return "uncoded_error";
  }
}
function countNot(pixels: Uint8Array, value: number): number {
  let n = 0;
  for (const v of pixels) if (v !== value) n++;
  return n;
}
function expectConstant128(result: { width: number; height: number; pixels: Uint8Array }, width: number, height: number): void {
  expect(result.width).toBe(width);
  expect(result.height).toBe(height);
  expect(result.pixels.length).toBe(width * height * 3);
  expect(countNot(result.pixels, 128)).toBe(0);
}

afterEach(() => { vi.restoreAllMocks(); });

// ----------------------------------------------- in-test JPEG builder ----
// Mirrors the generator's handcrafted constant-128 contract (parity is
// asserted below). Used for structural and accounting inputs.
type Comp = { id: number; hv: number; tq: number; td: number; ta: number };
type DhtDef = { cls: 0 | 1; id: number; counts: number[]; values: number[] };
const toBuffer = (data: Uint8Array | readonly number[]): Buffer => (data instanceof Uint8Array ? Buffer.from(data) : Buffer.from([...data]));
function seg(marker: number, payload: Uint8Array | readonly number[]): Buffer {
  const body = toBuffer(payload);
  const n = body.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, n >> 8, n & 255]), body]);
}
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const APP0_JFIF = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
function counts(length: number, n: number): number[] { const c = new Array<number>(16).fill(0); c[length - 1] = n; return c; }
const one = (cls: 0 | 1, id: number): DhtDef => ({ cls, id, counts: counts(1, 1), values: [0] });
const dht = (defs: DhtDef[]) => seg(0xc4, Buffer.concat(defs.map((d) => Buffer.from([(d.cls << 4) | d.id, ...d.counts, ...d.values]))));
const dqt = (defs: Array<{ id: number; value?: number }>) => seg(0xdb, Buffer.concat(defs.map((d) => Buffer.from([d.id, ...new Array<number>(64).fill(d.value ?? 1)]))));
const comps3 = (yHv: number): Comp[] => [
  { id: 1, hv: yHv, tq: 0, td: 0, ta: 0 }, { id: 2, hv: 0x11, tq: 0, td: 0, ta: 0 }, { id: 3, hv: 0x11, tq: 0, td: 0, ta: 0 },
];
function entropy(units: number, blocksPerUnit: number, restartInterval = 0): Buffer {
  const out: number[] = [];
  let acc = 0, n = 0, rst = 0;
  const bit = (v: number) => {
    acc = (acc << 1) | v; n++;
    if (n === 8) { const b = acc & 255; out.push(b); if (b === 0xff) out.push(0); acc = 0; n = 0; }
  };
  const pad = () => { while (n !== 0) bit(1); };
  for (let u = 0; u < units; u++) {
    if (restartInterval && u > 0 && u % restartInterval === 0) { pad(); out.push(0xff, 0xd0 + (rst++ % 8)); }
    for (let b = 0; b < blocksPerUnit; b++) { bit(0); bit(0); }
  }
  pad();
  return Buffer.from(out);
}
type BuildOptions = {
  width: number; height: number; comps?: Comp[]; app0?: boolean; pre?: Buffer[];
  dqtSegments?: Buffer[]; postSof?: Buffer[]; dhtSegments?: Buffer[]; restartInterval?: number; sof?: number;
};
function build(o: BuildOptions): Buffer {
  const comps = o.comps ?? comps3(0x11);
  const maxH = Math.max(...comps.map((c) => c.hv >> 4));
  const maxV = Math.max(...comps.map((c) => c.hv & 15));
  const sofPayload = [8, o.height >> 8, o.height & 255, o.width >> 8, o.width & 255, comps.length, ...comps.flatMap((c) => [c.id, c.hv, c.tq])];
  const units = Math.ceil(o.width / 8 / maxH) * Math.ceil(o.height / 8 / maxV);
  const blocks = comps.reduce((sum, c) => sum + (c.hv >> 4) * (c.hv & 15), 0);
  const sos = [comps.length, ...comps.flatMap((c) => [c.id, (c.td << 4) | c.ta]), 0, 63, 0];
  const ri = o.restartInterval ?? 0;
  return Buffer.concat([
    SOI, ...(o.app0 === false ? [] : [APP0_JFIF]), ...(o.pre ?? []),
    ...(o.dqtSegments ?? [dqt([{ id: 0 }])]), seg(o.sof ?? 0xc0, sofPayload), ...(o.postSof ?? []),
    ...(o.dhtSegments ?? [dht([one(0, 0), one(1, 0)])]), ...(ri ? [seg(0xdd, [ri >> 8, ri & 255])] : []),
    seg(0xda, sos), entropy(units, blocks, ri), EOI,
  ]);
}

type Segment = { marker: number; offset: number; total: number; payloadOffset: number; payloadLength: number };
type Scan = { sosOffset: number; entropyOffset: number; entropyEnd: number; rst: number[] };
function segmentsOf(bytes: Buffer): { segments: Segment[]; scans: Scan[] } {
  const segments: Segment[] = [];
  const scans: Scan[] = [];
  let p = 2;
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) throw new Error(`marker expected at ${p}`);
    while (bytes[p + 1] === 0xff) p++;
    const marker = bytes[p + 1];
    if (marker === 0xd9) { segments.push({ marker, offset: p, total: 2, payloadOffset: p + 2, payloadLength: 0 }); break; }
    const length = bytes.readUInt16BE(p + 2);
    const s: Segment = { marker, offset: p, total: length + 2, payloadOffset: p + 4, payloadLength: length - 2 };
    segments.push(s);
    p += length + 2;
    if (marker === 0xda) {
      let q = p;
      const rst: number[] = [];
      while (q + 1 < bytes.length) {
        if (bytes[q] !== 0xff) { q++; continue; }
        const next = bytes[q + 1];
        if (next === 0x00) { q += 2; continue; }
        if (next === 0xff) { q++; continue; }
        if (next >= 0xd0 && next <= 0xd7) { rst.push(next); q += 2; continue; }
        break;
      }
      scans.push({ sosOffset: s.offset, entropyOffset: p, entropyEnd: q, rst });
      p = q;
    }
  }
  return { segments, scans };
}
const splice = (bytes: Buffer, offset: number, deleteCount: number, insert: Uint8Array | readonly number[] = []): Buffer =>
  Buffer.concat([bytes.subarray(0, offset), toBuffer(insert), bytes.subarray(offset + deleteCount)]);
const replaceSegment = (bytes: Buffer, s: Segment, replacement: Buffer): Buffer => splice(bytes, s.offset, s.total, replacement);
const payloadOf = (bytes: Buffer, s: Segment): Buffer => Buffer.from(bytes.subarray(s.payloadOffset, s.payloadOffset + s.payloadLength));
const firstSegment = (bytes: Buffer, marker: number): Segment => {
  const found = segmentsOf(bytes).segments.find((s) => s.marker === marker);
  if (!found) throw new Error(`marker ${marker.toString(16)} not found`);
  return found;
};

const P420 = "hc-420-32x16-app0.jpg";
const NOAPP0 = "hc-420-32x16-noapp0.jpg";
const SHARP_BASE = "sharp-baseline-420-50x34.jpg";
const SHARP_PROG = "sharp-progressive-420-50x34.jpg";
const RESTART = "hc-restart-420-80x32-app0.jpg";
const MULTISCAN = "hc-restart-multiscan-444-40x16-app0.jpg";
const WRAP10 = [0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd0];

// ============================================================ provenance ====
describe("fixture provenance (attempt2 generator output)", () => {
  it("scan-cap supplement binds the current generator, base and decoder-valid 64/65 JPEGs", async () => {
    const source = await readFile(join(ROOT, "generate-fixtures.mjs"), "utf8");
    expect(scanCapProvenance.generatorSha256Lf).toBe(sha(Buffer.from(source.replace(/\r\n/g, "\n"))));
    expect(scanCapProvenance.historicalGenerator).toMatchObject({
      recordedPath: "tests/fixtures/jpeg-tolerant/generate-fixtures.mjs",
      preservedCopy: "tests/fixtures/jpeg-tolerant/generate-fixtures.attempt2.mjs",
      sha256Lf: provenance.generator.sha256Lf,
    });
    expect(scanCapProvenance.parentSha256).toBe(record(SHARP_PROG).sha256);
    expect(scanCapProvenance.baseScanCount).toBe(record(SHARP_PROG).sharpProof!.scanCount);
    for (const item of scanCapProvenance.records) {
      const bytes = await fx(item.file);
      expect(bytes.length).toBe(item.byteLength);
      expect(sha(bytes)).toBe(item.sha256);
      expect(item.baseScanCount + item.addedScanCount).toBe(item.totalScanCount);
      expect(segmentsOf(bytes).scans).toHaveLength(item.totalScanCount);
      const decoded = jpeg.decode(bytes, PLAN_DECODE_OPTIONS);
      expect(sha(decoded.data)).toBe(item.decoderRgbSha256);
    }
  });
  it("provenance: every fixture file matches recorded byteLength and sha256", async () => {
    expect(provenance.attempt).toBe("attempt2");
    expect(provenance.fixtures.length).toBeGreaterThan(40);
    for (const f of provenance.fixtures) {
      const bytes = await fx(f.file);
      expect(bytes.length, f.file).toBe(f.byteLength);
      expect(sha(bytes), f.file).toBe(f.sha256);
    }
  });

  it("scan-cap provenance binds the 64/65 total-SOS fixtures and their parent", async () => {
    expect(scanCapProvenance.baseScanCount).toBe(10);
    expect(scanCapProvenance.records.map((r) => [r.totalScanCount, r.addedScanCount])).toEqual([[64, 54], [65, 55]]);
    for (const record of scanCapProvenance.records) {
      const bytes = await fx(record.file);
      expect(bytes.length, record.file).toBe(record.byteLength);
      expect(sha(bytes), record.file).toBe(record.sha256);
      expect(record.parent).toBe(SHARP_PROG);
    }
  });

  it("provenance: mutation fixtures reproduce from parent bytes with recorded offset/old/new hex", async () => {
    const mutations = provenance.fixtures.filter((f) => f.kind === "mutation");
    expect(mutations.length).toBeGreaterThan(20);
    for (const f of mutations) {
      expect(f.parent, f.file).not.toBeNull();
      const parentBytes = await fx(f.parent!);
      expect(sha(parentBytes), f.file).toBe(f.parentSha256);
      expect(f.mutations.length, f.file).toBeGreaterThan(0);
      let current = parentBytes;
      for (const m of f.mutations) {
        const oldBytes = Buffer.from(m.old, "hex");
        const newBytes = Buffer.from(m.new, "hex");
        expect(current.subarray(m.offset, m.offset + oldBytes.length).toString("hex"), `${f.file}@${m.offset}`).toBe(m.old);
        if (m.op === "replace") expect(newBytes.length).toBe(oldBytes.length);
        if (m.op === "insert") expect(m.old).toBe("");
        if (m.op === "delete") expect(m.new).toBe("");
        current = splice(current, m.offset, oldBytes.length, newBytes);
      }
      expect(sha(current), f.file).toBe(f.sha256);
    }
  });

  it("provenance: generated roots declare parent null and sharp roots record encoder version/options without absolute paths", () => {
    for (const f of provenance.fixtures.filter((x) => x.kind === "root")) {
      expect(f.parent, f.file).toBeNull();
      expect(f.parentSha256, f.file).toBeNull();
      expect(f.mutations, f.file).toEqual([]);
    }
    for (const name of [SHARP_BASE, SHARP_PROG]) {
      const sharp = record(name).sharp!;
      expect(sharp).toMatchObject({ version: "0.35.4", libvips: "8.18.6", width: 50, height: 34 });
      expect(sharp.options).toMatchObject({ quality: 90, chromaSubsampling: "4:2:0", progressive: name === SHARP_PROG });
      expect(sharp.rgbFormula).toMatch(/R=/);
    }
    expect(provenance.encoders.sharp).toMatchObject({ version: "0.35.4", libvips: "8.18.6" });
    expect(provenanceText).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(provenanceText).not.toMatch(/AppData|[\\/]Users[\\/]/i);
  });

  it("provenance: generator source hash (LF-normalized) matches the checked-in generator", async () => {
    const source = await readFile(join(ROOT, "generate-fixtures.attempt2.mjs"), "utf8");
    expect(sha(Buffer.from(source.replace(/\r\n/g, "\n"), "utf8"))).toBe(provenance.generator.sha256Lf);
    expect(provenance.generator.file).toBe("tests/fixtures/jpeg-tolerant/generate-fixtures.mjs");
  });

  it("provenance: decoder proof records required accept/reject outcomes with the plan decode options", () => {
    expect(provenance.decoder).toMatchObject({ package: "jpeg-js", version: "0.4.4" });
    expect(provenance.decoder.options).toEqual(PLAN_DECODE_OPTIONS);
    expect(decoderProof.decoder.options).toEqual(PLAN_DECODE_OPTIONS);
    for (const f of provenance.fixtures) {
      const proof = proofOf(f.file);
      if (f.decoderRequired !== "record") expect(proof.observed, f.file).toBe(f.decoderRequired);
      if (f.lineage === "handcrafted" && f.decoderRequired === "accept") expect(proof.allRgb128, f.file).toBe(true);
    }
    for (const name of ["hc-sof1-32x16.jpg", RESTART, MULTISCAN, SHARP_BASE, SHARP_PROG]) {
      expect(record(name).decoderRequired, name).toBe("accept");
      expect(proofOf(name).observed, name).toBe("accept");
    }
    for (const name of ["scan-bit-flip.jpg", "trunc-scan-eoi.jpg"]) {
      expect(record(name).decoderRequired, name).toBe("reject");
      expect(proofOf(name).observed, name).toBe("reject");
    }
  });

  it("fixture builder parity: in-test handcrafted builder reproduces checked-in roots byte-for-byte", async () => {
    expect(build({ width: 32, height: 16, comps: comps3(0x22) })).toEqual(await fx(P420));
    expect(build({ width: 32, height: 16, comps: comps3(0x22), app0: false })).toEqual(await fx(NOAPP0));
    expect(build({ width: 17, height: 9, comps: comps3(0x11) })).toEqual(await fx("hc-444-17x9-app0.jpg"));
    expect(build({ width: 17, height: 9, comps: comps3(0x22) })).toEqual(await fx("hc-420-17x9-app0.jpg"));
    expect(build({ width: 32, height: 16, comps: comps3(0x21) })).toEqual(await fx("hc-422h-32x16-app0.jpg"));
    expect(build({ width: 16, height: 32, comps: comps3(0x12) })).toEqual(await fx("hc-422v-16x32-app0.jpg"));
    expect(build({ width: 80, height: 32, comps: comps3(0x22), restartInterval: 1 })).toEqual(await fx(RESTART));
    // 17x9 4:4:4 = 6 MCUs x 3 blocks x 2 bits = 36 bits -> exactly 5 bytes
    // (continuous packing; the defective first draft padded every MCU).
    const scan = segmentsOf(await fx("hc-444-17x9-app0.jpg")).scans[0];
    expect(scan.entropyEnd - scan.entropyOffset).toBe(5);
  });
});

// ==================================================================== A1 ====
describe("A1 baseline subsampling", () => {
  it("A1 sharp baseline 4:2:0 50x34: baseline coding, 2x2 sampling, real pixels match decoder proof", async () => {
    const result = validateJpegTolerantWithPixels(await fx(SHARP_BASE));
    expect(result).toMatchObject({
      width: 50, height: 34, channels: 3, format: "jpeg", mimeType: "image/jpeg",
      validationProfile: "jpeg-ycbcr8-tolerant-v1", coding: "baseline", sampling: "2x2,1x1,1x1", exifOrientation: null,
    });
    expect(result.ignoredSegments).toEqual([]);
    expect(result.pixels.length).toBe(50 * 34 * 3);
    expect(sha(result.pixels)).toBe(proofOf(SHARP_BASE).rgbSha256);
  });

  it("A1 handcrafted 4:2:0 32x16 decodes constant 128", async () => {
    const result = validateJpegTolerantWithPixels(await fx(P420));
    expect(result).toMatchObject({ coding: "baseline", sampling: "2x2,1x1,1x1", exifOrientation: null });
    expect(result.ignoredSegments).toEqual(["APP0"]);
    expectConstant128(result, 32, 16);
  });

  it("A1 horizontal 4:2:2 (Y 2x1) 32x16 decodes constant 128", async () => {
    const result = validateJpegTolerantWithPixels(await fx("hc-422h-32x16-app0.jpg"));
    expect(result).toMatchObject({ coding: "baseline", sampling: "2x1,1x1,1x1" });
    expectConstant128(result, 32, 16);
  });

  it("A1 vertical 4:2:2 (Y 1x2) 16x32 decodes constant 128", async () => {
    const result = validateJpegTolerantWithPixels(await fx("hc-422v-16x32-app0.jpg"));
    expect(result).toMatchObject({ coding: "baseline", sampling: "1x2,1x1,1x1" });
    expectConstant128(result, 16, 32);
  });

  it("A1 odd dimensions 17x9 in 4:2:0 and 4:4:4 decode constant 128", async () => {
    const r420 = validateJpegTolerantWithPixels(await fx("hc-420-17x9-app0.jpg"));
    expect(r420.sampling).toBe("2x2,1x1,1x1");
    expectConstant128(r420, 17, 9);
    const r444 = validateJpegTolerantWithPixels(await fx("hc-444-17x9-app0.jpg"));
    expect(r444.sampling).toBe("1x1,1x1,1x1");
    expectConstant128(r444, 17, 9);
  });

  it("A1 4:4:4 baseline with APP0 reports 1x1 sampling and the APP0 segment", async () => {
    const result = validateJpegTolerantWithPixels(await fx("hc-444-16x8-app0.jpg"));
    expect(result).toMatchObject({ coding: "baseline", sampling: "1x1,1x1,1x1", validationProfile: "jpeg-ycbcr8-tolerant-v1" });
    expect(result.ignoredSegments).toEqual(["APP0"]);
    expectConstant128(result, 16, 8);
  });
});

// ============================================================== A2/SOF1 ====
describe("A2 progressive and SOF1 extended", () => {
  it("A2 sharp progressive 4:2:0 with inter-scan DHT redefinition and EOBRUN decodes real pixels", async () => {
    const proof = record(SHARP_PROG).sharpProof!;
    expect(proof.scanCount).toBeGreaterThan(1);
    expect(proof.dhtAfterFirstSos).toBeGreaterThan(0);
    expect(proof.eobrunSymbols.length).toBeGreaterThan(0);
    const result = validateJpegTolerantWithPixels(await fx(SHARP_PROG));
    expect(result).toMatchObject({ width: 50, height: 34, coding: "progressive", sampling: "2x2,1x1,1x1", exifOrientation: null });
    expect(result.ignoredSegments).toEqual([]);
    expect(result.pixels.length).toBe(50 * 34 * 3);
    expect(sha(result.pixels)).toBe(proofOf(SHARP_PROG).rgbSha256);
  });

  it("scan-cap accepts total SOS=64 as progressive", async () => {
    const record = scanCapProvenance.records.find((entry) => entry.totalScanCount === 64)!;
    const bytes = await fx(record.file);
    expect(record).toMatchObject({ baseScanCount: 10, addedScanCount: 54, totalScanCount: 64 });
    expect(sha(bytes)).toBe(record.sha256);
    expect(segmentsOf(bytes).scans).toHaveLength(64);
    const result = validateJpegTolerant(bytes);
    expect(result.coding).toBe("progressive");
    expect(record.expected).toBe("accept");
    expect(errorCode(() => validateJpeg(bytes))).toBe("unsupported_jpeg_profile");
  });

  it("scan-cap rejects total SOS=65 before decoder", async () => {
    const record = scanCapProvenance.records.find((entry) => entry.totalScanCount === 65)!;
    const bytes = await fx(record.file);
    expect(record).toMatchObject({ baseScanCount: 10, addedScanCount: 55, totalScanCount: 65 });
    expect(sha(bytes)).toBe(record.sha256);
    expect(segmentsOf(bytes).scans).toHaveLength(65);
    const decode = vi.spyOn(jpeg, "decode");
    expect(errorCode(() => validateJpegTolerant(bytes))).toBe("jpeg_resource_limit");
    expect(decode).not.toHaveBeenCalled();
    expect(errorCode(() => validateJpeg(bytes))).toBe("unsupported_jpeg_profile");
  });

  it("SOF1 extended sequential mutation decodes through real jpeg-js with coding extended", async () => {
    const rec = record("hc-sof1-32x16.jpg");
    const parent = await fx(P420);
    expect(rec.parent).toBe(P420);
    expect(rec.parentSha256).toBe(record(P420).sha256);
    expect(rec.mutations).toEqual([{ op: "replace", offset: firstSegment(parent, 0xc0).offset + 1, old: "c0", new: "c1" }]);
    const result = validateJpegTolerantWithPixels(await fx("hc-sof1-32x16.jpg"));
    expect(result).toMatchObject({ coding: "extended", sampling: "2x2,1x1,1x1" });
    expectConstant128(result, 32, 16);
  });
});

// ==================================================================== A3 ====
describe("A3 restart intervals", () => {
  it("A3 DRI=1 4:2:0 restart markers D0..D7 wrap across 10 MCUs; real pixels are constant 128", async () => {
    const bytes = await fx(RESTART);
    expect(segmentsOf(bytes).scans[0].rst).toEqual(WRAP10);
    const result = validateJpegTolerantWithPixels(bytes);
    expect(result).toMatchObject({ coding: "baseline", sampling: "2x2,1x1,1x1" });
    expectConstant128(result, 80, 32);
  });

  it("A3 restart numbering resets to D0 in every non-interleaved scan", async () => {
    const bytes = await fx(MULTISCAN);
    const { scans } = segmentsOf(bytes);
    expect(scans.map((s) => s.rst)).toEqual([WRAP10, WRAP10, WRAP10]);
    const result = validateJpegTolerantWithPixels(bytes);
    expect(result).toMatchObject({ coding: "baseline", sampling: "1x1,1x1,1x1" });
    expectConstant128(result, 40, 16);
  });
});

// ================================================================= A4/A6 ====
describe("A4/A6 EXIF orientation", () => {
  it("A4 APP1 EXIF II orientation 6 without APP0 is reported without rotating pixels", async () => {
    const result = validateJpegTolerantWithPixels(await fx("exif-ii-orient6.jpg"));
    expect(result.exifOrientation).toBe(6);
    expect(result.ignoredSegments).toEqual(["APP1"]);
    expectConstant128(result, 32, 16);
  });

  it("A4 APP1 EXIF MM orientation 6 is reported", async () => {
    const result = validateJpegTolerant(await fx("exif-mm-orient6.jpg"));
    expect(result).toMatchObject({ width: 32, height: 16, exifOrientation: 6 });
    expect(result.ignoredSegments).toEqual(["APP1"]);
  });

  it.each([
    "exif-bad-byteorder.jpg", "exif-bad-magic.jpg", "exif-value0.jpg", "exif-value9.jpg",
    "exif-type-long.jpg", "exif-count2.jpg", "exif-truncated-entry.jpg", "exif-ifd-count-overflow.jpg",
  ])("A6 malformed EXIF %s yields null orientation and still decodes", async (name) => {
    const result = validateJpegTolerantWithPixels(await fx(name));
    expect(result.exifOrientation).toBeNull();
    expect(result.ignoredSegments).toEqual(["APP1"]);
    expectConstant128(result, 32, 16);
  });

  it("A6 IFD offset outside the APP1 is not read from the following segment", async () => {
    const result = validateJpegTolerantWithPixels(await fx("exif-ifd-outside-app1.jpg"));
    expect(result.exifOrientation).toBeNull();
    expect(result.ignoredSegments).toEqual(["APP1", "APP2"]);
    expectConstant128(result, 32, 16);
  });

  it("EXIF first valid orientation wins across multiple APP1 segments", async () => {
    const result = validateJpegTolerant(await fx("exif-first-valid-wins.jpg"));
    expect(result).toMatchObject({ width: 32, height: 16, exifOrientation: 3 });
    expect(result.ignoredSegments).toEqual(["APP1"]);
  });
});

// ================================================================= A5/A8 ====
const REPEAT_ORDER = ["COM", "APP15", "APP1", "APP3", "APP2", "APP14", "APP4", "APP5", "APP6", "APP7", "APP8", "APP9", "APP10", "APP11", "APP12", "APP13"];
describe("A5/A8 metadata segments", () => {
  it("A5 APP2 ICC, APP13 and COM are listed in first-seen order without colour management", async () => {
    const result = validateJpegTolerantWithPixels(await fx("metadata-mixed.jpg"));
    expect(result.ignoredSegments).toEqual(["APP1", "APP2", "APP13", "COM", "APP14"]);
    expect(result.exifOrientation).toBe(6);
    expectConstant128(result, 32, 16);
  });

  it("A8 repeated APP1-APP15/COM recorded once each in first-seen order (no APP0)", async () => {
    const result = validateJpegTolerantWithPixels(await fx("repeats-no-app0.jpg"));
    expect(result.ignoredSegments).toEqual(REPEAT_ORDER);
    expect(result.exifOrientation).toBe(3);
    expectConstant128(result, 32, 16);
  });

  it("A8 APP0 case: canonical JFIF APP0 is listed first and repeats are deduplicated", async () => {
    const result = validateJpegTolerantWithPixels(await fx("repeats-with-app0.jpg"));
    expect(result.ignoredSegments).toEqual(["APP0", ...REPEAT_ORDER]);
    expect(result.exifOrientation).toBe(3);
    expectConstant128(result, 32, 16);
  });

  it("APP14 Adobe transform1 is accepted and listed", async () => {
    const result = validateJpegTolerantWithPixels(await fx("adobe-transform1.jpg"));
    expect(result.ignoredSegments).toEqual(["APP14"]);
    expectConstant128(result, 32, 16);
  });

  it("APP0 present but not canonical JFIF is unsupported", () => {
    const code = errorCode(() => validateJpegTolerant(Buffer.from(fixtureBytes("app0-invalid.jpg"))));
    expect(code).toBe("unsupported_jpeg_profile");
  });
});

// ================================================================= R1/R2 ====
describe("R1/R2 unsupported profiles", () => {
  it.each([
    "unsup-precision12.jpg", "unsup-sof3-lossless.jpg", "unsup-sof9-arithmetic.jpg", "unsup-grayscale-16x8.jpg",
    "unsup-cmyk-adobe0-16x8.jpg", "unsup-y41-32x8.jpg", "unsup-chroma-21-32x16.jpg", "unsup-ids-012-16x8.jpg", "unsup-dqt16-16x8.jpg",
  ])("R1 %s -> unsupported_jpeg_profile", async (name) => {
    expect(errorCode(() => validateJpegTolerant(Buffer.from(fixtureBytes(name))))).toBe("unsupported_jpeg_profile");
  });

  it.each(["adobe-transform0.jpg", "adobe-transform2.jpg", "adobe-short.jpg"])("R2 %s -> unsupported_jpeg_profile", (name) => {
    expect(errorCode(() => validateJpegTolerant(Buffer.from(fixtureBytes(name))))).toBe("unsupported_jpeg_profile");
  });

  it.each<[string, readonly number[]]>([
    ["empty payload", []],
    ["truncated signature 'Ado'", [0x41, 0x64, 0x6f]],
    ["12-byte non-Adobe payload", [0x4e, 0x6f, 0x74, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x00, 0x01, 0x02, 0x03]],
  ])("R2 APP14 %s inserted after SOI of no-APP0 fixture -> unsupported_jpeg_profile", async (_label, payload) => {
    const parent = await fx(NOAPP0);
    const bytes = splice(parent, 2, 0, seg(0xee, payload));
    expect(errorCode(() => validateJpegTolerant(bytes))).toBe("unsupported_jpeg_profile");
  });
});

// ==================================================================== R3 ====
describe("R3 malformed structure and scans", () => {
  it.each([
    ["trunc-scan-eoi.jpg", "truncated scan followed by EOI (decoder-rejected)"],
    ["scan-bit-flip.jpg", "verified scan bit flip at the pinned offset/bit (decoder-rejected)"],
    ["trailing-after-eoi.jpg", "bytes after EOI"],
    ["missing-eoi.jpg", "missing EOI"],
    ["rst-wrong-order.jpg", "RST out of order D0->D5 (enforced by our parser)"],
    ["rst-scan-continued.jpg", "RST numbering continued across scans instead of restarting at D0"],
    ["rst-without-dri.jpg", "RST without DRI"],
    ["rst-dri-zero.jpg", "RST under DRI interval 0"],
    ["rst-outside-scan.jpg", "RST outside entropy-coded data"],
    ["dri-bad-length.jpg", "DRI payload length other than 2"],
  ])("R3 %s -> malformed_jpeg (%s)", (name) => {
    expect(errorCode(() => validateJpegTolerant(Buffer.from(fixtureBytes(name))))).toBe("malformed_jpeg");
  });

  it("R3 decoder failure maps to malformed_jpeg without leaking the decoder message", () => {
    let caught: unknown = null;
    try { validateJpegTolerant(Buffer.from(fixtureBytes("scan-bit-flip.jpg"))); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(JpegValidationError);
    expect((caught as JpegValidationError).code).toBe("malformed_jpeg");
    expect((caught as Error).message).not.toMatch(/huffman|marker|jpeg-js|offset/i);
  });

  it("scan FF fill bytes before EOI are accepted", () => {
    const result = validateJpegTolerantWithPixels(Buffer.from(fixtureBytes("fill-before-eoi.jpg")));
    expectConstant128(result, 32, 16);
  });
});

// ==================================================================== R4 ====
describe("R4 no occurrence cap", () => {
  it("R4 no occurrence cap: 2000 empty COM and 2000 empty APP3 segments are accepted and listed once each", async () => {
    const parent = await fx(NOAPP0);
    const com = Buffer.from([0xff, 0xfe, 0x00, 0x02]);
    const app3 = Buffer.from([0xff, 0xe3, 0x00, 0x02]);
    const many = Buffer.concat([...new Array<Buffer>(2000).fill(com), ...new Array<Buffer>(2000).fill(app3)]);
    const result = validateJpegTolerantWithPixels(splice(parent, 2, 0, many));
    expect(result.ignoredSegments).toEqual(["COM", "APP3"]);
    expectConstant128(result, 32, 16);
  });
});

// ==================================================================== R5 ====
// Literal, hand-calculated totals (plan 3.4 / jpeg-js 0.4.4 allocations):
//  17x9 4:4:4, 1 DQT + 2 one-symbol DHT: 918 + 3*(1536+384) + 290 = 6968
//  17x9 4:2:0, same tables: 918 + (2048+384) + 2*(512+128) + 290 = 4920
//  4096x3120 4:4:4: 6WH 76677120 + 3*(256+64)*512*390 191692800 = 268369920;
//    + 1 DQT 256 + 3840 one-symbol DHT definitions * 17 = 65280 -> 268435456.
//    Replacing ONE unused DC3 one-symbol definition by a 2-symbol definition
//    (two length-2 codes, values 0,1) costs 18 instead of 17 -> 268435457.
//  4095x3119 4:4:4: 76633830 + 191692800 = 268326630; + 256 + 6385*17 (108545)
//    + one 9-symbol AC2 definition (25) = 268435456; 10-symbol -> +1.
//  4096x3120 with two pre-SOF DQT id0 definitions: 268369920 + 512 + 3823*17
//    (64991) + one 17-symbol AC2 (33) = 268435456; 3825 one-symbol -> +1.
const UNUSED: Array<[0 | 1, number]> = [[0, 1], [0, 2], [0, 3], [1, 1], [1, 2], [1, 3]];
function accountingDefs(total: number, overrides: Record<number, DhtDef> = {}): DhtDef[] {
  const defs: DhtDef[] = [];
  for (let i = 0; i < total; i++) {
    const override = overrides[i];
    if (override) defs.push(override);
    else if (i === 0) defs.push(one(0, 0));
    else if (i === 1) defs.push(one(1, 0));
    else { const [cls, id] = UNUSED[(i - 2) % UNUSED.length]; defs.push(one(cls, id)); }
  }
  return defs;
}
function dhtSegmentsFor(defs: DhtDef[]): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < defs.length; i += 2000) out.push(dht(defs.slice(i, i + 2000)));
  return out;
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const TWO_SYMBOL_DC3: DhtDef = { cls: 0, id: 3, counts: counts(2, 2), values: [0, 1] };
const NINE_SYMBOL_AC2: DhtDef = { cls: 1, id: 2, counts: counts(4, 9), values: range(0, 8) };
const TEN_SYMBOL_AC2: DhtDef = { cls: 1, id: 2, counts: counts(4, 10), values: range(0, 9) };
const SEVENTEEN_SYMBOL_AC2: DhtDef = { cls: 1, id: 2, counts: counts(5, 17), values: [...range(0x00, 0x0a), ...range(0x11, 0x16)] };
function boundaryJpeg(width: number, height: number, defs: DhtDef[], dqtCount = 1): Buffer {
  return build({
    width, height, comps: comps3(0x11),
    dqtSegments: Array.from({ length: dqtCount }, () => dqt([{ id: 0 }])),
    dhtSegments: dhtSegmentsFor(defs),
  });
}
function spyDecodeReturning(width: number, height: number) {
  return vi.spyOn(jpeg, "decode").mockImplementation((() => ({ width, height, data: new Uint8Array(width * height * 3) })) as never);
}

describe("R5 exact decoder accounting", () => {
  it("R5 oracle: hand-calculated 6968 equals jpeg-js 0.4.4 accounting for hc-444-17x9 (guard)", async () => {
    const bytes = await fx("hc-444-17x9-app0.jpg");
    expect(() => jpeg.decode(bytes, { ...PLAN_DECODE_OPTIONS, maxMemoryUsageInMB: 6968 / 1048576 })).not.toThrow();
    expect(() => jpeg.decode(bytes, { ...PLAN_DECODE_OPTIONS, maxMemoryUsageInMB: 6967 / 1048576 })).toThrow(/maxMemoryUsageInMB/);
  });

  it("R5 oracle: hand-calculated 4920 equals jpeg-js 0.4.4 accounting for hc-420-17x9 (guard)", async () => {
    const bytes = await fx("hc-420-17x9-app0.jpg");
    expect(() => jpeg.decode(bytes, { ...PLAN_DECODE_OPTIONS, maxMemoryUsageInMB: 4920 / 1048576 })).not.toThrow();
    expect(() => jpeg.decode(bytes, { ...PLAN_DECODE_OPTIONS, maxMemoryUsageInMB: 4919 / 1048576 })).toThrow(/maxMemoryUsageInMB/);
  });

  it("R5 4096x3120 4:4:4 at exactly 268435456 accounted bytes is accepted and decoded once (decoder spy)", () => {
    const bytes = boundaryJpeg(4096, 3120, accountingDefs(3840));
    const decode = spyDecodeReturning(4096, 3120);
    const result = validateJpegTolerant(bytes);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ width: 4096, height: 3120, coding: "baseline", sampling: "1x1,1x1,1x1" });
  }, 60_000);

  it("R5 4096x3120 +1 via one unused DC3 two-symbol definition is rejected before decode", () => {
    const bytes = boundaryJpeg(4096, 3120, accountingDefs(3840, { 4: TWO_SYMBOL_DC3 }));
    const decode = spyDecodeReturning(4096, 3120);
    expect(errorCode(() => validateJpegTolerant(bytes))).toBe("jpeg_resource_limit");
    expect(decode).not.toHaveBeenCalled();
  }, 60_000);

  it("R5 4095x3119 non-multiple-of-8 dimensions at exactly 268435456 are accepted (decoder spy)", () => {
    const bytes = boundaryJpeg(4095, 3119, accountingDefs(6386, { 6: NINE_SYMBOL_AC2 }));
    const decode = spyDecodeReturning(4095, 3119);
    const result = validateJpegTolerant(bytes);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ width: 4095, height: 3119 });
  }, 60_000);

  it("R5 4095x3119 +1 via a ten-symbol unused AC2 definition is rejected before decode", () => {
    const bytes = boundaryJpeg(4095, 3119, accountingDefs(6386, { 6: TEN_SYMBOL_AC2 }));
    const decode = spyDecodeReturning(4095, 3119);
    expect(errorCode(() => validateJpegTolerant(bytes))).toBe("jpeg_resource_limit");
    expect(decode).not.toHaveBeenCalled();
  }, 60_000);

  it("R5 DQT definitions are cumulative: two pre-SOF id0 definitions at exactly 268435456 are accepted", () => {
    const bytes = boundaryJpeg(4096, 3120, accountingDefs(3824, { 6: SEVENTEEN_SYMBOL_AC2 }), 2);
    const decode = spyDecodeReturning(4096, 3120);
    const result = validateJpegTolerant(bytes);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ width: 4096, height: 3120 });
  }, 60_000);

  it("R5 DQT definitions are cumulative: two pre-SOF id0 definitions +1 are rejected before decode", () => {
    const bytes = boundaryJpeg(4096, 3120, accountingDefs(3825), 2);
    const decode = spyDecodeReturning(4096, 3120);
    expect(errorCode(() => validateJpegTolerant(bytes))).toBe("jpeg_resource_limit");
    expect(decode).not.toHaveBeenCalled();
  }, 60_000);
});

// ==================================================================== R6 ====
describe("R6 strict behaviour unchanged", () => {
  it.each([
    [SHARP_BASE, "unsupported_jpeg_profile"],
    [SHARP_PROG, "unsupported_jpeg_profile"],
    [P420, "unsupported_jpeg_profile"],
    ["hc-422h-32x16-app0.jpg", "unsupported_jpeg_profile"],
    ["hc-422v-16x32-app0.jpg", "unsupported_jpeg_profile"],
    [RESTART, "unsupported_jpeg_profile"],
    [MULTISCAN, "unsupported_jpeg_profile"],
    ["hc-sof1-32x16.jpg", "unsupported_jpeg_profile"],
    ["exif-ii-orient6.jpg", "unsupported_jpeg_profile"],
    ["metadata-mixed.jpg", "unsupported_jpeg_profile"],
    ["hc-tables-id23-16x8-app0.jpg", "malformed_jpeg"],
    ["hc-dqt-presof-redefine.jpg", "malformed_jpeg"],
  ])("R6 strict validateJpeg still rejects %s with %s (guard)", (name, code) => {
    expect(errorCode(() => validateJpeg(Buffer.from(fixtureBytes(name))))).toBe(code);
  });

  it("R6 strict-supported 4:4:4 handcrafted fixture remains strict-accepted with the strict profile (guard)", () => {
    expect(validateJpeg(Buffer.from(fixtureBytes("hc-444-16x8-app0.jpg")))).toEqual({
      width: 16, height: 8, channels: 3, format: "jpeg", mimeType: "image/jpeg", validationProfile: "jpeg-ycbcr8-baseline-444-v1",
    });
  });

  it("R6 tolerant validation of a strict-supported file returns the tolerant profile with real metadata", () => {
    const result = validateJpegTolerant(Buffer.from(fixtureBytes("hc-444-16x8-app0.jpg")));
    expect(result).toEqual({
      width: 16, height: 8, channels: 3, format: "jpeg", mimeType: "image/jpeg", validationProfile: "jpeg-ycbcr8-tolerant-v1",
      coding: "baseline", sampling: "1x1,1x1,1x1", ignoredSegments: ["APP0"], exifOrientation: null,
    });
  });
});

// ========================================================== decode path ====
describe("decode path", () => {
  it("decode: metadata-only validation performs exactly one real jpeg-js decode with the plan options and returns no pixels", () => {
    const decode = vi.spyOn(jpeg, "decode");
    const metadata = validateJpegTolerant(Buffer.from(fixtureBytes(P420)));
    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode.mock.calls[0]?.[1]).toEqual(PLAN_DECODE_OPTIONS);
    expect(metadata).not.toHaveProperty("pixels");
    expect(metadata.width).toBe(32);
  });

  it("decode: both wrappers return identical metadata; with-pixels adds width*height*3 RGB bytes", () => {
    const bytes = Buffer.from(fixtureBytes("hc-422h-32x16-app0.jpg"));
    const metadata = validateJpegTolerant(bytes);
    const { pixels, ...rest } = validateJpegTolerantWithPixels(bytes);
    expect(rest).toEqual(metadata);
    expect(metadata.width * metadata.height).toBe(512);
    expect(pixels.length).toBe(32 * 16 * 3);
  });
});

// ========================================================== table state ====
describe("table state", () => {
  it("tables: DQT/DHT ids 2 and 3 are accepted and referenced", () => {
    const result = validateJpegTolerantWithPixels(Buffer.from(fixtureBytes("hc-tables-id23-16x8-app0.jpg")));
    expect(result.sampling).toBe("1x1,1x1,1x1");
    expectConstant128(result, 16, 8);
  });

  it("tables: pre-SOF DQT redefinition is accepted", () => {
    expectConstant128(validateJpegTolerantWithPixels(Buffer.from(fixtureBytes("hc-dqt-presof-redefine.jpg"))), 16, 8);
  });

  it("tables: unused post-SOF DQT definition is accepted", () => {
    expectConstant128(validateJpegTolerantWithPixels(Buffer.from(fixtureBytes("hc-dqt-postsof-unused.jpg"))), 16, 8);
  });

  it("tables: post-SOF redefinition of a referenced DQT -> malformed_jpeg", () => {
    expect(errorCode(() => validateJpegTolerant(Buffer.from(fixtureBytes("hc-dqt-postsof-referenced.jpg"))))).toBe("malformed_jpeg");
  });

  it("tables: legal DHT redefinition between baseline scans is accepted", () => {
    const result = validateJpegTolerantWithPixels(Buffer.from(fixtureBytes("hc-dht-between-scans-444-16x16.jpg")));
    expect(result.coding).toBe("baseline");
    expectConstant128(result, 16, 16);
  });

  it("tables: SOS referencing an undefined DHT -> malformed_jpeg", () => {
    expect(errorCode(() => validateJpegTolerant(Buffer.from(fixtureBytes("hc-dht-undefined-ref.jpg"))))).toBe("malformed_jpeg");
  });

  it("tables: SOF referencing an undefined DQT -> malformed_jpeg", () => {
    const comps = comps3(0x11);
    comps[2] = { ...comps[2], tq: 1 };
    expect(errorCode(() => validateJpegTolerant(build({ width: 16, height: 8, comps })))).toBe("malformed_jpeg");
  });

  it.each<[string, Buffer]>([
    ["DQT id 4", seg(0xdb, [0x04, ...new Array<number>(64).fill(1)])],
    ["DQT zero entry", seg(0xdb, [0x01, 0, ...new Array<number>(63).fill(1)])],
    ["DQT truncated table", seg(0xdb, [0x01, ...new Array<number>(63).fill(1)])],
    ["DQT empty payload", seg(0xdb, [])],
    ["DHT oversubscribed at length 1", seg(0xc4, [0x01, ...counts(1, 3), 0, 1, 2])],
    ["DHT oversubscribed at length 2", seg(0xc4, [0x01, 1, 3, ...new Array<number>(14).fill(0), 0, 1, 2, 3])],
    ["DHT class 2", seg(0xc4, [0x21, ...counts(1, 1), 0])],
    ["DHT id 4", seg(0xc4, [0x04, ...counts(1, 1), 0])],
    ["DHT values beyond payload", seg(0xc4, [0x01, ...counts(2, 5), 0, 1])],
    ["DHT empty payload", seg(0xc4, [])],
  ])("tables: %s -> malformed_jpeg", (_name, segment) => {
    expect(errorCode(() => validateJpegTolerant(build({ width: 32, height: 16, comps: comps3(0x22), pre: [segment] })))).toBe("malformed_jpeg");
  });
});

// ================================================= SOF/SOS/segment bounds ====
type Mutator = (base: Buffer) => Buffer;
const sofOf = (b: Buffer) => firstSegment(b, 0xc0);
const sosOf = (b: Buffer) => firstSegment(b, 0xda);
const withSos = (payload: number[]): Mutator => (b) => replaceSegment(b, sosOf(b), seg(0xda, payload));
const withDims = (width: number, height: number): Mutator => (b) =>
  splice(b, sofOf(b).payloadOffset + 1, 4, [height >> 8, height & 255, width >> 8, width & 255]);

describe("SOF/SOS/segment bounds", () => {
  it.each<[string, Mutator]>([
    ["duplicate SOI", (b) => splice(b, 2, 0, [0xff, 0xd8])],
    ["duplicate SOF", (b) => { const s = sofOf(b); return splice(b, s.offset + s.total, 0, b.subarray(s.offset, s.offset + s.total)); }],
    ["segment length below 2", (b) => splice(b, 2, 0, [0xff, 0xfe, 0x00, 0x01])],
    ["segment length past end of file", (b) => splice(b, 2, 0, [0xff, 0xfe, 0xff, 0xff, 0x41])],
    ["SOS without preceding SOF", (b) => { const s = sofOf(b); return splice(b, s.offset, s.total); }],
    ["no SOS before EOI", (b) => { const s = sosOf(b); return splice(b, s.offset, b.length - 2 - s.offset); }],
    ["SOF payload longer than 6+3*Nf", (b) => replaceSegment(b, sofOf(b), seg(0xc0, [...payloadOf(b, sofOf(b)), 0]))],
    ["SOF payload shorter than 6+3*Nf", (b) => replaceSegment(b, sofOf(b), seg(0xc0, payloadOf(b, sofOf(b)).subarray(0, 14)))],
    ["SOS payload longer than 4+2*Ns", (b) => replaceSegment(b, sosOf(b), seg(0xda, [...payloadOf(b, sosOf(b)), 0]))],
    ["SOS Ns=0", withSos([0, 0, 63, 0])],
    ["SOS Ns=4", withSos([4, 1, 0, 2, 0, 3, 0, 4, 0, 0, 63, 0])],
    ["SOS selects unknown component id 5", withSos([3, 1, 0, 2, 0, 5, 0, 0, 63, 0])],
    ["SOS selects a component twice", withSos([3, 1, 0, 2, 0, 2, 0, 0, 63, 0])],
    ["sequential SOS Se=62", withSos([3, 1, 0, 2, 0, 3, 0, 0, 62, 0])],
    ["sequential SOS Ss=1", withSos([3, 1, 0, 2, 0, 3, 0, 1, 63, 0])],
    ["sequential SOS Ah/Al nonzero", withSos([3, 1, 0, 2, 0, 3, 0, 0, 63, 0x01])],
  ])("bounds: %s -> malformed_jpeg", (_name, mutate) => {
    expect(errorCode(() => validateJpegTolerant(mutate(Buffer.from(fixtureBytes(P420)))))).toBe("malformed_jpeg");
  });

  it.each<[string, Mutator]>([
    ["width 0", withDims(0, 16)],
    ["height 0", withDims(32, 0)],
    ["width 8193", withDims(8193, 16)],
    ["height 8193", withDims(32, 8193)],
    ["4097x4096 above 16777216 pixels", withDims(4097, 4096)],
  ])("bounds: %s -> image_dimensions_exceeded", (_name, mutate) => {
    expect(errorCode(() => validateJpegTolerant(mutate(Buffer.from(fixtureBytes(P420)))))).toBe("image_dimensions_exceeded");
  });

  it("bounds: duplicate SOF component id is unsupported", () => {
    const base = Buffer.from(fixtureBytes("hc-444-16x8-app0.jpg"));
    const s = sofOf(base);
    const mutated = splice(base, s.payloadOffset + 6 + 2 * 3, 1, [2]);
    expect(errorCode(() => validateJpegTolerant(mutated))).toBe("unsupported_jpeg_profile");
  });
});

describe("progressive SOS parameters", () => {
  type Params = { s: Segment; ns: number; tail: number; ss: number; se: number; ah: number; al: number };
  const paramsOf = (b: Buffer): Params[] => segmentsOf(b).segments.filter((s) => s.marker === 0xda).map((s) => {
    const ns = b[s.payloadOffset];
    const tail = s.payloadOffset + 1 + ns * 2;
    return { s, ns, tail, ss: b[tail], se: b[tail + 1], ah: b[tail + 2] >> 4, al: b[tail + 2] & 15 };
  });
  const dcFirst = (b: Buffer) => paramsOf(b).find((p) => p.ss === 0 && p.ah === 0)!;
  const acScan = (b: Buffer) => paramsOf(b).find((p) => p.ns === 1 && p.ss > 0 && p.ss < p.se)!;

  it.each<[string, Mutator]>([
    ["DC scan with Se=1", (b) => splice(b, dcFirst(b).tail + 1, 1, [1])],
    ["AC scan with Ss>Se", (b) => { const p = acScan(b); return splice(b, p.tail, 2, [p.se, p.ss]); }],
    ["AC scan with Se=64", (b) => splice(b, acScan(b).tail + 1, 1, [64])],
    ["AC scan with two components", (b) => {
      const p = acScan(b);
      const table = b[p.s.payloadOffset + 2];
      return replaceSegment(b, p.s, seg(0xda, [2, 1, table, 2, table, p.ss, p.se, (p.ah << 4) | p.al]));
    }],
    ["AC refinement Ah != Al+1", (b) => { const p = acScan(b); return splice(b, p.tail + 2, 1, [((p.al + 2) << 4) | p.al]); }],
    ["AC scan Al=14", (b) => splice(b, acScan(b).tail + 2, 1, [0x0e])],
  ])("progressive: %s -> malformed_jpeg", (_name, mutate) => {
    expect(errorCode(() => validateJpegTolerant(mutate(Buffer.from(fixtureBytes(SHARP_PROG)))))).toBe("malformed_jpeg");
  });
});
