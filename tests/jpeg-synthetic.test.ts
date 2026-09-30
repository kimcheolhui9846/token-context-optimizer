import { describe, expect, it } from "vitest";
import { syntheticJpeg } from "./helpers/jpeg-synthetic.js";
import { validateJpeg } from "../src/core/jpeg-validation.js";

function expectCode(bytes: Buffer, code: string): void {
  expect(() => validateJpeg(bytes)).toThrowError(code);
}

describe("synthetic JPEG entropy fixtures", () => {
  it("decodes valid DC category 11 and AC size 10 symbols", () => {
    const bytes = syntheticJpeg({
      dcSymbols: [11], acSymbols: [0x0a, 0],
      blocks: Array.from({ length: 3 }, () => ({ dc: 11, ac: [0x0a, 0] })),
    });
    expect(validateJpeg(bytes)).toMatchObject({ width: 8, height: 8, channels: 3 });
  });

  it("accepts ZRL ending exactly at coefficient 64 and rejects coefficient 65", () => {
    const exact = syntheticJpeg({ acSymbols: [0xf0, 0xe1], blocks: Array.from({ length: 3 }, () => ({ dc: 0, ac: [0xf0, 0xf0, 0xe1, 0xf0] })) });
    expect(validateJpeg(exact)).toMatchObject({ width: 8, height: 8 });
    const overflow = syntheticJpeg({ acSymbols: [0xf0], blocks: Array.from({ length: 3 }, () => ({ dc: 0, ac: [0xf0, 0xf0, 0xf0, 0xf0] })) });
    expectCode(overflow, "malformed_jpeg");
  });

  it("rejects a nonzero run crossing coefficient 63", () => {
    const bytes = syntheticJpeg({ acSymbols: [0xf0, 0xf1], blocks: Array.from({ length: 3 }, () => ({ dc: 0, ac: [0xf0, 0xf0, 0xf0, 0xf1] })) });
    expectCode(bytes, "malformed_jpeg");
  });

  it("rejects undefined Huffman codes and missing magnitude bits", () => {
    expectCode(syntheticJpeg({ entropy: "1" + "1".repeat(32) }), "malformed_jpeg");
    expectCode(syntheticJpeg({ dcSymbols: [11], acSymbols: [0], entropy: "0" }), "malformed_jpeg");
  });

  it("accepts byte-aligned and nonbyte-aligned one-padding and rejects non-one padding", () => {
    expect(() => validateJpeg(syntheticJpeg({ dcSymbols: [0, 1], acSymbols: [0], blocks: [{ dc: 1, ac: [0] }, { dc: 0, ac: [0] }, { dc: 0, ac: [0] }] }))).not.toThrow();
    expect(() => validateJpeg(syntheticJpeg())).not.toThrow();
    expectCode(syntheticJpeg({ entropy: "00000000" }), "malformed_jpeg");
  });

  it("accepts a consumed FF00 and rejects an extra FF00 after all blocks", () => {
    const consumed = syntheticJpeg({ dcSymbols: [1], acSymbols: [0xf0, 0xea], blocks: Array.from({ length: 3 }, () => ({ dc: 1, ac: [0xf0, 0xf0, 0xf0, 0xea] })) });
    const eoi = consumed.lastIndexOf(Buffer.from([0xff, 0xd9]));
    const sos = consumed.indexOf(Buffer.from([0xff, 0xda]));
    expect(consumed.subarray(eoi - 2, eoi).equals(Buffer.from([0xff, 0x00]))).toBe(true);
    expect(() => validateJpeg(consumed)).not.toThrow();
    expectCode(Buffer.concat([consumed.subarray(0, eoi), Buffer.from([0xff, 0x00]), consumed.subarray(eoi)]), "malformed_jpeg");
  });

  it("accepts incomplete trees and grouped unused DQT/DHT definitions", () => {
    const bytes = syntheticJpeg({ dcSymbols: [0], acSymbols: [0] });
    expect(() => validateJpeg(bytes)).not.toThrow();
    const dqt = Buffer.concat([Buffer.from([0]), Buffer.alloc(64, 1), Buffer.from([1]), Buffer.alloc(64, 1)]);
    const dht = Buffer.from([0x11, 1, ...Array(15).fill(0), 0]);
    const originalDht = segmentPayload(bytes, 0xc4);
    const grouped = replaceMarker(replaceMarker(bytes, 0xdb, dqt), 0xc4, Buffer.concat([originalDht, dht]));
    expect(() => validateJpeg(grouped)).not.toThrow();
  });

  it.each([
    ["all-ones code", (b: Buffer) => replaceDht(b, Buffer.concat([huffmanTable(0, [2, ...Array(15).fill(0)], [0, 1]), huffmanTable(0x10, [1, ...Array(15).fill(0)], [0])]))],
    ["oversubscribed tree", (b: Buffer) => replaceDht(b, Buffer.concat([huffmanTable(0, [3, ...Array(15).fill(0)], [0, 1, 2]), huffmanTable(0x10, [1, ...Array(15).fill(0)], [0])]))],
    ["duplicate symbols", (b: Buffer) => replaceDht(b, Buffer.concat([huffmanTable(0, [1, ...Array(15).fill(0)], [0]), huffmanTable(0x10, [2, ...Array(15).fill(0)], [0, 0])]))],
    ["illegal zero-size symbol", (b: Buffer) => replaceDht(b, Buffer.concat([huffmanTable(0, [1, ...Array(15).fill(0)], [0]), huffmanTable(0x10, [1, ...Array(15).fill(0)], [0x10])]))],
  ])("rejects %s", (_name, mutate) => {
    expectCode(mutate(syntheticJpeg()), "malformed_jpeg");
  });
});

function huffmanTable(spec: number, counts: number[], symbols: number[]): Buffer {
  return Buffer.from([spec, ...counts, ...symbols]);
}
function replaceDht(bytes: Buffer, payload: Buffer): Buffer {
  const start = bytes.indexOf(Buffer.from([0xff, 0xc4]));
  const length = bytes.readUInt16BE(start + 2);
  const replacement = Buffer.from([0xff, 0xc4, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
  return Buffer.concat([bytes.subarray(0, start), replacement, bytes.subarray(start + 2 + length)]);
}
function segmentPayload(bytes: Buffer, marker: number): Buffer {
  const start = bytes.indexOf(Buffer.from([0xff, marker]));
  const length = bytes.readUInt16BE(start + 2);
  return bytes.subarray(start + 4, start + 2 + length);
}
function replaceMarker(bytes: Buffer, marker: number, payload: Buffer): Buffer {
  const start = bytes.indexOf(Buffer.from([0xff, marker]));
  const length = bytes.readUInt16BE(start + 2);
  const replacement = Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
  return Buffer.concat([bytes.subarray(0, start), replacement, bytes.subarray(start + 2 + length)]);
}
