import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";
import { validateJpeg } from "../src/core/jpeg-validation.js";

function jpeg444(width = 17, height = 9): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 37) & 255;
    data[i * 4 + 1] = (i * 73) & 255;
    data[i * 4 + 2] = (i * 101) & 255;
    data[i * 4 + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width, height }, 90).data);
}

function segment(bytes: Buffer, marker: number): { start: number; end: number } {
  const needle = Buffer.from([0xff, marker]);
  const start = bytes.indexOf(needle);
  if (start < 0) throw new Error(`marker ${marker.toString(16)} absent`);
  return { start, end: start + 2 + bytes.readUInt16BE(start + 2) };
}

describe("strict JPEG marker and entropy matrix", () => {
  // ITU-T T.81 Annex C (canonical codes), F.1.2.2.3 (ZRL/EOB cursor), and
  // F.1.2.3 (FF00 stuffing and one-padding) define these acceptance rules.
  it.each([
    ["missing APP0", (b: Buffer) => removeSegment(b, 0xe0), "unsupported_jpeg_profile"],
    ["duplicate APP0", (b: Buffer) => Buffer.concat([b.subarray(0, segment(b, 0xe0).end), b.subarray(segment(b, 0xe0).start, segment(b, 0xe0).end), b.subarray(segment(b, 0xe0).end)]), "malformed_jpeg"],
    ["SOF short length", (b: Buffer) => { const x = Buffer.from(b); x.writeUInt16BE(1, segment(x, 0xc0).start + 2); return x; }, "malformed_jpeg"],
    ["DQT short payload", (b: Buffer) => { const x = Buffer.from(b); x.writeUInt16BE(2, segment(x, 0xdb).start + 2); return x; }, "malformed_jpeg"],
    ["duplicate DQT", (b: Buffer) => { const q = segment(b, 0xdb); return Buffer.concat([b.subarray(0, q.end), b.subarray(q.start, q.end), b.subarray(q.end)]); }, "malformed_jpeg"],
    ["duplicate DHT", (b: Buffer) => { const h = segment(b, 0xc4); return Buffer.concat([b.subarray(0, h.end), b.subarray(h.start, h.end), b.subarray(h.end)]); }, "malformed_jpeg"],
    ["unsupported APP1", (b: Buffer) => { const a = Buffer.from([0xff, 0xe1, 0, 4, 1, 2]); const q = segment(b, 0xdb); return Buffer.concat([b.subarray(0, q.start), a, b.subarray(q.start)]); }, "unsupported_jpeg_profile"],
  ])("rejects %s with the stable class", (_name, mutate, code) => {
    expect(() => validateJpeg(mutate(jpeg444()))).toThrowError(code);
  });

  it("rejects non-one terminal padding while accepting a consumed FF00", () => {
    const valid = jpeg444();
    expect(() => validateJpeg(valid)).not.toThrow();
    const eoi = valid.lastIndexOf(Buffer.from([0xff, 0xd9]));
    const sos = valid.indexOf(Buffer.from([0xff, 0xda]));
    expect(valid.subarray(sos, eoi).includes(Buffer.from([0xff, 0x00]))).toBe(true);
    const extra = Buffer.concat([valid.subarray(0, eoi), Buffer.from([0xff, 0x00]), valid.subarray(eoi)]);
    expect(() => validateJpeg(extra)).toThrowError("malformed_jpeg");
    const padding = Buffer.from(valid);
    padding[eoi - 1] &= 0xfe;
    expect(() => validateJpeg(padding)).toThrowError("malformed_jpeg");
  });

  it("rejects malformed Huffman symbols and invalid AC cursor runs", () => {
    const valid = jpeg444();
    const dht = segment(valid, 0xc4);
    const invalidDc = Buffer.from(valid);
    invalidDc[huffmanSymbolOffset(invalidDc, dht.start, 0, 0)] = 12;
    expect(() => validateJpeg(invalidDc)).toThrowError("malformed_jpeg");
    const invalidAc = Buffer.from(valid);
    invalidAc[huffmanSymbolOffset(invalidAc, dht.start, 1, 0)] = 0x0b;
    expect(() => validateJpeg(invalidAc)).toThrowError("malformed_jpeg");
  });

  it.each([
    ["duplicate SOI", (b: Buffer) => Buffer.concat([b.subarray(0, 2), b]) , "malformed_jpeg"],
    ["duplicate EOI", (b: Buffer) => Buffer.concat([b, Buffer.from([0xff, 0xd9])]), "malformed_jpeg"],
    ["missing SOF", (b: Buffer) => removeSegment(b, 0xc0), "unsupported_jpeg_profile"],
    ["missing SOS", (b: Buffer) => removeScan(b), "malformed_jpeg"],
    ["duplicate SOS", (b: Buffer) => duplicateSegment(b, 0xda), "malformed_jpeg"],
    ["DRI marker", (b: Buffer) => insertBefore(b, 0xda, Buffer.from([0xff, 0xdd, 0, 4, 0, 1])), "unsupported_jpeg_profile"],
    ["RST marker", (b: Buffer) => insertInScan(b, Buffer.from([0xff, 0xd0])), "malformed_jpeg"],
    ["undefined SOS selector", (b: Buffer) => { const x = Buffer.from(b); const s = segment(x, 0xda); x[s.start + 5] = 4; return x; }, "unsupported_jpeg_profile"],
    ["junk before EOI", (b: Buffer) => insertBeforeEoi(b, Buffer.from([1, 2, 3])), "malformed_jpeg"],
    ["early EOI", (b: Buffer) => insertInScan(b, Buffer.from([0xff, 0xd9])), "malformed_jpeg"],
  ])("rejects %s with %s", (_name, mutate, code) => {
    expect(() => validateJpeg(mutate(jpeg444()))).toThrowError(code);
  });

  it.each([
    ["JFIF version", 5, 2], ["JFIF density unit", 7, 3], ["JFIF X density", 9, 0], ["JFIF thumbnail", 12, 1],
  ])("rejects invalid %s", (_name, offset, value) => {
    const bytes = Buffer.from(jpeg444());
    const app = segment(bytes, 0xe0);
    bytes[app.start + 4 + offset] = value;
    expect(() => validateJpeg(bytes)).toThrowError("unsupported_jpeg_profile");
  });

  it.each([0, 1, 2, 3, 4])("rejects high-bit JFIF identifier byte %s", (offset) => {
    const bytes = Buffer.from(jpeg444());
    const app = segment(bytes, 0xe0);
    bytes[app.start + 4 + offset] |= 0x80;
    expect(() => validateJpeg(bytes)).toThrowError("unsupported_jpeg_profile");
  });

  it("rejects a wrong JFIF identifier letter", () => {
    const bytes = Buffer.from(jpeg444());
    const app = segment(bytes, 0xe0);
    bytes[app.start + 4 + 1] = "X".charCodeAt(0);
    expect(() => validateJpeg(bytes)).toThrowError("unsupported_jpeg_profile");
  });

  it.each([
    ["DQT precision", (b: Buffer) => { const x = Buffer.from(b); x[segment(x, 0xdb).start + 4] = 0x10; return x; }],
    ["DQT id", (b: Buffer) => { const x = Buffer.from(b); x[segment(x, 0xdb).start + 4] = 4; return x; }],
    ["DHT id", (b: Buffer) => { const x = Buffer.from(b); x[segment(x, 0xc4).start + 4] = 2; return x; }],
  ])("rejects malformed %s", (_name, mutate) => expect(() => validateJpeg(mutate(jpeg444()))).toThrowError("malformed_jpeg"));

  it("classifies structurally valid grayscale SOF0 as an unsupported JPEG profile", () => {
    const grayscaleSof0 = Buffer.from([8, 0, 9, 0, 17, 1, 1, 0x11, 0]);
    expect(() => validateJpeg(replaceMarker(jpeg444(), 0xc0, grayscaleSof0))).toThrowError("unsupported_jpeg_profile");
  });
});

function huffmanSymbolOffset(bytes: Buffer, start: number, kind: number, id: number): number {
  let p = start + 4;
  const end = start + 2 + bytes.readUInt16BE(start + 2);
  while (p < end) {
    const spec = bytes[p++];
    const count = bytes.subarray(p, p + 16).reduce((sum, value) => sum + value, 0);
    p += 16;
    if (spec >> 4 === kind && (spec & 15) === id) return p;
    p += count;
  }
  throw new Error("Huffman table not found");
}

function removeSegment(bytes: Buffer, marker: number): Buffer {
  const part = segment(bytes, marker);
  return Buffer.concat([bytes.subarray(0, part.start), bytes.subarray(part.end)]);
}
function huffmanTable(spec: number, counts: number[], symbols: number[]): Buffer {
  return Buffer.from([spec, ...counts, ...symbols]);
}
function replaceDht(bytes: Buffer, payload: Buffer): Buffer {
  const part = segment(bytes, 0xc4);
  const replacement = Buffer.from([0xff, 0xc4, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
  return Buffer.concat([bytes.subarray(0, part.start), replacement, bytes.subarray(part.end)]);
}
function duplicateSegment(bytes: Buffer, marker: number): Buffer {
  const part = segment(bytes, marker);
  return Buffer.concat([bytes.subarray(0, part.end), bytes.subarray(part.start, part.end), bytes.subarray(part.end)]);
}
function insertBefore(bytes: Buffer, marker: number, addition: Buffer): Buffer {
  const part = segment(bytes, marker);
  return Buffer.concat([bytes.subarray(0, part.start), addition, bytes.subarray(part.start)]);
}
function insertInScan(bytes: Buffer, addition: Buffer): Buffer {
  const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return Buffer.concat([bytes.subarray(0, eoi), addition, bytes.subarray(eoi)]);
}
function insertBeforeEoi(bytes: Buffer, addition: Buffer): Buffer { return insertInScan(bytes, addition); }
function removeScan(bytes: Buffer): Buffer {
  const sos = segment(bytes, 0xda);
  const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return Buffer.concat([bytes.subarray(0, sos.start), bytes.subarray(eoi + 2)]);
}
function replaceMarker(bytes: Buffer, marker: number, payload: Buffer): Buffer {
  const part = segment(bytes, marker);
  const replacement = Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
  return Buffer.concat([bytes.subarray(0, part.start), replacement, bytes.subarray(part.end)]);
}
