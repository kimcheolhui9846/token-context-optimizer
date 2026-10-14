import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
