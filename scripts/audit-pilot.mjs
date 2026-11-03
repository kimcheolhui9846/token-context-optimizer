import { readFile } from "node:fs/promises";
import { auditPilotDataset } from "../dist/src/research/pilot.js";
import { parseJsonObjectRejectingDuplicateKeys } from "./plugin-runtime.mjs";

async function main(args) {
  if (args.length !== 1 || !args[0].trim()) return { valid: false, code: "usage" };
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  try {
    const input = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[0])));
    return { valid: true, report: auditPilotDataset(input) };
  } catch {
    return { valid: false, code: "invalid_input" };
  }
}

const result = await main(process.argv.slice(2));
console.log(JSON.stringify(result));
process.exitCode = result.valid ? 0 : 1;
