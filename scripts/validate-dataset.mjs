import { readFile } from "node:fs/promises";
import { validateDataset } from "../dist/src/research/dataset.js";
import { parseJsonObjectRejectingDuplicateKeys } from "./plugin-runtime.mjs";

async function main(args) {
  const failure = (code) => ({ valid: false, issues: [{ code, path: "$" }] });
  if (args.length !== 1 || !args[0].trim()) return failure("usage");
  let source;
  try {
    source = await readFile(args[0], "utf8");
  } catch {
    return failure("read_error");
  }
  let input;
  try {
    input = parseJsonObjectRejectingDuplicateKeys(source);
  } catch {
    return failure("invalid_json");
  }
  return validateDataset(input);
}

const result = await main(process.argv.slice(2));
console.log(JSON.stringify(result));
process.exitCode = result.valid ? 0 : 1;
