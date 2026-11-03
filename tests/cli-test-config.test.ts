import { access } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { parseJsonConfigFileContent, readConfigFile, sys } from "typescript";
import { describe, expect, it } from "vitest";

const CONFIG_PATH = resolve("tsconfig.cli-test.json");

describe("CLI test TypeScript configuration", () => {
  it("isolates CLI compilation to src while preserving dist/src output", async () => {
    await expect(access(CONFIG_PATH)).resolves.toBeUndefined();
    const loaded = readConfigFile(CONFIG_PATH, sys.readFile);
    expect(loaded.error).toBeUndefined();
    const parsed = parseJsonConfigFileContent(loaded.config, sys, resolve("."), undefined, CONFIG_PATH);
    expect(parsed.errors).toEqual([]);
    const files = parsed.fileNames.map((file) => resolve(file));
    const sourceRoot = `${resolve("src")}${sep}`;
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => file.startsWith(sourceRoot))).toBe(true);

    const source = resolve("src/research/dataset.ts");
    expect(files).toContain(source);
    expect(resolve(parsed.options.rootDir!)).toBe(resolve("."));
    const relativeSource = relative(parsed.options.rootDir!, source);
    const emitted = resolve(parsed.options.outDir!, relativeSource.replace(/\.tsx?$/u, ".js"));
    expect(emitted).toBe(resolve("dist/src/research/dataset.js"));
  });
});
