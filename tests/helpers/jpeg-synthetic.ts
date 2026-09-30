import { Buffer } from "node:buffer";

type HuffmanSpec = { kind: 0 | 1; id: number; symbols: number[] };
type Block = { dc: number; ac: number[] };

const BASE_Q = Buffer.alloc(64, 1);

export function syntheticJpeg(options: {
  blocks?: Block[];
  dcSymbols?: number[];
  acSymbols?: number[];
  entropy?: string;
  width?: number;
  height?: number;
  extraEntropy?: Buffer;
  mcuCount?: number;
  quantTableIds?: number[];
} = {}): Buffer {
  const width = options.width ?? 8;
  const height = options.height ?? 8;
  const dcSymbols = options.dcSymbols ?? [0];
  const acSymbols = options.acSymbols ?? [0];
  const tables: HuffmanSpec[] = [
    { kind: 0, id: 0, symbols: dcSymbols },
    { kind: 1, id: 0, symbols: acSymbols },
  ];
  const dcLengths = lengthsFor(dcSymbols);
  const acLengths = lengthsFor(acSymbols);
  const entropy = options.entropy ?? (options.mcuCount !== undefined
    ? encodeRepeatedBlocks(options.mcuCount, { dc: dcSymbols[0], ac: [acSymbols[0]] }, dcSymbols, acSymbols, dcLengths, acLengths)
    : encodeBlocks(options.blocks ?? [
    { dc: dcSymbols[0], ac: [acSymbols[0]] },
    { dc: dcSymbols[0], ac: [acSymbols[0]] },
    { dc: dcSymbols[0], ac: [acSymbols[0]] },
  ], dcSymbols, acSymbols, dcLengths, acLengths));
  const scan = stuff(Buffer.from(bitsToBytes(entropy)));
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.concat([Buffer.from("JFIF\0", "ascii"), Buffer.from([1, 2, 0, 0, 1, 0, 1, 0, 0])])),
    segment(0xdb, Buffer.concat((options.quantTableIds ?? [0]).map((id) => Buffer.concat([Buffer.from([id]), BASE_Q])))),
    segment(0xc0, Buffer.from([8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0])),
    segment(0xc4, Buffer.concat(tables.map(huffmanSegment))),
    segment(0xda, Buffer.from([3, 1, 0, 2, 0, 3, 0, 0, 63, 0])),
    scan,
    options.extraEntropy ?? Buffer.alloc(0),
    Buffer.from([0xff, 0xd9]),
  ]);
}

export function bitsToBytes(bits: string): Buffer {
  const padded = bits + "1".repeat((8 - (bits.length % 8)) % 8);
  const bytes = Buffer.alloc(padded.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(padded.slice(i * 8, i * 8 + 8), 2);
  return bytes;
}

export function symbolBits(symbol: number, symbols: number[], lengths = lengthsFor(symbols)): string {
  const index = symbols.indexOf(symbol);
  if (index < 0) throw new Error(`symbol ${symbol.toString(16)} not defined`);
  let code = 0;
  let previous = lengths[0];
  for (let i = 0; i <= index; i++) {
    const length = lengths[i];
    if (i > 0) { code++; code <<= length - previous; previous = length; }
    if (i === index) return code.toString(2).padStart(length, "0");
  }
  throw new Error("unreachable");
}

function encodeBlocks(blocks: Block[], dcSymbols: number[], acSymbols: number[], dcLengths: number[], acLengths: number[]): string {
  let bits = "";
  for (const block of blocks) {
    bits += symbolBits(block.dc, dcSymbols, dcLengths);
    if (block.dc) bits += "1".repeat(block.dc);
    for (const ac of block.ac) {
      bits += symbolBits(ac, acSymbols, acLengths);
      const size = ac & 15;
      if (size) bits += "1".repeat(size);
    }
  }
  return bits;
}

function encodeRepeatedBlocks(count: number, block: Block, dcSymbols: number[], acSymbols: number[], dcLengths: number[], acLengths: number[]): string {
  let bits = "";
  for (let i = 0; i < count * 3; i++) {
    bits += symbolBits(block.dc, dcSymbols, dcLengths);
    if (block.dc) bits += "1".repeat(block.dc);
    for (const ac of block.ac) {
      bits += symbolBits(ac, acSymbols, acLengths);
      const size = ac & 15;
      if (size) bits += "1".repeat(size);
    }
  }
  return bits;
}

function huffmanSegment(table: HuffmanSpec): Buffer {
  const counts = Buffer.alloc(16);
  for (const length of lengthsFor(table.symbols)) counts[length - 1]++;
  return Buffer.concat([Buffer.from([table.kind << 4 | table.id]), counts, Buffer.from(table.symbols)]);
}

function lengthsFor(symbols: number[]): number[] {
  if (symbols.length <= 1) return [1];
  const lengths: number[] = [1, 2];
  while (lengths.length < symbols.length) lengths.push(3);
  return lengths;
}

function segment(marker: number, payload: Buffer): Buffer {
  const result = Buffer.alloc(4 + payload.length);
  result[0] = 0xff; result[1] = marker;
  result.writeUInt16BE(payload.length + 2, 2);
  payload.copy(result, 4);
  return result;
}

function stuff(bytes: Buffer): Buffer {
  const output: number[] = [];
  for (const byte of bytes) { output.push(byte); if (byte === 0xff) output.push(0); }
  return Buffer.from(output);
}
