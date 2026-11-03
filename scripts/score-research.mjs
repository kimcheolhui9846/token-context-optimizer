import { readFile } from "node:fs/promises";
import { scoreEvaluation } from "../dist/src/research/scoring.js";
import { parseJsonObjectRejectingDuplicateKeys } from "./plugin-runtime.mjs";

async function main(args) {
  if (args.length !== 2 || args.some((arg) => !arg.trim())) return { valid: false, code: "usage" };
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  try {
    const dataset = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[0])));
    const ledger = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[1])));
    return { valid: true, report: scoreEvaluation(dataset, ledger) };
  } catch {
    return { valid: false, code: "invalid_input" };
  }
}

const result = await main(process.argv.slice(2));
console.log(JSON.stringify(result));
process.exitCode = result.valid ? 0 : 1;
