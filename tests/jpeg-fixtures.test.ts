import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fromJSONSchema } from "zod/v4";
import { indexImageArtifact, inspectImageArtifact, MemoryImageArtifactStore } from "../src/core/image-artifacts.js";
import { validateJpeg } from "../src/core/jpeg-validation.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const provenance = JSON.parse(await readFile("tests/fixtures/jpeg/provenance.json", "utf8")) as { fixtures: Array<{ file: string; width: number; height: number; sha256: string; byteLength: number }> };

describe("checked-in JPEG fixtures", () => {
  it.each(provenance.fixtures)("validates $file with recorded provenance", async (fixture) => {
    const bytes = await readFile(join("tests/fixtures/jpeg", fixture.file));
    expect(bytes.byteLength).toBe(fixture.byteLength);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
    expect(validateJpeg(bytes)).toMatchObject({ width: fixture.width, height: fixture.height, channels: 3 });
  });

  it("repeats odd-fixture identity and preserves actual returned/store copies", async () => {
    const root = await mkdtemp(join(tmpdir(), "tco-jpeg-fixture-")); roots.push(root);
    const path = join(root, "fixture.jpg"); const bytes = await readFile("tests/fixtures/jpeg/checkedin-odd-17x9.jpg"); await writeFile(path, bytes);
    const store = new MemoryImageArtifactStore(); const first = await indexImageArtifact({ path, allowedRoots: [root], store }); const expected = { ...first };
    const second = await indexImageArtifact({ path, allowedRoots: [root], store }); expect(second).toEqual(expected); expect(store.size).toBe(1);
    first.path = "changed"; first.sha256 = "changed";
    const inspected = await inspectImageArtifact({ artifactId: expected.artifactId, allowedRoots: [root], store }); expect(inspected).toEqual(expected);
    inspected.path = "changed"; inspected.sha256 = "changed";
    expect(await inspectImageArtifact({ artifactId: expected.artifactId, allowedRoots: [root], store })).toEqual(expected);
    const stored = store.get(expected.artifactId)!; stored.path = "changed"; stored.sha256 = "changed";
    expect(await inspectImageArtifact({ artifactId: expected.artifactId, allowedRoots: [root], store })).toEqual(expected);
    expect(await readFile(path)).toEqual(bytes);
  });

  it("validates actual tools/list schemas for both correlated records and required fields", async () => {
    const tools = await toolsList(); const imageTools = tools.filter((tool) => tool.name === "index_image_artifact" || tool.name === "inspect_image_artifact");
    expect(imageTools).toHaveLength(2); expect(imageTools.map((tool) => tool.name).sort()).toEqual(["index_image_artifact", "inspect_image_artifact"]);
    const png = { artifactId: "image_png", path: "a.png", sha256: "a", byteLength: 1, format: "png", mimeType: "image/png", width: 1, height: 1, channels: 4, bitDepth: 8, validationProfile: "png-rgb8-static-v1" };
    const jpeg = { artifactId: "image_jpeg", path: "a.jpg", sha256: "b", byteLength: 1, format: "jpeg", mimeType: "image/jpeg", width: 17, height: 9, channels: 3, bitDepth: 8, validationProfile: "jpeg-ycbcr8-baseline-444-v1" };
    for (const tool of imageTools) {
      const schema = fromJSONSchema(tool.outputSchema); expect(schema.safeParse(png).success).toBe(true); expect(schema.safeParse(jpeg).success).toBe(true);
      for (const record of [png, jpeg]) { expect(schema.safeParse({ ...record, format: "png", mimeType: "image/jpeg" }).success).toBe(false); expect(schema.safeParse({ ...record, format: "jpeg", mimeType: "image/png" }).success).toBe(false); }
      expect(schema.safeParse({ ...jpeg, validationProfile: "png-rgb8-static-v1" }).success).toBe(false);
      expect(schema.safeParse({ ...png, validationProfile: "jpeg-ycbcr8-baseline-444-v1" }).success).toBe(false);
      expect(schema.safeParse({ ...jpeg, channels: 4 }).success).toBe(false);
      for (const record of [png, jpeg]) for (const field of Object.keys(record)) expect(schema.safeParse(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field))).success).toBe(false);
    }
  });
});

async function toolsList(): Promise<any[]> {
  const child = spawn(process.execPath, ["./bin/token-context-optimizer.mjs"], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let stderr = ""; let settled = false; let timer: NodeJS.Timeout | undefined; let poll: NodeJS.Timeout | undefined;
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
  const cleanup = () => { if (timer) clearTimeout(timer); if (poll) clearInterval(poll); if (!child.killed) child.kill(); };
  try {
    return await new Promise<any[]>((resolve, reject) => {
      const finish = (error?: Error, tools?: any[]) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(tools!); };
      child.once("error", (error) => finish(error)); child.once("exit", (code) => { if (!settled) finish(new Error(`tools/list child exited ${code}: ${stderr}`)); });
      timer = setTimeout(() => finish(new Error(`tools/list timeout: ${stderr}`)), 5000);
      poll = setInterval(() => { for (const line of output.split(/\r?\n/u)) { try { const message = JSON.parse(line); if (message.id === 2) { finish(undefined, message.result?.tools); return; } } catch { /* partial line */ } } }, 10);
      const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fixture-test", version: "1" } } }); send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }); send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    });
  } finally { cleanup(); }
}
