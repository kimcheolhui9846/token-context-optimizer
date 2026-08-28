import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  MemoryArtifactStore,
  indexArtifact,
  queryArtifact,
  summarizeArtifact,
} from "../src/core/artifacts.js";
import {
  classifyContext,
  lossyCompressionAllowed,
} from "../src/core/policy.js";
import { parseCompleteJsonMessages } from "../src/server/smoke-output-parser.js";
import { estimateContext } from "../src/core/token-estimator.js";

const execFileAsync = promisify(execFile);

describe("artifact indexing and retrieval", () => {
  it("indexes source text with stable hash and line source map", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "build.log");
    const content = [
      "Compiling workspace",
      "src/index.ts:12:5 - error TS2304",
      "Cannot find name 'missingValue'.",
      "Build failed with exit code 2",
    ].join("\n");
    await writeFile(filePath, content, "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });

    expect(artifact.sha256).toBe(
      createHash("sha256").update(content, "utf8").digest("hex"),
    );
    expect(artifact.lineCount).toBe(4);
    expect(artifact.sourceMap[1]).toMatchObject({
      line: 2,
      text: "src/index.ts:12:5 - error TS2304",
    });
  });

  it("preserves byte offsets for CRLF-delimited files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "windows.log");
    const content = "alpha\r\nbeta\r\ngamma";
    await writeFile(filePath, content, "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });

    expect(artifact.sourceMap.map((line) => line.startByte)).toEqual([0, 7, 13]);
    expect(artifact.sourceMap.map((line) => line.endByte)).toEqual([5, 11, 18]);
  });

  it("returns bounded excerpts with source line evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "build.log");
    await writeFile(
      filePath,
      [
        "setup",
        "src/index.ts:12:5 - error TS2304",
        "Cannot find name 'missingValue'.",
        "tail detail that should not dominate",
      ].join("\n"),
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "TS2304 missingValue",
      maxTokens: 20,
      contextLines: 1,
      store,
    });

    expect(result.excerpts).toHaveLength(1);
    expect(result.excerpts[0].text).toContain("error TS2304");
    expect(result.excerpts[0].sourceMap.startLine).toBe(1);
    expect(result.excerpts[0].sourceMap.endLine).toBe(3);
    expect(result.estimatedTokens).toBeLessThanOrEqual(20);
  });

  it("retrieves Korean query terms with line evidence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "notes.md");
    await writeFile(filePath, "첫 줄\n토큰 최적화는 원문 근거가 필요합니다\n마지막 줄", "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "토큰 최적화",
      maxTokens: 40,
      contextLines: 0,
      store,
    });

    expect(result.excerpts[0].text).toBe("토큰 최적화는 원문 근거가 필요합니다");
    expect(result.excerpts[0].sourceMap.startLine).toBe(2);
  });

  it("returns a fallback when query terms do not match any line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "notes.txt");
    await writeFile(filePath, "alpha\nbeta", "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "missing",
      maxTokens: 40,
      contextLines: 0,
      store,
    });

    expect(result.excerpts).toEqual([]);
    expect(result.fallbackReason).toBe("no_query_match");
    expect(result.warnings).toContain("query_terms_not_found");
  });

  it("returns a fallback when query tokenization finds no searchable terms", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "notes.txt");
    await writeFile(filePath, "alpha\nbeta", "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "!!!",
      maxTokens: 40,
      contextLines: 0,
      store,
    });

    expect(result.excerpts).toEqual([]);
    expect(result.fallbackReason).toBe("no_query_terms");
    expect(result.warnings).toContain("query_has_no_searchable_terms");
  });

  it("does not cut exact lines when a complete source span exceeds the token budget", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "long.log");
    await writeFile(
      filePath,
      `src/index.ts:1:1 ${"x".repeat(400)} exact tail`,
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "src/index.ts",
      maxTokens: 10,
      contextLines: 0,
      store,
    });

    expect(result.excerpts).toEqual([]);
    expect(result.fallbackReason).toBe("source_span_exceeds_budget");
    expect(result.warnings).toContain("complete_span_required");
  });

  it("preserves exact line text and internal CRLF delimiters in excerpts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "crlf.log");
    await writeFile(filePath, "  before\r\n  src/app.ts:7:2 failed\r\n  after", "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const result = queryArtifact({
      artifactId: artifact.artifactId,
      query: "src/app.ts failed",
      maxTokens: 80,
      contextLines: 1,
      store,
    });

    const expectedText = "  before\r\n  src/app.ts:7:2 failed\r\n  after";
    expect(result.excerpts[0].text).toBe(expectedText);
    expect(result.excerpts[0].sourceMap.startByte).toBe(0);
    expect(result.excerpts[0].sourceMap.endByte).toBe(Buffer.byteLength(expectedText));
    expect(result.excerpts[0].sourceMap.completeSpan).toBe(true);
  });

  it("rejects files outside the allowed root", async () => {
    const allowedRoot = await mkdtemp(join(tmpdir(), "tco-allowed-"));
    const deniedRoot = await mkdtemp(join(tmpdir(), "tco-denied-"));
    const filePath = join(deniedRoot, "secret.txt");
    await writeFile(filePath, "secret=true", "utf8");

    await expect(
      indexArtifact({ path: filePath, store: new MemoryArtifactStore(), allowedRoots: [allowedRoot] }),
    ).rejects.toThrow(/outside allowed roots/);
  });

  it("rejects sibling paths that merely share an allowed-root prefix", async () => {
    const parent = await mkdtemp(join(tmpdir(), "tco-parent-"));
    const allowedRoot = join(parent, "allowed");
    const siblingRoot = join(parent, "allowed-sibling");
    await import("node:fs/promises").then(({ mkdir }) =>
      Promise.all([mkdir(allowedRoot), mkdir(siblingRoot)]),
    );
    const filePath = join(siblingRoot, "data.txt");
    await writeFile(filePath, "outside", "utf8");

    await expect(
      indexArtifact({ path: filePath, store: new MemoryArtifactStore(), allowedRoots: [allowedRoot] }),
    ).rejects.toThrow(/outside allowed roots/);
  });

  it("rejects malformed UTF-8 without changing source hash semantics", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "bad.bin");
    await writeFile(filePath, Buffer.from([0xff, 0xfe, 0xfd]));

    await expect(
      indexArtifact({ path: filePath, store: new MemoryArtifactStore(), allowedRoots: [dir] }),
    ).rejects.toThrow(/valid UTF-8/);
  });

  it("preserves UTF-8 BOM bytes in source maps and hashes original bytes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "bom.txt");
    await writeFile(filePath, Buffer.from([0xef, 0xbb, 0xbf, 0x61]));

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });

    expect(artifact.sha256).toBe(
      createHash("sha256").update(Buffer.from([0xef, 0xbb, 0xbf, 0x61])).digest("hex"),
    );
    expect(artifact.content).toBe("\uFEFFa");
    expect(artifact.sourceMap[0].startByte).toBe(0);
    expect(artifact.sourceMap[0].endByte).toBe(4);
  });

  it("uses canonical path and content hash for artifact identity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const first = join(dir, "first.txt");
    const second = join(dir, "second.txt");
    await writeFile(first, "same", "utf8");
    await writeFile(second, "same", "utf8");

    const store = new MemoryArtifactStore();
    const firstArtifact = await indexArtifact({ path: first, store, allowedRoots: [dir] });
    const secondArtifact = await indexArtifact({ path: second, store, allowedRoots: [dir] });

    expect(firstArtifact.sha256).toBe(secondArtifact.sha256);
    expect(firstArtifact.artifactId).not.toBe(secondArtifact.artifactId);
  });
});

describe("safety policy", () => {
  it("classifies exact-sensitive content and blocks lossy compression", () => {
    const content =
      "src/server/index.ts:42:9 - error TS2339 sha256=abc123 id=build-17";

    const classification = classifyContext(content);

    expect(classification.mode).toBe("exact");
    expect(classification.reasons).toContain("code_or_path");
    expect(classification.reasons).toContain("identifier_or_hash");
    expect(lossyCompressionAllowed(classification)).toBe(false);
  });

  it("fails open to source content when summarizing exact-sensitive artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "exact.log");
    await writeFile(filePath, "api_key=SECRET\nsrc/app.ts:1:1 failed", "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({
      artifactId: artifact.artifactId,
      maxTokens: 30,
      store,
    });

    expect(summary.fallbackReason).toBe("exact_content_requires_source");
    expect(summary.warnings).toContain("lossy_summary_blocked");
    expect(summary.summary).toBe("");
  });

  it("reports only retained complete lines for tight semantic summaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "semantic.txt");
    await writeFile(
      filePath,
      [
        "Alpha words describe the durable planning context.",
        "Beta words describe the repeatable review context.",
        "Gamma words describe the verification context.",
      ].join("\n"),
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({
      artifactId: artifact.artifactId,
      maxTokens: 16,
      store,
    });

    expect(summary.summary).toBe("Alpha words describe the durable planning context.");
    expect(summary.sourceMap).toMatchObject({
      startLine: 1,
      endLine: 1,
    });
  });

  it("returns fallback when a semantic summary cannot include one complete line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "semantic.txt");
    await writeFile(filePath, "Alpha words describe the durable planning context.", "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({
      artifactId: artifact.artifactId,
      maxTokens: 2,
      store,
    });

    expect(summary.summary).toBe("");
    expect(summary.sourceMap).toBeNull();
    expect(summary.fallbackReason).toBe("summary_span_exceeds_budget");
  });

  it("blocks lossy summaries for uncertain and visual content", async () => {
    expect(lossyCompressionAllowed(classifyContext("diagram screenshot layout"))).toBe(false);
    expect(lossyCompressionAllowed(classifyContext("ZXCV-99117"))).toBe(false);
  });

  it("uses mode-specific fallback reasons for blocked lossy summaries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const visualPath = join(dir, "visual.txt");
    const unknownPath = join(dir, "unknown.txt");
    await writeFile(visualPath, "diagram screenshot layout", "utf8");
    await writeFile(unknownPath, "ambiguous fragment", "utf8");

    const store = new MemoryArtifactStore();
    const visualArtifact = await indexArtifact({ path: visualPath, store, allowedRoots: [dir] });
    const unknownArtifact = await indexArtifact({ path: unknownPath, store, allowedRoots: [dir] });

    expect(
      summarizeArtifact({ artifactId: visualArtifact.artifactId, maxTokens: 20, store })
        .fallbackReason,
    ).toBe("visual_content_requires_source");
    expect(
      summarizeArtifact({ artifactId: unknownArtifact.artifactId, maxTokens: 20, store })
        .fallbackReason,
    ).toBe("unknown_content_requires_source");
  });

  it("classifies ordinary code syntax as exact even without file names or errors", () => {
    const classification = classifyContext("const user = getUser();\nreturn user.name;");

    expect(classification.mode).toBe("exact");
    expect(classification.reasons).toContain("code_syntax");
    expect(lossyCompressionAllowed(classification)).toBe(false);
  });

  it.each([
    ["bearer secret", "Authorization: Bearer abc.def.ghi"],
    ["pem private key", "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"],
    ["curl command", "curl https://example.com/resource --header Accept: application/json"],
    ["html markup", "<div data-id=\"app\">Hello</div>"],
    ["sudo command", "sudo curl https://example.com/resource --header Accept: application/json"],
    ["echo command", "echo Deploy the application before verification."],
    ["absolute path", "Copy /etc/hosts before deployment. Preserve this path exactly."],
    ["dsn", "Use postgres://alice:hunter@db/prod. Keep this secret exactly."],
    ["request id", "Use request-id abcdefghijklmno. Preserve it exactly."],
    ["html comment", "<!-- Preserve this exact server-side include. -->"],
    ["doas make command", "doas make deploy before release."],
    ["make command", "make deploy TARGET=production."],
    ["mailto uri", "mailto:ops@example.com"],
    ["srv path", "/srv/app/config.toml"],
    ["request id underscore", "request_id abcdef"],
    ["doctype declaration", "<!DOCTYPE html>"],
    ["sqlite uri", "sqlite:/srv/app.db"],
    ["sudo option wrapper", "sudo -u deploy make release."],
    ["doas option wrapper", "doas -u deploy make release."],
    ["sudo long option wrapper", "sudo --preserve-env make deploy."],
    ["env assignment wrapper", "env TARGET=production make deploy."],
    ["sudo systemctl wrapper", "sudo -u deploy systemctl restart nginx."],
    ["env terraform wrapper", "env TARGET=production terraform apply changes."],
    ["script path in prose", "Use scripts/deploy.sh during release."],
    ["request id with colon", "Keep request_id: abcdef unchanged."],
    ["sql query prose", "Run SELECT email FROM users WHERE status = active."],
    ["chmod phrase", "Please run chmod u+x deploy before the scheduled release."],
    ["generic filename", "Use release-notes.txt during launch for production operations."],
    ["helm phrase", "Please run helm upgrade before the scheduled production release."],
    ["trace token", "Preserve trace abcdefghijkl through the entire support workflow."],
    ["config key", "Set feature_flag enabled before the scheduled production release."],
    ["helm command shape without cue verb", "Use helm upgrade before the scheduled production release."],
    ["chmod command shape without cue verb", "Use chmod u+x deploy before the scheduled release."],
  ])("classifies %s as exact", (_name, content) => {
    const classification = classifyContext(content);

    expect(classification.mode).toBe("exact");
    expect(lossyCompressionAllowed(classification)).toBe(false);
  });

  it("classifies curl command by command/path policy without relying on secrets", () => {
    const classification = classifyContext(
      "curl --request GET --header Accept:application/json example.local/resource",
    );

    expect(classification.mode).toBe("exact");
    expect(classification.reasons).toContain("code_or_path");
  });

  it.each([
    ["sudo curl https://example.com/resource --header Accept: application/json"],
    ["echo Deploy the application before verification."],
    ["Copy /etc/hosts before deployment. Preserve this path exactly."],
    ["Use postgres://alice:hunter@db/prod. Keep this secret exactly."],
    ["Use request-id abcdefghijklmno. Preserve it exactly."],
    ["<!-- Preserve this exact server-side include. -->"],
    ["doas make deploy before release."],
    ["make deploy TARGET=production."],
    ["mailto:ops@example.com"],
    ["/srv/app/config.toml"],
    ["request_id abcdef"],
    ["<!DOCTYPE html>"],
    ["sqlite:/srv/app.db"],
    ["sudo -u deploy make release."],
    ["doas -u deploy make release."],
    ["sudo --preserve-env make deploy."],
    ["env TARGET=production make deploy."],
    ["sudo -u deploy systemctl restart nginx."],
    ["env TARGET=production terraform apply changes."],
    ["Use scripts/deploy.sh during release."],
    ["Keep request_id: abcdef unchanged."],
    ["Run SELECT email FROM users WHERE status = active."],
    ["Please run chmod u+x deploy before the scheduled release."],
    ["Use release-notes.txt during launch for production operations."],
    ["Please run helm upgrade before the scheduled production release."],
    ["Preserve trace abcdefghijkl through the entire support workflow."],
    ["Set feature_flag enabled before the scheduled production release."],
    ["Use helm upgrade before the scheduled production release."],
    ["Use chmod u+x deploy before the scheduled release."],
  ])("blocks lossy summaries for exact counterexample %#", async (content) => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "exact.txt");
    await writeFile(filePath, content, "utf8");

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({
      artifactId: artifact.artifactId,
      maxTokens: 80,
      store,
    });

    expect(summary.summary).toBe("");
    expect(summary.fallbackReason).toBe("exact_content_requires_source");
    expect(summary.warnings).toContain("lossy_summary_blocked");
  });

  it("blocks summaries when exact-shaped content appears after initial summary candidate lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "late-exact.txt");
    await writeFile(
      filePath,
      [
        "Alpha context looks like ordinary planning prose.",
        "Beta context looks like ordinary planning prose.",
        "Gamma context looks like ordinary planning prose.",
        "Delta context looks like ordinary planning prose.",
        "Epsilon context looks like ordinary planning prose.",
        "Zeta context looks like ordinary planning prose.",
        "/srv/app/config.toml",
      ].join("\n"),
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 80, store });

    expect(summary.summary).toBe("");
    expect(summary.fallbackReason).toBe("exact_content_requires_source");
  });

  it("blocks summaries when wrapped commands appear after initial summary candidate lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "late-command.txt");
    await writeFile(
      filePath,
      [
        "Alpha context looks like ordinary planning prose.",
        "Beta context looks like ordinary planning prose.",
        "Gamma context looks like ordinary planning prose.",
        "Delta context looks like ordinary planning prose.",
        "Epsilon context looks like ordinary planning prose.",
        "Zeta context looks like ordinary planning prose.",
        "sudo -u deploy make release.",
      ].join("\n"),
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 80, store });

    expect(summary.summary).toBe("");
    expect(summary.fallbackReason).toBe("exact_content_requires_source");
  });

  it("blocks summaries when exact technical tokens appear after initial candidate lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "late-technical-token.txt");
    await writeFile(
      filePath,
      [
        "Alpha context looks like ordinary planning prose.",
        "Beta context looks like ordinary planning prose.",
        "Gamma context looks like ordinary planning prose.",
        "Delta context looks like ordinary planning prose.",
        "Epsilon context looks like ordinary planning prose.",
        "Zeta context looks like ordinary planning prose.",
        "Set feature_flag enabled before the scheduled production release.",
      ].join("\n"),
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 80, store });

    expect(summary.summary).toBe("");
    expect(summary.fallbackReason).toBe("exact_content_requires_source");
  });

  it("blocks summaries when command shapes appear after initial candidate lines without cue verbs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "late-command-shape.txt");
    await writeFile(
      filePath,
      [
        "Alpha context looks like ordinary planning prose.",
        "Beta context looks like ordinary planning prose.",
        "Gamma context looks like ordinary planning prose.",
        "Delta context looks like ordinary planning prose.",
        "Epsilon context looks like ordinary planning prose.",
        "Zeta context looks like ordinary planning prose.",
        "Use helm upgrade before the scheduled production release.",
      ].join("\n"),
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: 80, store });

    expect(summary.summary).toBe("");
    expect(summary.fallbackReason).toBe("exact_content_requires_source");
  });

  it("preserves blank lines inside reported semantic summary source ranges", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tco-"));
    const filePath = join(dir, "semantic-blank-lines.txt");
    await writeFile(
      filePath,
      [
        "Alpha context explains the planning outcome clearly.",
        "",
        "Beta context explains the review outcome clearly.",
      ].join("\n"),
      "utf8",
    );

    const store = new MemoryArtifactStore();
    const artifact = await indexArtifact({ path: filePath, store, allowedRoots: [dir] });
    const summary = summarizeArtifact({
      artifactId: artifact.artifactId,
      maxTokens: 80,
      store,
    });

    expect(summary.summary).toBe(
      [
        "Alpha context explains the planning outcome clearly.",
        "",
        "Beta context explains the review outcome clearly.",
      ].join("\n"),
    );
    expect(summary.sourceMap).toMatchObject({
      startLine: 1,
      endLine: 3,
    });
  });
});

describe("token estimation", () => {
  it("estimates text tokens conservatively and reports profile metadata", () => {
    const result = estimateContext({
      text: "one two three four five six seven eight",
      maxTokens: 100,
    });

    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(result.fitsBudget).toBe(true);
    expect(result.profileVersion).toMatch(/^heuristic-/);
    expect(result.confidence).toBe("low");
  });
});

describe("project configuration", () => {
  it("installs only runtime plugin files into a target directory", async () => {
    const target = await mkdtemp(join(tmpdir(), "tco-install-target-"));
    const expectedRuntimeFiles = [
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "bin/token-context-optimizer.mjs",
      "skills/optimize-context/SKILL.md",
    ];

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/install-local-plugin.mjs",
      "--target",
      target,
      "--no-marketplace",
    ]);
    const result = JSON.parse(stdout);

    expect(result.target).toBe(target);
    expect(result.copiedFiles).toEqual(expectedRuntimeFiles);
    expect(await listFiles(target)).toEqual(expectedRuntimeFiles);
    for (const runtimeFile of expectedRuntimeFiles) {
      await expect(access(join(target, runtimeFile))).resolves.toBeUndefined();
    }
    await expect(access(join(target, "node_modules"))).rejects.toThrow();
    await expect(access(join(target, "dist"))).rejects.toThrow();
    await expect(access(join(target, ".git"))).rejects.toThrow();
  });

  it("verifies an installed plugin can index a separate allowed workspace", async () => {
    const target = await mkdtemp(join(tmpdir(), "tco-installed-target-"));
    await execFileAsync(process.execPath, [
      "scripts/install-local-plugin.mjs",
      "--target",
      target,
      "--no-marketplace",
    ]);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/verify-installed-plugin.mjs",
      "--plugin-root",
      target,
    ]);
    const result = JSON.parse(stdout);

    expect(result.ok).toBe(true);
    expect(result.pluginRoot).toBe(target);
    expect(result.indexedLineCount).toBe(2);
    expect(result.indexedPath).toContain("artifact.txt");
    expect(result.deniedPluginRootIndex).toBe(true);
  });

  it("writes a marketplace entry for the installed plugin", async () => {
    const marketplaceRoot = await mkdtemp(join(tmpdir(), "tco-marketplace-root-"));
    const target = join(marketplaceRoot, ".codex", "plugins", "token-context-optimizer");
    const marketplacePath = join(marketplaceRoot, ".agents", "plugins", "marketplace.json");

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/install-local-plugin.mjs",
      "--target",
      target,
      "--marketplace",
      marketplacePath,
    ]);
    const result = JSON.parse(stdout);
    const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));

    expect(result.marketplacePath).toBe(marketplacePath);
    expect(result.marketplaceEntry).toMatchObject({
      name: "token-context-optimizer",
      source: {
        source: "local",
        path: "./.codex/plugins/token-context-optimizer",
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Productivity",
    });
    expect(marketplace.name).toBe("personal");
    expect(marketplace.interface.displayName).toBe("Personal");
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]).toEqual(result.marketplaceEntry);
  });

  it("uses the same USERPROFILE default root for install and verification", async () => {
    const userRoot = await mkdtemp(join(tmpdir(), "tco-default-userprofile-"));
    const env = {
      ...process.env,
      USERPROFILE: userRoot,
      CODEX_HOME: "",
      TCO_PLUGIN_INSTALL_DIR: "",
      TCO_PLUGIN_MARKETPLACE_PATH: "",
    };

    const installed = await execFileAsync(process.execPath, ["scripts/install-local-plugin.mjs"], {
      env,
    });
    const installResult = JSON.parse(installed.stdout);
    const expectedTarget = join(userRoot, ".codex", "plugins", "token-context-optimizer");

    expect(installResult.target).toBe(expectedTarget);
    expect(installResult.marketplacePath).toBe(
      join(userRoot, ".agents", "plugins", "marketplace.json"),
    );

    const verified = await execFileAsync(process.execPath, ["scripts/verify-installed-plugin.mjs"], {
      env,
    });
    const verifyResult = JSON.parse(verified.stdout);

    expect(verifyResult.ok).toBe(true);
    expect(verifyResult.pluginRoot).toBe(expectedTarget);
    expect(verifyResult.deniedPluginRootIndex).toBe(true);
  });

  it("keeps default CODEX_HOME targets inside the matching marketplace root", async () => {
    const root = await mkdtemp(join(tmpdir(), "tco-default-codex-home-"));
    const codexHome = join(root, "custom-codex");
    const userProfile = join(root, "profile");

    const { stdout } = await execFileAsync(process.execPath, ["scripts/install-local-plugin.mjs"], {
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        USERPROFILE: userProfile,
        TCO_PLUGIN_INSTALL_DIR: "",
        TCO_PLUGIN_MARKETPLACE_PATH: "",
      },
    });
    const result = JSON.parse(stdout);
    const marketplace = JSON.parse(
      await readFile(join(root, ".agents", "plugins", "marketplace.json"), "utf8"),
    );

    expect(result.target).toBe(join(codexHome, "plugins", "token-context-optimizer"));
    expect(result.marketplacePath).toBe(join(root, ".agents", "plugins", "marketplace.json"));
    expect(marketplace.plugins[0].source.path).toBe("./custom-codex/plugins/token-context-optimizer");
  });

  it("rejects an existing target that does not belong to this plugin", async () => {
    const target = await mkdtemp(join(tmpdir(), "tco-conflicting-target-"));
    const mcpPath = join(target, ".mcp.json");
    await writeFile(mcpPath, "{\"unrelated\":true}", "utf8");

    await expect(
      execFileAsync(process.execPath, [
        "scripts/install-local-plugin.mjs",
        "--target",
        target,
      ]),
    ).rejects.toThrow();
    await expect(readFile(mcpPath, "utf8")).resolves.toBe("{\"unrelated\":true}");
  });

  it("preflights every runtime source before modifying an existing install", async () => {
    const source = await mkdtemp(join(tmpdir(), "tco-missing-source-"));
    await mkdir(join(source, ".codex-plugin"), { recursive: true });
    await mkdir(join(source, "skills", "optimize-context"), { recursive: true });
    await writeFile(
      join(source, ".codex-plugin", "plugin.json"),
      "{\"name\":\"token-context-optimizer\",\"version\":\"0.1.0\"}",
      "utf8",
    );
    await writeFile(join(source, ".mcp.json"), "{\"replacement\":true}", "utf8");
    await writeFile(
      join(source, "skills", "optimize-context", "SKILL.md"),
      "# replacement",
      "utf8",
    );

    const target = await mkdtemp(join(tmpdir(), "tco-existing-install-"));
    await mkdir(join(target, ".codex-plugin"), { recursive: true });
    await writeFile(
      join(target, ".codex-plugin", "plugin.json"),
      "{\"name\":\"token-context-optimizer\",\"version\":\"0.1.0\"}",
      "utf8",
    );
    await writeFile(join(target, ".mcp.json"), "{\"original\":true}", "utf8");

    await expect(
      execFileAsync(
        process.execPath,
        [
          join(process.cwd(), "scripts", "install-local-plugin.mjs"),
          "--target",
          target,
        ],
        { cwd: source },
      ),
    ).rejects.toThrow();
    await expect(readFile(join(target, ".mcp.json"), "utf8")).resolves.toBe(
      "{\"original\":true}",
    );
  });

  it("rejects non-file runtime destinations before modifying an existing install", async () => {
    const target = await mkdtemp(join(tmpdir(), "tco-non-file-destination-"));
    await mkdir(join(target, ".codex-plugin"), { recursive: true });
    const manifestPath = join(target, ".codex-plugin", "plugin.json");
    await writeFile(
      manifestPath,
      "{\"name\":\"token-context-optimizer\",\"version\":\"0.1.0\",\"sentinel\":\"original\"}",
      "utf8",
    );
    await mkdir(join(target, ".mcp.json"));

    await expect(
      execFileAsync(process.execPath, [
        "scripts/install-local-plugin.mjs",
        "--target",
        target,
        "--no-marketplace",
      ]),
    ).rejects.toThrow(/regular file/);
    await expect(readFile(manifestPath, "utf8")).resolves.toContain("\"sentinel\":\"original\"");
  });

  it("restores existing runtime files when a later copy fails", async () => {
    const source = await mkdtemp(join(tmpdir(), "tco-failing-copy-source-"));
    await mkdir(join(source, ".codex-plugin"), { recursive: true });
    await mkdir(join(source, "bin"), { recursive: true });
    await mkdir(join(source, "skills", "optimize-context"), { recursive: true });
    await writeFile(
      join(source, ".codex-plugin", "plugin.json"),
      "{\"name\":\"token-context-optimizer\",\"version\":\"0.1.0\",\"sentinel\":\"replacement\"}",
      "utf8",
    );
    await writeFile(join(source, ".mcp.json"), "{\"replacement\":true}", "utf8");
    await writeFile(join(source, "bin", "token-context-optimizer.mjs"), "replacement", "utf8");
    await writeFile(
      join(source, "skills", "optimize-context", "SKILL.md"),
      "# replacement",
      "utf8",
    );

    const target = await mkdtemp(join(tmpdir(), "tco-existing-install-rollback-"));
    await mkdir(join(target, ".codex-plugin"), { recursive: true });
    await mkdir(join(target, "bin"), { recursive: true });
    await mkdir(join(target, "skills", "optimize-context"), { recursive: true });
    const sentinels = new Map([
      [".codex-plugin/plugin.json", "{\"name\":\"token-context-optimizer\",\"version\":\"0.1.0\",\"sentinel\":\"original\"}"],
      [".mcp.json", "{\"original\":true}"],
      ["bin/token-context-optimizer.mjs", "original bundle"],
      ["skills/optimize-context/SKILL.md", "# original"],
    ]);
    for (const [runtimeFile, content] of sentinels) {
      await writeFile(join(target, runtimeFile), content, "utf8");
    }

    await expect(
      execFileAsync(
        process.execPath,
        [
          join(process.cwd(), "scripts", "install-local-plugin.mjs"),
          "--target",
          target,
          "--no-marketplace",
          "--simulate-copy-failure-after",
          "1",
        ],
        { cwd: source },
      ),
    ).rejects.toThrow(/Simulated copy failure/);

    for (const [runtimeFile, content] of sentinels) {
      await expect(readFile(join(target, runtimeFile), "utf8")).resolves.toBe(content);
    }
  });

  it("preserves an existing marketplace when marketplace replacement fails", async () => {
    const marketplaceRoot = await mkdtemp(join(tmpdir(), "tco-marketplace-rollback-"));
    const target = join(marketplaceRoot, ".codex", "plugins", "token-context-optimizer");
    const marketplacePath = join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
    const originalMarketplace = [
      "{",
      "  \"name\": \"personal\",",
      "  \"plugins\": [{\"name\":\"existing\",\"source\":\"./plugins/existing\"}]",
      "}",
      "",
    ].join("\n");
    await mkdir(join(marketplaceRoot, ".agents", "plugins"), { recursive: true });
    await writeFile(marketplacePath, originalMarketplace, "utf8");

    await expect(
      execFileAsync(process.execPath, [
        "scripts/install-local-plugin.mjs",
        "--target",
        target,
        "--marketplace",
        marketplacePath,
        "--simulate-marketplace-write-failure",
      ]),
    ).rejects.toThrow(/Simulated marketplace write failure/);

    await expect(readFile(marketplacePath, "utf8")).resolves.toBe(originalMarketplace);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/install-local-plugin.mjs",
      "--target",
      target,
      "--marketplace",
      marketplacePath,
    ]);
    expect(JSON.parse(stdout).ok).toBe(true);
  });

  it("rejects symlinked destination components when the platform can create them", async () => {
    const realParent = await mkdtemp(join(tmpdir(), "tco-real-parent-"));
    const linkParent = `${realParent}-link`;
    try {
      await symlink(realParent, linkParent, "junction");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
        return;
      }
      throw error;
    }

    await expect(
      execFileAsync(process.execPath, [
        "scripts/install-local-plugin.mjs",
        "--target",
        join(linkParent, "plugin"),
      ]),
    ).rejects.toThrow();
  });

  it("rejects nested symlinked install components before copying runtime files", async () => {
    const target = await mkdtemp(join(tmpdir(), "tco-owned-symlink-target-"));
    await mkdir(join(target, ".codex-plugin"), { recursive: true });
    await writeFile(
      join(target, ".codex-plugin", "plugin.json"),
      "{\"name\":\"token-context-optimizer\",\"version\":\"0.1.0\"}",
      "utf8",
    );

    const externalBin = await mkdtemp(join(tmpdir(), "tco-external-bin-"));
    const externalBundle = join(externalBin, "token-context-optimizer.mjs");
    await writeFile(externalBundle, "external sentinel", "utf8");
    try {
      await symlink(externalBin, join(target, "bin"), "junction");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
        return;
      }
      throw error;
    }

    await expect(
      execFileAsync(process.execPath, [
        "scripts/install-local-plugin.mjs",
        "--target",
        target,
        "--no-marketplace",
      ]),
    ).rejects.toThrow(/symlinked path component/);
    await expect(readFile(externalBundle, "utf8")).resolves.toBe("external sentinel");
  });

  it("verifier rejects installed MCP configs without the plugin server", async () => {
    const target = await mkdtemp(join(tmpdir(), "tco-installed-invalid-mcp-"));
    await execFileAsync(process.execPath, [
      "scripts/install-local-plugin.mjs",
      "--target",
      target,
      "--no-marketplace",
    ]);
    await writeFile(join(target, ".mcp.json"), "{\"other\":{\"command\":\"node\"}}", "utf8");

    await expect(
      execFileAsync(process.execPath, [
        "scripts/verify-installed-plugin.mjs",
        "--plugin-root",
        target,
      ]),
    ).rejects.toThrow(/token-context-optimizer server/);
  });

  it("verifier rejects MCP configs that launch outside the installed bundle", async () => {
    const target = await mkdtemp(join(tmpdir(), "tco-installed-external-mcp-"));
    await execFileAsync(process.execPath, [
      "scripts/install-local-plugin.mjs",
      "--target",
      target,
      "--no-marketplace",
    ]);
    const externalServerRoot = await mkdtemp(join(tmpdir(), "tco-external-server-"));
    const externalBundle = join(externalServerRoot, "server.mjs");
    await cp(join(target, "bin", "token-context-optimizer.mjs"), externalBundle);
    await writeFile(join(target, "bin", "token-context-optimizer.mjs"), "process.exit(42);\n", "utf8");
    await writeFile(
      join(target, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "token-context-optimizer": {
            command: "node",
            args: [externalBundle],
            cwd: ".",
          },
        },
      }),
      "utf8",
    );

    await expect(
      execFileAsync(process.execPath, [
        "scripts/verify-installed-plugin.mjs",
        "--plugin-root",
        target,
      ]),
    ).rejects.toThrow(/installed bundle/);
  });

  it("points Codex and npm launch paths at the checked-in bundled server", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    const mcpConfig = JSON.parse(await readFile(".mcp.json", "utf8"));
    const entrypoint = packageJson.bin["token-context-optimizer"];

    expect(entrypoint).toBe("./bin/token-context-optimizer.mjs");
    expect(mcpConfig.mcpServers["token-context-optimizer"]).toMatchObject({
      command: "node",
      args: ["./bin/token-context-optimizer.mjs"],
      cwd: ".",
    });
    expect(mcpConfig.mcpServers["token-context-optimizer"].env).toBeUndefined();
    expect(mcpConfig.mcpServers["token-context-optimizer"].env_vars).toContain(
      "TCO_ALLOWED_ROOTS",
    );
  });

  it("provides starter prompts required by the Codex plugin interface schema", async () => {
    const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));

    expect(manifest.interface.defaultPrompt).toEqual([
      "Optimize a large artifact before loading it into Codex.",
      "Classify this context before summarizing it.",
      "Index this file and retrieve source-backed excerpts.",
    ]);
  });

  it("rejects malformed complete MCP stdout lines", () => {
    expect(() =>
      parseCompleteJsonMessages({
        buffer: "{\"jsonrpc\":\"2.0\",\"id\":1}\nnot-json\n",
        consumedLines: 0,
      }),
    ).toThrow(/Malformed MCP stdout line: not-json/);
  });

  it("waits for complete MCP stdout lines before parsing", () => {
    const parsed = parseCompleteJsonMessages({
      buffer: "{\"jsonrpc\":\"2.0\"",
      consumedLines: 0,
    });

    expect(parsed.messages).toEqual([]);
    expect(parsed.consumedLines).toBe(0);
  });
});

async function listFiles(root: string): Promise<string[]> {
  const output: string[] = [];

  async function visit(relativeRoot: string): Promise<void> {
    const absoluteRoot = join(root, relativeRoot);
    const entries = await readdir(absoluteRoot, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(relativePath);
      } else {
        output.push(relativePath);
      }
    }
  }

  await visit("");
  return output.sort();
}
