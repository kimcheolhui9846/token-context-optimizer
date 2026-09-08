import { readFile } from "node:fs/promises";
import { checkExactResponse } from "../dist/src/research/exact-checks.js";
import { parseJsonObjectRejectingDuplicateKeys } from "./plugin-runtime.mjs";

function invalid(code) {
  return {
    datasetSha256: null,
    responseSha256: null,
    checkVersion: null,
    passed: null,
    codes: [code],
  };
}

async function main(args) {
  if (args.length !== 2 || args.some((arg) => !arg.trim())) return invalid("usage");

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const [datasetBytes, envelopeBytes] = await Promise.all([
      readFile(args[0]),
      readFile(args[1]),
    ]);
    const dataset = parseJsonObjectRejectingDuplicateKeys(decoder.decode(datasetBytes));
    const envelope = parseJsonObjectRejectingDuplicateKeys(decoder.decode(envelopeBytes));
    return checkExactResponse(dataset, envelope);
  } catch {
    return invalid("invalid_input");
  }
}

const result = await main(process.argv.slice(2));

console.log(JSON.stringify(result));
process.exitCode = result.passed === null ? 1 : 0;
