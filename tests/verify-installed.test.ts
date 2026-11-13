import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

// N-38 minimal option A: installed verifier checks the required tool surface
// and a small image smoke. These tests run the real verifier script as a child.
const execFileAsync = promisify(execFile);
const VERIFIER = "scripts/verify-installed-plugin.mjs";
const HISTORICAL_FIVE_TOOL_COMMIT = "990aa9f8fa875aafeaaa6fbf38fdfcc5b1e094a9";
const OWNED_TEMP_PREFIXES = ["tco-installed-workspace-", "tco-installed-outside-"];
const REQUIRED_TOOLS = [
  "estimate_context",
  "classify_context",
  "index_artifact",
  "query_artifact",
  "summarize_artifact",
  "index_image_artifact",
  "inspect_image_artifact",
  "crop_image_artifact",
  "overview_image_artifact",
];

type FakeConfig = Record<string, unknown>;

async function installTarget(label: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), `tco-n38-${label}-`));
  await execFileAsync(
    process.execPath,
    ["scripts/install-local-plugin.mjs", "--target", target, "--no-marketplace"],
    { windowsHide: true },
  );
  return target;
}

async function installFake(label: string, config: FakeConfig): Promise<string> {
  const target = await installTarget(label);
  const template = await readFile(join("tests", "helpers", "fake-installed-server.mjs"), "utf8");
  const marker = "/*CONFIG*/ {} /*END*/";
  if (!template.includes(marker)) throw new Error("fake server template marker missing");
  await writeFile(
    join(target, "bin", "token-context-optimizer.mjs"),
    template.replace(marker, JSON.stringify(config)),
    "utf8",
  );
  return target;
}

async function runVerifier(target: string) {
  const tempParent = await mkdtemp(join(tmpdir(), "tco-n38-verify-parent-"));
  const env = { ...process.env, TEMP: tempParent, TMP: tempParent, TMPDIR: tempParent };
  try {
    const { stdout } = await execFileAsync(process.execPath, [VERIFIER, "--plugin-root", target], {
      env,
      windowsHide: true,
      timeout: 60_000,
    });
    return { ok: true as const, result: JSON.parse(stdout), stderr: "", tempParent };
  } catch (error) {
    const failure = error as { stderr?: string; code?: number };
    return { ok: false as const, result: null, stderr: failure.stderr ?? String(error), code: failure.code, tempParent };
  }
}

async function leftovers(tempParent: string): Promise<string[]> {
  return (await readdir(tempParent)).filter((entry) =>
    OWNED_TEMP_PREFIXES.some((prefix) => entry.startsWith(prefix)),
  );
}

async function expectRejected(target: string, pattern: RegExp) {
  const run = await runVerifier(target);
  expect(run.ok, `verifier unexpectedly passed: ${JSON.stringify(run.result)}`).toBe(false);
  expect(run.code).toBe(1);
  expect(run.stderr).toMatch(pattern);
  expect(await leftovers(run.tempParent)).toEqual([]);
  return run;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("N-38 installed verifier: real bundles", () => {
  it("passes the current bundle and reports the image smoke fields", async () => {
    const target = await installTarget("current");
    const run = await runVerifier(target);

    expect(run.ok, run.stderr).toBe(true);
    const result = run.result;
    expect(result.ok).toBe(true);
    expect(result.pluginRoot).toBe(target);
    expect(result.indexedLineCount).toBe(2);
    expect(result.deniedPluginRootIndex).toBe(true);
    expect(result.requiredTools).toEqual(REQUIRED_TOOLS);
    expect(result.imageIndexProfile).toBe("png-rgb8-static-v1");
    expect(result.imageOverview).toBe(true);
    expect(result.deniedOutsideRootImage).toBe(true);
    expect(result.deniedPluginRootImage).toBe(true);
    expect(result.scope).toMatch(/functional smoke/);
    expect(result.scope).toMatch(/does not prove/);
    expect(await leftovers(run.tempParent)).toEqual([]);
  }, 60_000);

  it("rejects the historical pre-image bundle from 990aa9f", async () => {
    const target = await installTarget("historical");
    let bundle: string;
    try {
      bundle = (
        await execFileAsync(
          "git",
          ["show", `${HISTORICAL_FIVE_TOOL_COMMIT}:bin/token-context-optimizer.mjs`],
          { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        )
      ).stdout;
    } catch (error) {
      throw new Error(
        `This test needs git history containing ${HISTORICAL_FIVE_TOOL_COMMIT}; it is not skipped silently`,
        { cause: error },
      );
    }
    expect(bundle).not.toContain("index_image_artifact");
    await writeFile(join(target, "bin", "token-context-optimizer.mjs"), bundle, "utf8");

    await expectRejected(
      target,
      /missing required tools: index_image_artifact, inspect_image_artifact, crop_image_artifact, overview_image_artifact/,
    );
  }, 60_000);
});

describe("N-38 installed verifier: tool list contract", () => {
  it("rejects a server that exposes only the five pre-image tools", async () => {
    const target = await installFake("five", {
      tools: REQUIRED_TOOLS.slice(0, 5).map((name) => ({ name })),
    });
    await expectRejected(target, /missing required tools: index_image_artifact/);
  }, 60_000);

  it("rejects a duplicated tool name", async () => {
    const target = await installFake("duplicate", {
      tools: [...REQUIRED_TOOLS, "index_image_artifact"].map((name) => ({ name })),
    });
    await expectRejected(target, /duplicate MCP tool name: index_image_artifact/);
  }, 60_000);

  it("rejects a non-string tool name", async () => {
    const target = await installFake("nonstring", {
      tools: [...REQUIRED_TOOLS.map((name) => ({ name })), { name: 42 }],
    });
    await expectRejected(target, /invalid MCP tool name/);
  }, 60_000);

  it("rejects an empty tool name", async () => {
    const target = await installFake("emptyname", {
      tools: [...REQUIRED_TOOLS.map((name) => ({ name })), { name: "" }],
    });
    await expectRejected(target, /invalid MCP tool name/);
  }, 60_000);

  it("rejects a tool entry that is not an object", async () => {
    const target = await installFake("nonobject", {
      tools: [...REQUIRED_TOOLS.map((name) => ({ name })), "overview_image_artifact"],
    });
    await expectRejected(target, /invalid MCP tool name/);
  }, 60_000);

  it("rejects a tools/list result whose tools field is not an array", async () => {
    const target = await installFake("notarray", { tools: { index_artifact: {} } });
    await expectRejected(target, /tools\/list did not return a tools array/);
  }, 60_000);

  it("accepts an extra well-formed tool when the required image smoke passes (control)", async () => {
    const target = await installFake("extra", { extraTools: ["visual_context"] });
    const run = await runVerifier(target);
    expect(run.ok, run.stderr).toBe(true);
    expect(run.result.requiredTools).toEqual(REQUIRED_TOOLS);
    expect(await leftovers(run.tempParent)).toEqual([]);
  }, 60_000);
});

describe("N-38 installed verifier: image index smoke", () => {
  it("rejects a JSON-RPC error from index_image_artifact", async () => {
    const target = await installFake("img-rpc", { image: "rpcError" });
    await expectRejected(target, /MCP error response: image tools unavailable/);
  }, 60_000);

  it("rejects an isError result from index_image_artifact", async () => {
    const target = await installFake("img-toolerror", { image: "toolError" });
    await expectRejected(target, /index_image_artifact returned an error result/);
  }, 60_000);

  for (const [mode, field] of [
    ["badHash", "sha256"],
    ["badWidth", "width"],
    ["badProfile", "validationProfile"],
    ["badPath", "path"],
  ] as const) {
    it(`rejects an index_image_artifact record with a wrong ${field}`, async () => {
      const target = await installFake(`img-${mode}`, { image: mode });
      await expectRejected(target, new RegExp(`index_image_artifact metadata mismatch: ${field}`));
    }, 60_000);
  }
});

describe("N-38 installed verifier: overview smoke", () => {
  it("rejects an isError overview", async () => {
    const target = await installFake("ov-toolerror", { overview: "toolError" });
    await expectRejected(target, /overview_image_artifact returned an error result/);
  }, 60_000);

  it("rejects an overview without image content", async () => {
    const target = await installFake("ov-noimage", { overview: "noImage" });
    await expectRejected(target, /overview_image_artifact content mismatch/);
  }, 60_000);

  it("rejects an overview whose sha256 does not match the returned bytes", async () => {
    const target = await installFake("ov-badhash", { overview: "badHash" });
    await expectRejected(target, /overview_image_artifact metadata mismatch: output.sha256/);
  }, 60_000);

  it("rejects overview bytes without JPEG SOI/EOI markers", async () => {
    const target = await installFake("ov-notjpeg", { overview: "notJpeg" });
    await expectRejected(target, /overview_image_artifact metadata mismatch: jpeg markers/);
  }, 60_000);

  it("rejects an overview whose source differs from the indexed record", async () => {
    const target = await installFake("ov-badsource", { overview: "badSource" });
    await expectRejected(target, /overview_image_artifact metadata mismatch: source/);
  }, 60_000);
});

describe("N-38 installed verifier: image authorization denials", () => {
  it("rejects a server that indexes an image outside the allowed workspace", async () => {
    const target = await installFake("deny-outside", { deny: "allowOutside" });
    await expectRejected(target, /outside-root image was not denied with exact path_denied/);
  }, 60_000);

  it("rejects a server that indexes a plugin-root file through the image tool", async () => {
    const target = await installFake("deny-pluginroot", { deny: "allowPluginRoot" });
    await expectRejected(target, /plugin-root file was not denied with exact path_denied/);
  }, 60_000);

  it("rejects a denial that leaks the denied path", async () => {
    const target = await installFake("deny-leak", { deny: "leakPath" });
    const run = await expectRejected(target, /leaked path detail/);
    expect(run.stderr).not.toMatch(/tco-installed-outside-/);
  }, 60_000);

  it("rejects a denial with a different error code", async () => {
    const target = await installFake("deny-code", { deny: "wrongCode" });
    await expectRejected(target, /outside-root image was not denied with exact path_denied/);
  }, 60_000);

  it("rejects a denial that carries structured content", async () => {
    const target = await installFake("deny-structured", { deny: "structured" });
    await expectRejected(target, /outside-root image was not denied with exact path_denied/);
  }, 60_000);
});

describe("N-38 installed verifier: cleanup", () => {
  it("times out on an unanswered image call, stops the child, and removes owned temp roots", async () => {
    const pidDir = await mkdtemp(join(tmpdir(), "tco-n38-pid-"));
    const pidFile = join(pidDir, "server.pid");
    const target = await installFake("hang", { image: "hang", pidFile });

    await expectRejected(target, /Timed out waiting for MCP response/);
    const pid = Number(await readFile(pidFile, "utf8"));
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    expect(isProcessAlive(pid)).toBe(false);
  }, 60_000);
});

describe("N-38 required tool constant", () => {
  it("matches the tools registered by the server source", async () => {
    const runtime = await import("../scripts/plugin-runtime.mjs" as string);
    const source = await readFile(join("src", "server", "index.ts"), "utf8");
    const registered = [...source.matchAll(/registerTool\(\s*"([a-z_]+)"/gu)].map((match) => match[1]);

    expect(runtime.REQUIRED_MCP_TOOL_NAMES).toEqual(REQUIRED_TOOLS);
    expect(Object.isFrozen(runtime.REQUIRED_MCP_TOOL_NAMES)).toBe(true);
    expect([...registered].sort()).toEqual([...REQUIRED_TOOLS].sort());
  });
});
