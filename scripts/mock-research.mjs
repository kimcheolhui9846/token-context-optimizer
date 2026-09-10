import { readFile } from "node:fs/promises";
import { simulateResearchRun } from "../dist/src/research/mock-run.js";
import { parseJsonObjectRejectingDuplicateKeys } from "./plugin-runtime.mjs";

async function main(args) {
  if (args.length !== 3 || args.some(arg => !arg.trim())) return { valid: false, code: "usage" };
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const dataset = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[0])));
    const config = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[1])));
    const scenario = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[2])));
    return { valid: true, report: simulateResearchRun(dataset, config, scenario) };
  } catch {
    return { valid: false, code: "invalid_input" };
  }
}

const result = await main(process.argv.slice(2));
console.log(JSON.stringify(result));
process.exitCode = result.valid ? 0 : 1;
