import { readFile } from "node:fs/promises";
import { prepareResearchRun } from "../dist/src/research/run-plan.js";
import { parseJsonObjectRejectingDuplicateKeys } from "./plugin-runtime.mjs";

async function main(args) {
  if (args.length !== 2 || args.some((arg) => !arg.trim())) {
    return { valid: false, code: "usage" };
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const dataset = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[0])));
    const config = parseJsonObjectRejectingDuplicateKeys(decoder.decode(await readFile(args[1])));
    return { valid: true, report: prepareResearchRun(dataset, config) };
  } catch {
    return { valid: false, code: "invalid_input" };
  }
}

const result = await main(process.argv.slice(2));
console.log(JSON.stringify(result));
process.exitCode = result.valid ? 0 : 1;
