// WBS 6.12c JPEG tolerant fixtures -- attempt 2 generator.
//
// Invocation (from the repository root):
//   node tests/fixtures/jpeg-tolerant/generate-fixtures.mjs --sharp <scratch>/node_modules/sharp/dist/index.mjs
//
// The external sharp path is used only to encode the two sharp roots. It is
// never written to provenance/decoder-proof output. All fixtures are built and
// every required decoder outcome is verified IN MEMORY first; nothing is
// written unless every check passes (exit code 1 otherwise).
//
// Handcrafted bitstream contract (constant 128 image):
// - DQT values all 1; DC table: one code "0" (length 1) -> category 0;
//   AC table: one code "0" (length 1) -> symbol 0x00 (EOB).
// - Every 8x8 block is therefore exactly two 0 bits (DC cat0, AC EOB).
// - Bits are packed CONTINUOUSLY across MCUs. 1-padding is emitted only at the
//   end of the scan or at a real DRI restart-interval boundary. 0xFF data bytes
//   are stuffed with 0x00 (all-zero data never produces 0xFF, but the writer
//   implements stuffing generically).
// - With DRI, predictors reset each interval (all DC diffs are 0 anyway) and
//   RST markers D0..D7 are inserted BETWEEN intervals (not after the last),
//   numbering restarting at D0 in every scan.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import jpeg from "jpeg-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATOR_REL = "tests/fixtures/jpeg-tolerant/generate-fixtures.mjs";
const INVOCATION = `node ${GENERATOR_REL} --sharp <external-scratch>/node_modules/sharp/dist/index.mjs`;
const DECODE_OPTIONS = Object.freeze({
  tolerantDecoding: false, useTArray: true, formatAsRGBA: false,
  maxMemoryUsageInMB: 256, maxResolutionInMP: 16.777216,
});
const EXPECTED_SHARP = { version: "0.35.4", libvips: "8.18.6" };

// ---------------------------------------------------------------- CLI ----
const argv = process.argv.slice(2);
const sharpIndex = argv.indexOf("--sharp");
if (sharpIndex < 0 || !argv[sharpIndex + 1]) {
  console.error("usage: node " + GENERATOR_REL + " --sharp <path to sharp/dist/index.mjs>");
  process.exit(2);
}
const sharpPath = argv[sharpIndex + 1];

// ------------------------------------------------------------ helpers ----
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hex = (bytes) => Buffer.from(bytes).toString("hex");
const latin1 = (text) => Buffer.from(text, "latin1");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); return condition; };

function seg(marker, payload) {
  const body = Buffer.from(payload);
  if (body.length + 2 > 0xffff) throw new Error(`segment too long for marker ${marker.toString(16)}`);
  const n = body.length + 2;
  return Buffer.concat([Buffer.from([0xff, marker, n >> 8, n & 255]), body]);
}

const JFIF_PAYLOAD = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
const APP0_JFIF = seg(0xe0, JFIF_PAYLOAD);

function counts16(lengthIndex, count) {
  const counts = new Array(16).fill(0);
  counts[lengthIndex - 1] = count;
  return counts;
}
const singleSymbol = (cls, id) => ({ cls, id, counts: counts16(1, 1), values: [0] });
function dhtSegment(defs) {
  const parts = [];
  for (const def of defs) {
    const total = def.counts.reduce((a, b) => a + b, 0);
    if (total !== def.values.length) throw new Error("DHT definition count/value mismatch");
    parts.push(Buffer.from([(def.cls << 4) | def.id, ...def.counts, ...def.values]));
  }
  return seg(0xc4, Buffer.concat(parts));
}
function dqtSegment(defs) {
  const parts = [];
  for (const def of defs) {
    if (def.precision16) {
      const table = [];
      for (let i = 0; i < 64; i++) table.push(0x00, def.value ?? 1);
      parts.push(Buffer.from([0x10 | def.id, ...table]));
    } else {
      parts.push(Buffer.from([def.id, ...new Array(64).fill(def.value ?? 1)]));
    }
  }
  return seg(0xdb, Buffer.concat(parts));
}

class BitWriter {
  constructor() { this.bytes = []; this.acc = 0; this.n = 0; this.totalDataBits = 0; this.padBits = 0; }
  bit(value, isPad = false) {
    this.acc = (this.acc << 1) | value;
    this.n++;
    if (isPad) this.padBits++; else this.totalDataBits++;
    if (this.n === 8) {
      const byte = this.acc & 255;
      this.bytes.push(byte);
      if (byte === 0xff) this.bytes.push(0x00);
      this.acc = 0;
      this.n = 0;
    }
  }
  flushOnes() { while (this.n !== 0) this.bit(1, true); }
  marker(code) {
    if (this.n !== 0) throw new Error("marker emitted at non byte boundary");
    this.bytes.push(0xff, code);
  }
}

// Encodes `units` MCUs of `blocksPerUnit` zero blocks, continuously packed.
function encodeUnits(units, blocksPerUnit, restartInterval) {
  const writer = new BitWriter();
  const rst = [];
  for (let unit = 0; unit < units; unit++) {
    if (restartInterval && unit > 0 && unit % restartInterval === 0) {
      writer.flushOnes();
      const code = 0xd0 + (rst.length % 8);
      writer.marker(code);
      rst.push(code);
    }
    for (let block = 0; block < blocksPerUnit; block++) { writer.bit(0); writer.bit(0); }
  }
  writer.flushOnes();
  return { bytes: Buffer.from(writer.bytes), rst, dataBits: writer.totalDataBits, padBits: writer.padBits, units };
}

const comps3 = (yHv, overrides = {}) => [
  { id: 1, hv: yHv, tq: 0, td: 0, ta: 0, ...(overrides[0] ?? {}) },
  { id: 2, hv: 0x11, tq: 0, td: 0, ta: 0, ...(overrides[1] ?? {}) },
  { id: 3, hv: 0x11, tq: 0, td: 0, ta: 0, ...(overrides[2] ?? {}) },
];

// Builds a complete handcrafted JPEG. Returns { bytes, scans } where scans
// lists per-scan restart markers and bit statistics.
function handcrafted(spec) {
  const {
    width, height, comps = comps3(0x11), sof = 0xc0, precision = 8, app0 = true,
    pre = [], dqt = [[{ id: 0 }]], postSof = [], dht = [[singleSymbol(0, 0), singleSymbol(1, 0)]],
    restartInterval = 0, layout = "interleaved", scanPrefix = [],
  } = spec;
  const maxH = Math.max(...comps.map((c) => c.hv >> 4));
  const maxV = Math.max(...comps.map((c) => c.hv & 15));
  const sofPayload = [precision, height >> 8, height & 255, width >> 8, width & 255, comps.length];
  for (const c of comps) sofPayload.push(c.id, c.hv, c.tq);
  const parts = [Buffer.from([0xff, 0xd8])];
  if (app0) parts.push(APP0_JFIF);
  parts.push(...pre);
  for (const defs of dqt) parts.push(dqtSegment(defs));
  parts.push(seg(sof, sofPayload));
  parts.push(...postSof);
  for (const defs of dht) parts.push(dhtSegment(defs));
  if (restartInterval) parts.push(seg(0xdd, [restartInterval >> 8, restartInterval & 255]));
  const scans = [];
  if (layout === "interleaved") {
    const units = Math.ceil(width / 8 / maxH) * Math.ceil(height / 8 / maxV);
    const blocksPerUnit = comps.reduce((n, c) => n + (c.hv >> 4) * (c.hv & 15), 0);
    const sos = [comps.length];
    for (const c of comps) sos.push(c.id, (c.td << 4) | c.ta);
    sos.push(0, 63, 0);
    const coded = encodeUnits(units, blocksPerUnit, restartInterval);
    parts.push(seg(0xda, sos), coded.bytes);
    scans.push({ components: comps.map((c) => c.id), units, blocksPerUnit, dataBits: coded.dataBits, padBits: coded.padBits, entropyBytes: coded.bytes.length, rst: coded.rst.map((m) => m.toString(16)) });
  } else {
    comps.forEach((c, index) => {
      parts.push(...(scanPrefix[index] ?? []));
      const h = c.hv >> 4, v = c.hv & 15;
      // jpeg-js 0.4.4 non-interleaved block count (identical to T.81 for 4:4:4).
      const units = Math.ceil(Math.ceil(width / 8) * h / maxH) * Math.ceil(Math.ceil(height / 8) * v / maxV);
      const coded = encodeUnits(units, 1, restartInterval);
      parts.push(seg(0xda, [1, c.id, (c.td << 4) | c.ta, 0, 63, 0]), coded.bytes);
      scans.push({ components: [c.id], units, blocksPerUnit: 1, dataBits: coded.dataBits, padBits: coded.padBits, entropyBytes: coded.bytes.length, rst: coded.rst.map((m) => m.toString(16)) });
    });
  }
  parts.push(Buffer.from([0xff, 0xd9]));
  return { bytes: Buffer.concat(parts), scans };
}

// Marker walker used for offsets and proofs (header + scans, fill-aware).
function walk(bytes) {
  const segments = [];
  const scans = [];
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("no SOI");
  let p = 2;
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) throw new Error(`expected marker at ${p}`);
    while (bytes[p + 1] === 0xff) p++;
    const marker = bytes[p + 1];
    if (marker === 0xd9) { segments.push({ marker, offset: p, total: 2 }); p += 2; break; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) throw new Error(`standalone marker ${marker.toString(16)} in header at ${p}`);
    const length = bytes.readUInt16BE(p + 2);
    const record = { marker, offset: p, total: length + 2, payloadOffset: p + 4, payloadLength: length - 2 };
    segments.push(record);
    p += length + 2;
    if (marker === 0xda) {
      const start = p;
      const rst = [];
      let q = p;
      for (;;) {
        if (q + 1 >= bytes.length) throw new Error("scan without terminating marker");
        if (bytes[q] === 0xff) {
          const next = bytes[q + 1];
          if (next === 0x00) { q += 2; continue; }
          if (next >= 0xd0 && next <= 0xd7) { rst.push({ offset: q, code: next }); q += 2; continue; }
          if (next === 0xff) { q += 1; continue; }
          break;
        }
        q++;
      }
      scans.push({ sosOffset: record.offset, entropyOffset: start, entropyEnd: q, rst, stuffedFF00: countStuffing(bytes.subarray(start, q)) });
      p = q;
    }
  }
  return { segments, scans, end: p };
}
function countStuffing(entropy) {
  let n = 0;
  for (let i = 0; i + 1 < entropy.length; i++) if (entropy[i] === 0xff && entropy[i + 1] === 0x00) n++;
  return n;
}
const findSegment = (bytes, marker, nth = 0) => walk(bytes).segments.filter((s) => s.marker === marker)[nth];
function frameInfo(bytes) {
  try {
    const sof = walk(bytes).segments.find((s) => s.marker >= 0xc0 && s.marker <= 0xcf && s.marker !== 0xc4 && s.marker !== 0xc8 && s.marker !== 0xcc);
    if (!sof) return null;
    const p = sof.payloadOffset;
    const components = [];
    for (let i = 0; i < bytes[p + 5]; i++) {
      const at = p + 6 + i * 3;
      components.push({ id: bytes[at], h: bytes[at + 1] >> 4, v: bytes[at + 1] & 15, tq: bytes[at + 2] });
    }
    return { sofMarker: sof.marker.toString(16), precision: bytes[p], height: bytes.readUInt16BE(p + 1), width: bytes.readUInt16BE(p + 3), components };
  } catch {
    return null;
  }
}
const appNames = (bytes) => walk(bytes).segments.filter((s) => (s.marker >= 0xe0 && s.marker <= 0xef) || s.marker === 0xfe)
  .map((s) => (s.marker === 0xfe ? "COM" : `APP${s.marker - 0xe0}`));

// EXIF / metadata payload builders --------------------------------------
function tiff({ order = "II", magic = 42, ifdOffset = 8, entries = [], entryCount, truncateTo }) {
  const le = order !== "MM";
  const u16 = (v) => (le ? [v & 255, (v >> 8) & 255] : [(v >> 8) & 255, v & 255]);
  const u32 = (v) => (le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255] : [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  const orderBytes = order === "MM" ? [0x4d, 0x4d] : order === "IM" ? [0x49, 0x4d] : [0x49, 0x49];
  const out = [...orderBytes, ...u16(magic), ...u32(ifdOffset)];
  if (ifdOffset === 8) {
    out.push(...u16(entryCount ?? entries.length));
    for (const e of entries) {
      out.push(...u16(e.tag), ...u16(e.type), ...u32(e.count));
      out.push(...(e.type === 4 ? u32(e.value) : [...u16(e.value), 0, 0]));
    }
    out.push(...u32(0));
  }
  const buffer = Buffer.from(out);
  return truncateTo === undefined ? buffer : buffer.subarray(0, truncateTo);
}
const exif = (options) => Buffer.concat([latin1("Exif\0\0"), tiff(options)]);
const orientationEntry = (value, type = 3, count = 1) => ({ tag: 0x0112, type, count, value });
const app1Exif = (options) => seg(0xe1, exif(options));
const adobe = (transform) => seg(0xee, [0x41, 0x64, 0x6f, 0x62, 0x65, 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, transform]);
const ICC_APP2 = seg(0xe2, Buffer.concat([latin1("ICC_PROFILE\0"), Buffer.from([1, 1]), latin1("SYNTHETIC-ICC-MARKER-NOT-A-PROFILE")]));
const APP13 = seg(0xed, latin1("Photoshop 3.0\0SYNTHETIC"));
const COM = seg(0xfe, latin1("synthetic tolerant fixture comment"));
const appN = (n) => seg(0xe0 + n, latin1(`SYNTHETIC-APP${n}`));

// --------------------------------------------------------- registry ----
const fixtures = new Map();
function addRoot(file, bytes, method, purpose, decoderRequired, extra = {}) {
  if (fixtures.has(file)) throw new Error(`duplicate fixture ${file}`);
  const lineage = extra.sharp ? "sharp" : "handcrafted";
  fixtures.set(file, { bytes, record: { file, kind: "root", lineage, parent: null, parentSha256: null, mutations: [], method, purpose, decoderRequired, ...extra } });
}
// ops apply sequentially; each offset is in the coordinates of the buffer
// produced by the previous op. replace: old.length === new.length.
function addMutation(file, parent, ops, method, purpose, decoderRequired, extra = {}) {
  const base = fixtures.get(parent);
  if (!base) throw new Error(`unknown parent ${parent}`);
  let current = Buffer.from(base.bytes);
  const mutations = [];
  for (const op of ops) {
    if (op.op === "replace") {
      const next = Buffer.from(op.bytes);
      const old = current.subarray(op.offset, op.offset + next.length);
      mutations.push({ op: "replace", offset: op.offset, old: hex(old), new: hex(next) });
      current = Buffer.concat([current.subarray(0, op.offset), next, current.subarray(op.offset + next.length)]);
    } else if (op.op === "insert") {
      const next = Buffer.from(op.bytes);
      mutations.push({ op: "insert", offset: op.offset, old: "", new: hex(next) });
      current = Buffer.concat([current.subarray(0, op.offset), next, current.subarray(op.offset)]);
    } else if (op.op === "delete") {
      const old = current.subarray(op.offset, op.offset + op.length);
      mutations.push({ op: "delete", offset: op.offset, old: hex(old), new: "" });
      current = Buffer.concat([current.subarray(0, op.offset), current.subarray(op.offset + op.length)]);
    } else throw new Error(`unknown op ${op.op}`);
  }
  fixtures.set(file, { bytes: current, record: { file, kind: "mutation", lineage: base.record.lineage, parent, parentSha256: sha256(base.bytes), mutations, method, purpose, decoderRequired, ...extra } });
}
const HC = "handcrafted constant-128 (DQT=1, DC cat0 code '0', AC EOB code '0', continuous 2-bit blocks)";

// ----------------------------------------------------- handcrafted roots ----
const root = (file, spec, purpose, decoderRequired = "accept") => {
  const built = handcrafted(spec);
  addRoot(file, built.bytes, HC, purpose, decoderRequired, { handcrafted: { ...describeSpec(spec), scans: built.scans } });
};
function describeSpec(spec) {
  return {
    width: spec.width, height: spec.height, app0: spec.app0 ?? true, sofMarker: (spec.sof ?? 0xc0).toString(16), precision: spec.precision ?? 8,
    components: (spec.comps ?? comps3(0x11)).map((c) => ({ id: c.id, sampling: `${c.hv >> 4}x${c.hv & 15}`, tq: c.tq, td: c.td, ta: c.ta })),
    restartInterval: spec.restartInterval ?? 0, layout: spec.layout ?? "interleaved",
    dqtSegments: (spec.dqt ?? [[{ id: 0 }]]).map((defs) => defs.map((d) => ({ id: d.id, value: d.value ?? 1, precision: d.precision16 ? 16 : 8 }))),
    headerDhtDefinitions: (spec.dht ?? [[singleSymbol(0, 0), singleSymbol(1, 0)]]).flat().map((d) => ({ class: d.cls ? "AC" : "DC", id: d.id, symbols: d.values.length })),
    postSofSegments: (spec.postSof ?? []).length,
    interScanSegments: (spec.scanPrefix ?? []).map((list) => list.length),
  };
}

root("hc-444-16x8-app0.jpg", { width: 16, height: 8, comps: comps3(0x11) }, "4:4:4 baseline with canonical APP0 (strict-supported control; tolerant 1x1 sampling)");
root("hc-444-17x9-app0.jpg", { width: 17, height: 9, comps: comps3(0x11) }, "odd 4:4:4; 6 MCUs x 6 bits = 36 bits packed continuously into 5 bytes; accounting literal 6968");
root("hc-420-32x16-app0.jpg", { width: 32, height: 16, comps: comps3(0x22) }, "A1 4:2:0 baseline; SOF1/R1/R3 mutation parent");
root("hc-420-32x16-noapp0.jpg", { width: 32, height: 16, comps: comps3(0x22), app0: false }, "4:2:0 without APP0; EXIF/metadata insertion parent");
root("hc-420-17x9-app0.jpg", { width: 17, height: 9, comps: comps3(0x22) }, "odd 4:2:0; accounting literal 4920");
root("hc-422h-32x16-app0.jpg", { width: 32, height: 16, comps: comps3(0x21) }, "A1 horizontal 4:2:2 (Y 2x1)");
root("hc-422v-16x32-app0.jpg", { width: 16, height: 32, comps: comps3(0x12) }, "A1 vertical 4:2:2 (Y 1x2)");
root("hc-restart-420-80x32-app0.jpg", { width: 80, height: 32, comps: comps3(0x22), restartInterval: 1 }, "A3 DRI=1, 10 interleaved MCUs, RST D0..D7,D0 between intervals");
root("hc-restart-multiscan-444-40x16-app0.jpg", { width: 40, height: 16, comps: comps3(0x11), restartInterval: 1, layout: "per-component" }, "A3 three non-interleaved scans, DRI=1, 10 MCUs each, RST numbering restarts at D0 per scan");
root("hc-tables-id23-16x8-app0.jpg", {
  width: 16, height: 8,
  comps: comps3(0x11, { 0: { tq: 2, td: 2, ta: 3 }, 1: { tq: 3, td: 3, ta: 2 }, 2: { tq: 3, td: 3, ta: 2 } }),
  dqt: [[{ id: 2 }, { id: 3 }]],
  dht: [[singleSymbol(0, 2), singleSymbol(1, 3), singleSymbol(0, 3), singleSymbol(1, 2)]],
}, "DQT ids 2/3 and DHT ids 2/3 referenced (strict rejects DHT id>1)");
root("hc-dqt-presof-redefine.jpg", { width: 16, height: 8, dqt: [[{ id: 0, value: 2 }], [{ id: 0, value: 1 }]] }, "DQT id0 redefined before SOF (legal); DQT definition count 2");
root("hc-dqt-postsof-unused.jpg", { width: 16, height: 8, postSof: [dqtSegment([{ id: 1 }])] }, "unused DQT id1 defined after SOF (legal)");
root("hc-dqt-postsof-referenced.jpg", { width: 16, height: 8, postSof: [dqtSegment([{ id: 0, value: 2 }])] }, "referenced DQT id0 redefined after SOF (tolerant must reject)", "record");
root("hc-dht-between-scans-444-16x16.jpg", {
  width: 16, height: 16, layout: "per-component",
  comps: comps3(0x11, { 2: { td: 1, ta: 1 } }),
  scanPrefix: [[], [dhtSegment([singleSymbol(0, 0), singleSymbol(1, 0)])], [dhtSegment([singleSymbol(0, 1), singleSymbol(1, 1)])]],
}, "baseline non-interleaved scans; DC0/AC0 redefined before scan 2; DC1/AC1 first defined before scan 3 and referenced only there");
root("hc-dht-undefined-ref.jpg", { width: 16, height: 8, comps: comps3(0x11, { 2: { ta: 1 } }) }, "SOS references AC table 1 which is never defined (tolerant must reject)", "record");
root("unsup-grayscale-16x8.jpg", { width: 16, height: 8, comps: [{ id: 1, hv: 0x11, tq: 0, td: 0, ta: 0 }] }, "R1 single-component grayscale", "record");
root("unsup-cmyk-adobe0-16x8.jpg", {
  width: 16, height: 8, app0: false, pre: [adobe(0)],
  comps: [1, 2, 3, 4].map((id) => ({ id, hv: 0x11, tq: 0, td: 0, ta: 0 })),
}, "R1 four-component CMYK with Adobe transform 0", "record");
root("unsup-y41-32x8.jpg", { width: 32, height: 8, comps: comps3(0x41) }, "R1 Y sampling 4x1", "record");
root("unsup-chroma-21-32x16.jpg", { width: 32, height: 16, comps: comps3(0x22, { 1: { hv: 0x21 } }) }, "R1 Cb sampling 2x1 (chroma must be 1x1); 7 blocks x 2 bits = 14 bits/MCU continuous", "record");
root("unsup-ids-012-16x8.jpg", { width: 16, height: 8, comps: [0, 1, 2].map((id) => ({ id, hv: 0x11, tq: 0, td: 0, ta: 0 })) }, "R1 component ids 0,1,2 instead of 1,2,3", "record");
root("unsup-dqt16-16x8.jpg", { width: 16, height: 8, dqt: [[{ id: 0, precision16: true }]] }, "R1 16-bit DQT precision", "record");

// ------------------------------------------------------------ sharp roots ----
const SHARP_W = 50, SHARP_H = 34;
const RGB_FORMULA = "R=(3x+2y), G=(2x+4y), B=(2(x+y)+20) for 0<=x<50, 0<=y<34 (no wraparound; all < 256)";
const rgbSource = Buffer.alloc(SHARP_W * SHARP_H * 3);
for (let y = 0; y < SHARP_H; y++) for (let x = 0; x < SHARP_W; x++) {
  const o = (y * SHARP_W + x) * 3;
  rgbSource[o] = 3 * x + 2 * y;
  rgbSource[o + 1] = 2 * x + 4 * y;
  rgbSource[o + 2] = 2 * (x + y) + 20;
}
const SHARP_COMMON = {
  quality: 90, chromaSubsampling: "4:2:0", optimiseCoding: true, trellisQuantisation: false,
  overshootDeringing: false, optimiseScans: false, quantisationTable: 0, mozjpeg: false, force: true,
};
const sharpModule = await import(pathToFileURL(sharpPath).href);
const sharp = sharpModule.default;
const sharpPackage = JSON.parse(await readFile(join(dirname(sharpPath), "..", "package.json"), "utf8"));
const sharpVersions = { version: sharpPackage.version, libvips: sharp.versions?.vips };
check(sharpVersions.version === EXPECTED_SHARP.version, `sharp version ${sharpVersions.version} != ${EXPECTED_SHARP.version}`);
check(sharpVersions.libvips === EXPECTED_SHARP.libvips, `libvips ${sharpVersions.libvips} != ${EXPECTED_SHARP.libvips}`);
for (const [file, progressive] of [["sharp-baseline-420-50x34.jpg", false], ["sharp-progressive-420-50x34.jpg", true]]) {
  const options = { ...SHARP_COMMON, progressive };
  const bytes = await sharp(rgbSource, { raw: { width: SHARP_W, height: SHARP_H, channels: 3 } }).jpeg(options).toBuffer();
  addRoot(file, Buffer.from(bytes), "sharp raw RGB -> jpeg (no withMetadata)", progressive ? "A2 progressive 4:2:0 with inter-scan DHT and EOBRUN" : "A1 encoder-produced baseline 4:2:0", "accept",
    { sharp: { ...sharpVersions, options, width: SHARP_W, height: SHARP_H, rgbFormula: RGB_FORMULA, rgbSourceSha256: sha256(rgbSource) } });
}

// ------------------------------------------------------------- mutations ----
const P420 = "hc-420-32x16-app0.jpg";
const NOAPP0 = "hc-420-32x16-noapp0.jpg";
const sof420 = findSegment(fixtures.get(P420).bytes, 0xc0);
addMutation("hc-sof1-32x16.jpg", P420, [{ op: "replace", offset: sof420.offset + 1, bytes: [0xc1] }], "SOF0 marker C0 -> C1", "D-C3 SOF1 extended sequential; must decode", "accept");
addMutation("unsup-precision12.jpg", P420, [{ op: "replace", offset: sof420.payloadOffset, bytes: [12] }], "SOF precision 8 -> 12", "R1 12-bit precision", "record");
addMutation("unsup-sof3-lossless.jpg", P420, [{ op: "replace", offset: sof420.offset + 1, bytes: [0xc3] }], "SOF0 marker C0 -> C3", "R1 lossless coding", "record");
addMutation("unsup-sof9-arithmetic.jpg", P420, [{ op: "replace", offset: sof420.offset + 1, bytes: [0xc9] }], "SOF0 marker C0 -> C9", "R1 arithmetic coding", "record");

const insertAt2 = (segments) => [{ op: "insert", offset: 2, bytes: Buffer.concat(segments) }];
addMutation("exif-ii-orient6.jpg", NOAPP0, insertAt2([app1Exif({ order: "II", entries: [orientationEntry(6)] })]), "insert APP1 Exif II (little-endian) orientation SHORT count1 inline 6", "A4", "accept");
addMutation("exif-mm-orient6.jpg", NOAPP0, insertAt2([app1Exif({ order: "MM", entries: [orientationEntry(6)] })]), "insert APP1 Exif MM (big-endian) orientation SHORT count1 inline 6", "A4", "accept");
addMutation("metadata-mixed.jpg", NOAPP0, insertAt2([app1Exif({ order: "II", entries: [orientationEntry(6)] }), ICC_APP2, APP13, COM, adobe(1)]), "insert APP1(Exif II 6), APP2 synthetic ICC marker, APP13, COM, APP14 Adobe transform1", "A5", "accept");
addMutation("adobe-transform1.jpg", NOAPP0, insertAt2([adobe(1)]), "insert APP14 Adobe (12-byte payload) transform 1", "APP14 transform1 accepted", "accept");
const adobeTransformOffset = 2 + 4 + 11;
addMutation("adobe-transform0.jpg", "adobe-transform1.jpg", [{ op: "replace", offset: adobeTransformOffset, bytes: [0] }], "Adobe transform 1 -> 0", "R2", "record");
addMutation("adobe-transform2.jpg", "adobe-transform1.jpg", [{ op: "replace", offset: adobeTransformOffset, bytes: [2] }], "Adobe transform 1 -> 2", "R2", "record");
addMutation("adobe-short.jpg", NOAPP0, insertAt2([seg(0xee, [0x41, 0x64, 0x6f, 0x62, 0x65, 0x00, 0x64])]), "insert APP14 'Adobe' with truncated 7-byte payload", "R2 uninterpretable Adobe declaration", "record");

// IFD offset 12 points past the 8-byte TIFF inside APP1 into the next APP2,
// whose payload is a well-formed little-endian IFD declaring orientation 6.
const decoyIfd = Buffer.from([0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
addMutation("exif-ifd-outside-app1.jpg", NOAPP0, insertAt2([app1Exif({ order: "II", ifdOffset: 12 }), seg(0xe2, decoyIfd)]), "APP1 TIFF header only with IFD0 offset 12 (outside APP1); following APP2 holds a decoy IFD with orientation 6", "A6 bounds: must be null", "accept");
const malformedExif = [
  ["exif-bad-byteorder.jpg", { order: "IM", entries: [orientationEntry(6)] }, "byte order 'IM'"],
  ["exif-bad-magic.jpg", { order: "II", magic: 43, entries: [orientationEntry(6)] }, "TIFF magic 43"],
  ["exif-value0.jpg", { order: "II", entries: [orientationEntry(0)] }, "orientation value 0"],
  ["exif-value9.jpg", { order: "II", entries: [orientationEntry(9)] }, "orientation value 9"],
  ["exif-type-long.jpg", { order: "II", entries: [orientationEntry(6, 4)] }, "orientation type LONG(4)"],
  ["exif-count2.jpg", { order: "MM", entries: [orientationEntry(6, 3, 2)] }, "orientation count 2"],
  ["exif-truncated-entry.jpg", { order: "II", entries: [orientationEntry(6)], truncateTo: 16 }, "TIFF cut 6 bytes into the 12-byte entry"],
  ["exif-ifd-count-overflow.jpg", { order: "II", entries: [orientationEntry(6)], entryCount: 0xffff }, "IFD entry count 65535 with one entry present"],
];
for (const [file, options, what] of malformedExif) {
  addMutation(file, NOAPP0, insertAt2([app1Exif(options)]), `insert APP1 Exif with ${what}`, "A6 malformed EXIF -> null orientation", "accept");
}
addMutation("exif-first-valid-wins.jpg", NOAPP0, insertAt2([
  seg(0xe1, latin1("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>")),
  app1Exif({ order: "II", entries: [orientationEntry(9)] }),
  app1Exif({ order: "MM", entries: [{ tag: 0x0100, type: 3, count: 1, value: 32 }, orientationEntry(3)] }),
  app1Exif({ order: "II", entries: [orientationEntry(8)] }),
]), "insert APP1 XMP, APP1 Exif value 9, APP1 Exif MM (ImageWidth then orientation 3), APP1 Exif II orientation 8", "first valid orientation (3) wins", "accept");

const repeats = [COM, appN(15), app1Exif({ order: "II", entries: [orientationEntry(3)] }), appN(3), ICC_APP2, adobe(1),
  appN(4), appN(5), appN(6), appN(7), appN(8), appN(9), appN(10), appN(11), appN(12), APP13,
  app1Exif({ order: "MM", entries: [orientationEntry(8)] }), COM, appN(15), appN(3), adobe(1), ICC_APP2];
addMutation("repeats-no-app0.jpg", NOAPP0, insertAt2(repeats), "insert repeated COM/APP1-APP15 (APP14 Adobe transform1) in fixed order", "A8 without APP0", "accept");
addMutation("repeats-with-app0.jpg", P420, [{ op: "insert", offset: 2 + APP0_JFIF.length, bytes: Buffer.concat(repeats) }], "insert the same repeated segments after canonical APP0", "A8 with APP0", "accept");
addMutation("app0-invalid.jpg", NOAPP0, insertAt2([seg(0xe0, latin1("JFXX\0\x10SYN"))]), "insert APP0 with non-JFIF (JFXX) payload", "APP0 present but not canonical JFIF", "record");

const p422h = fixtures.get("hc-422h-32x16-app0.jpg").bytes;
const scan422h = walk(p422h).scans[0];
check(scan422h.entropyEnd - scan422h.entropyOffset === 4, "hc-422h entropy must be 4 bytes");
addMutation("trunc-scan-eoi.jpg", "hc-422h-32x16-app0.jpg", [{ op: "delete", offset: scan422h.entropyOffset + 1, length: 3 }], "delete last 3 of 4 entropy bytes, EOI kept", "R3 truncated scan + EOI", "reject");
const p420 = fixtures.get(P420).bytes;
const scan420 = walk(p420).scans[0];
addMutation("trailing-after-eoi.jpg", P420, [{ op: "insert", offset: p420.length, bytes: [0x00, 0x11, 0x22, 0x33] }], "append 4 bytes after EOI", "R3 trailing bytes", "record");
addMutation("missing-eoi.jpg", P420, [{ op: "delete", offset: p420.length - 2, length: 2 }], "delete final EOI", "R3 missing EOI", "record");
addMutation("scan-bit-flip.jpg", P420, [{ op: "replace", offset: scan420.entropyOffset, bytes: [p420[scan420.entropyOffset] ^ 0x80] }], "flip bit 7 (mask 0x80) of first entropy byte: first DC Huffman bit becomes '1', which no code in the one-symbol table defines", "R3 decoder-verified scan bit mutation (this offset/bit only; no arbitrary-bit guarantee)", "reject",
  { bitMutation: { offset: scan420.entropyOffset, mask: "0x80" } });
addMutation("fill-before-eoi.jpg", P420, [{ op: "insert", offset: p420.length - 2, bytes: [0xff] }], "insert one 0xFF fill byte before EOI", "scan FF fill accepted", "accept");
const rstoBase = "hc-restart-420-80x32-app0.jpg";
const pr = fixtures.get(rstoBase).bytes;
const prWalk = walk(pr);
const dri = prWalk.segments.find((s) => s.marker === 0xdd);
addMutation("rst-wrong-order.jpg", rstoBase, [{ op: "replace", offset: prWalk.scans[0].rst[0].offset + 1, bytes: [0xd5] }], "first RST D0 -> D5", "R3 RST order (jpeg-js accepts any RSTn)", "record");
addMutation("rst-without-dri.jpg", rstoBase, [{ op: "delete", offset: dri.offset, length: dri.total }], "delete DRI segment", "R3 RST without DRI", "record");
addMutation("rst-dri-zero.jpg", rstoBase, [{ op: "replace", offset: dri.payloadOffset, bytes: [0, 0] }], "DRI interval 1 -> 0", "R3 RST under zero DRI", "record");
addMutation("dri-bad-length.jpg", rstoBase, [{ op: "replace", offset: dri.offset + 2, bytes: [0x00, 0x05] }, { op: "insert", offset: dri.offset + 6, bytes: [0x00] }], "DRI length 4 -> 5 with one extra payload byte", "R3 DRI payload length != 2", "record");
const sos420 = findSegment(p420, 0xda);
addMutation("rst-outside-scan.jpg", P420, [{ op: "insert", offset: sos420.offset, bytes: [0xff, 0xd0] }], "insert RST0 before SOS", "R3 RST outside scan", "record");
const multi = "hc-restart-multiscan-444-40x16-app0.jpg";
const multiWalk = walk(fixtures.get(multi).bytes);
addMutation("rst-scan-continued.jpg", multi, multiWalk.scans[1].rst.map((r, k) => ({ op: "replace", offset: r.offset + 1, bytes: [0xd0 + ((multiWalk.scans[0].rst.length + k) % 8)] })),
  "scan 2 RST markers renumbered to continue scan 1 (D1..D7,D0,D1) instead of restarting at D0", "R3 RST must restart per scan", "record");

// ------------------------------------------------------------ verification ----
const proofs = [];
for (const [file, { bytes, record }] of fixtures) {
  const proof = { file, required: record.decoderRequired };
  try {
    const decoded = jpeg.decode(bytes, DECODE_OPTIONS);
    proof.observed = "accept";
    proof.width = decoded.width;
    proof.height = decoded.height;
    proof.dataLength = decoded.data.length;
    proof.rgbSha256 = sha256(decoded.data);
    proof.allRgb128 = decoded.data.length > 0 && decoded.data.every((v) => v === 128);
  } catch (error) {
    proof.observed = "reject";
    proof.errorClass = error?.constructor?.name ?? "unknown";
    proof.errorMessage = String(error?.message ?? error).slice(0, 120);
  }
  if (record.decoderRequired !== "record") check(proof.observed === record.decoderRequired, `${file}: decoder ${proof.observed}, required ${record.decoderRequired}`);
  if (proof.observed === "accept") {
    const info = frameInfo(bytes);
    if (info && record.decoderRequired === "accept") {
      check(proof.width === info.width && proof.height === info.height && proof.dataLength === info.width * info.height * 3, `${file}: decoded dimensions/length mismatch`);
    }
  }
  if (record.lineage === "handcrafted" && record.decoderRequired === "accept") check(proof.allRgb128 === true, `${file}: handcrafted-lineage positive fixture is not constant 128`);
  proofs.push(proof);
}

// handcrafted structural proofs
const expectRst = (list, expected, label) => check(JSON.stringify(list.map((r) => r.code.toString(16))) === JSON.stringify(expected), `${label}: RST ${list.map((r) => r.code.toString(16))} != ${expected}`);
const wrap10 = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d0"];
expectRst(prWalk.scans[0].rst, wrap10, rstoBase);
check(multiWalk.scans.length === 3, `${multi}: expected 3 scans`);
multiWalk.scans.forEach((s, i) => expectRst(s.rst, wrap10, `${multi} scan ${i + 1}`));
expectRst(walk(fixtures.get("rst-scan-continued.jpg").bytes).scans[1].rst, ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d0", "d1"], "rst-scan-continued scan 2");
const odd444 = walk(fixtures.get("hc-444-17x9-app0.jpg").bytes).scans[0];
check(odd444.entropyEnd - odd444.entropyOffset === 5, "hc-444-17x9: 36 data bits must pack into exactly 5 bytes (continuous, single final pad)");

// sharp proofs
const sharpProof = {};
for (const file of ["sharp-baseline-420-50x34.jpg", "sharp-progressive-420-50x34.jpg"]) {
  const { bytes } = fixtures.get(file);
  const w = walk(bytes);
  const info = frameInfo(bytes);
  const progressive = file.includes("progressive");
  check(info?.sofMarker === (progressive ? "c2" : "c0"), `${file}: SOF ${info?.sofMarker}`);
  check(info?.precision === 8 && info.width === SHARP_W && info.height === SHARP_H, `${file}: frame geometry`);
  check(JSON.stringify(info?.components.map((c) => [c.id, c.h, c.v])) === JSON.stringify([[1, 2, 2], [2, 1, 1], [3, 1, 1]]), `${file}: expected ids 1,2,3 with 2x2,1x1,1x1`);
  const apps = appNames(bytes);
  check(apps.length === 0, `${file}: sharp emitted APPn/COM ${apps}`);
  const firstSos = w.segments.findIndex((s) => s.marker === 0xda);
  const dhtAfterFirstSos = w.segments.slice(firstSos + 1).filter((s) => s.marker === 0xc4).length;
  const acDefs = [];
  for (const s of w.segments.filter((x) => x.marker === 0xc4)) {
    let p = s.payloadOffset;
    const end = s.payloadOffset + s.payloadLength;
    while (p < end) {
      const spec = bytes[p];
      const counts = [...bytes.subarray(p + 1, p + 17)];
      const total = counts.reduce((a, b) => a + b, 0);
      const values = [...bytes.subarray(p + 17, p + 17 + total)];
      if (spec >> 4 === 1) acDefs.push({ id: spec & 15, values });
      p += 17 + total;
    }
  }
  const eobrunSymbols = [...new Set(acDefs.flatMap((d) => d.values.filter((v) => (v & 15) === 0 && (v >> 4) >= 1 && (v >> 4) <= 14)))].sort((a, b) => a - b).map((v) => v.toString(16));
  const sosParams = w.segments.filter((s) => s.marker === 0xda).map((s) => {
    const ns = bytes[s.payloadOffset];
    const tail = s.payloadOffset + 1 + ns * 2;
    return { ns, ss: bytes[tail], se: bytes[tail + 1], ah: bytes[tail + 2] >> 4, al: bytes[tail + 2] & 15 };
  });
  if (progressive) {
    check(w.scans.length >= 2, `${file}: progressive needs >=2 scans`);
    check(dhtAfterFirstSos >= 1, `${file}: no DHT between scans`);
    check(eobrunSymbols.length >= 1, `${file}: no EOBRUN symbol in any AC table`);
    check(sosParams.some((s) => s.ss > 0 && s.ss < s.se && s.ns === 1), `${file}: no AC scan with Ss<Se`);
  }
  const proof = proofs.find((x) => x.file === file);
  let mae = null;
  if (proof.observed === "accept") {
    const decoded = jpeg.decode(bytes, DECODE_OPTIONS).data;
    let sum = 0;
    for (let i = 0; i < decoded.length; i++) sum += Math.abs(decoded[i] - rgbSource[i]);
    mae = sum / decoded.length;
    check(mae < 20, `${file}: decoded mean abs error ${mae} vs source formula too large`);
  }
  sharpProof[file] = { appSegments: apps, scanCount: w.scans.length, dhtSegments: w.segments.filter((s) => s.marker === 0xc4).length, dhtAfterFirstSos, eobrunSymbols, sosParams, stuffedFF00: w.scans.reduce((n, s) => n + s.stuffedFF00, 0), meanAbsErrorVsSource: mae };
}

if (failures.length) {
  console.error("FIXTURE GENERATION FAILED (nothing written):");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

// ----------------------------------------------------------------- write ----
const generatorSource = await readFile(fileURLToPath(import.meta.url), "utf8");
const generatorSha256Lf = sha256(Buffer.from(generatorSource.replace(/\r\n/g, "\n"), "utf8"));
const jpegJsVersion = JSON.parse(await readFile(createRequire(import.meta.url).resolve("jpeg-js/package.json"), "utf8")).version;
const fixtureRecords = [];
for (const [file, { bytes, record }] of fixtures) {
  await writeFile(join(HERE, file), bytes);
  fixtureRecords.push({ ...record, byteLength: bytes.length, sha256: sha256(bytes), frame: frameInfo(bytes), sharpProof: sharpProof[file] });
}
const provenance = {
  schemaVersion: 1,
  attempt: "attempt2",
  generator: { file: GENERATOR_REL, sha256Lf: generatorSha256Lf, invocation: INVOCATION, node: process.version },
  decoder: { package: "jpeg-js", version: jpegJsVersion, options: DECODE_OPTIONS, proofFile: "decoder-proof.json" },
  encoders: {
    handcrafted: { description: HC, bitstream: "continuous packing across MCUs; 1-padding only at scan end or DRI boundary; 0xFF stuffed with 0x00; RST D0..D7 between intervals, restarting at D0 per scan", app0: "canonical JFIF 1.02, density 1x1, units 0, no thumbnail" },
    sharp: { ...sharpVersions, location: "external scratch passed via --sharp (absolute path intentionally not persisted)", rgbFormula: RGB_FORMULA, commonOptions: SHARP_COMMON },
  },
  mutationSemantics: "ops apply sequentially to the parent bytes; each offset is in the coordinates of the buffer produced by the previous op; replace keeps length; insert has old ''; delete has new ''",
  accountingExamples: [
    { fixture: "hc-444-17x9-app0.jpg", total: 6968, calculation: "RGB 6*17*9=918; per component 256*(3*1)*(2*1)=1536 + 64*3*2=384, x3 = 5760; tables 1 DQT*256 + 2 DHT*(16+1)=290; 918+5760+290=6968" },
    { fixture: "hc-420-17x9-app0.jpg", total: 4920, calculation: "RGB 918; Y 256*(2*2)*(1*2)=2048 + 64*3*2=384; Cb/Cr each 256*2*1=512 + 64*2*1=128; tables 290; 918+2432+640*2+290=4920" },
    { fixture: "in-test 4096x3120 4:4:4", total: 268435456, calculation: "6WH=76677120; 3*(256+64)*512*390=191692800; base 268369920; 1 DQT 256 + 3840 one-symbol DHT definitions*17=65280 -> 268435456; replacing one unused DC3 definition by a 2-symbol (counts[length2]=2, values 0,1) definition gives 18 instead of 17 -> 268435457" },
    { fixture: "in-test 4095x3119 4:4:4", total: 268435456, calculation: "6*4095*3119=76633830; blocks 191692800; base 268326630; 1 DQT 256; 6385 one-symbol*17=108545 + one 9-symbol AC2 (16+9=25) -> 268435456; 10-symbol variant -> +1" },
    { fixture: "in-test 4096x3120 two DQT", total: 268435456, calculation: "base 268369920 + 2 pre-SOF id0 DQT*256=512 + 3823 one-symbol*17=64991 + one 17-symbol AC2 (33) = 268435456; 3825 one-symbol instead -> 268435457" },
  ],
  fixtures: fixtureRecords,
};
await writeFile(join(HERE, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
await writeFile(join(HERE, "decoder-proof.json"), JSON.stringify({ decoder: provenance.decoder, generatorSha256Lf, results: proofs }, null, 2) + "\n");
for (const proof of proofs) {
  const sha = fixtureRecords.find((r) => r.file === proof.file).sha256.slice(0, 12);
  console.log(`${proof.file.padEnd(44)} ${sha} decoder=${proof.observed.padEnd(6)} required=${proof.required}${proof.errorMessage ? ` (${proof.errorMessage})` : ""}`);
}
console.log(`OK fixtures=${fixtureRecords.length} sharp=${sharpVersions.version}/libvips ${sharpVersions.libvips} jpeg-js=${jpegJsVersion} generatorSha256Lf=${generatorSha256Lf}`);
