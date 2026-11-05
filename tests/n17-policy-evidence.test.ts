import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

const api = await import("../scripts/analyze-n17-policy.mjs" as string);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const canonical = (v: any): string => JSON.stringify(v, function (_k, value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value;
});
const digest = (v: any) => hash(canonical(v));
const variants = ["A", "A-prime", "B"];
const semantic = { mode: "semantic", reasons: ["natural_language"], warnings: [] };
const secret = { mode: "exact", reasons: ["secret"], warnings: ["lossy_compression_not_allowed"] };
const h = hash("source");
function orders() {
  const all = [["A", "A-prime", "B"], ["A", "B", "A-prime"], ["A-prime", "A", "B"],
    ["A-prime", "B", "A"], ["B", "A", "A-prime"], ["B", "A-prime", "A"]];
  let seed = 0x4e173001;
  const random = () => { let n = seed += 0x6d2b79f5; n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
  return Array.from({ length: 8 }, () => { const rows = [...all];
    for (let i = 5; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    return rows;
  }).flat();
}
function fixture() {
  const manifest: any = {
    schema: "n17-policy-performance/v1", version: 1,
    protocol: api.PROTOCOL, seeds: { shuffle: 0x4e173001, bootstrap: 0x4e173002 },
    variants: Object.fromEntries(variants.map(v => [v, { sourceSha256: h, buildSha256: h }])),
    artifacts: { runner: { sha256: h } }, environment: { node: "test" },
    recipes: ["good", "bad"].map(id => ({ id, bytes: 4, inputSha256: hash(id),
      expectedOutputs: { A: semantic, "A-prime": semantic, B: id === "good" ? secret : semantic },
      expectedOutputHashes: { A: digest(semantic), "A-prime": digest(semantic), B: digest(id === "good" ? secret : semantic) },
    })),
  };
  seal(manifest);
  const artifact: any = { schema: manifest.schema, version: 1, attempt: 1, complete: true,
    manifestSha256: manifest.manifestSha256, environment: manifest.environment,
    artifactHashes: { runner: h }, variantHashes: manifest.variants, warmupSamples: [], samples: [] };
  for (const recipe of manifest.recipes) {
    const schedule = orders();
    for (const phase of ["warmup", "measurement"]) {
      const count = phase === "warmup" ? 12 : 36;
      for (let round = 0; round < count; round++) {
        const order = schedule[round + (phase === "warmup" ? 0 : 12)];
        order.forEach((variant: string, position: number) => {
          const row = { recipeId: recipe.id, phase, round, block: Math.floor(round / 6), position, variant,
            elapsedNs: 100, inputSha256: recipe.inputSha256, sourceSha256: h, buildSha256: h,
            output: structuredClone(recipe.expectedOutputs[variant]), outputHash: recipe.expectedOutputHashes[variant] };
          (phase === "warmup" ? artifact.warmupSamples : artifact.samples).push(row);
        });
      }
    }
  }
  return { manifest, artifact };
}
function seal(m: any) { delete m.manifestSha256; m.manifestSha256 = digest(m); }
function result(mutate?: (m: any, a: any) => void) {
  const { manifest: m, artifact: a } = fixture(); mutate?.(m, a); return api.analyze(m, a);
}

describe("N-17 evidence validation and statistics", () => {
  it("accepts approved distinct baseline/current literal outputs", () => {
    const r = result(); expect(r.status).toBe("PASS"); expect(r.recipes[0].pointEstimate).toBe(1);
    expect(r.recipes[0].aaRatio).toBe(1); expect(r.retryEligible).toBe(false);
  });
  it.each([null, {}, { samples: "bad" }])("returns INVALID for malformed artifact %j", a => {
    expect(api.analyze(fixture().manifest, a).status).toBe("INVALID");
  });
  it.each([null, {}, { recipes: "bad" }])("returns INVALID for malformed manifest %j", m => {
    expect(api.analyze(m, fixture().artifact).status).toBe("INVALID");
  });
  it.each([
    ["missing row", (_m: any, a: any) => a.samples.pop()],
    ["duplicate row", (_m: any, a: any) => { a.samples[1] = structuredClone(a.samples[0]); }],
    ["wrong block", (_m: any, a: any) => { a.samples[0].block = 1; }],
    ["wrong warmup block", (_m: any, a: any) => { a.warmupSamples[0].block = 1; }],
    ["wrong warmup position", (_m: any, a: any) => { a.warmupSamples[0].position = 7; }],
    ["missing warmup", (_m: any, a: any) => { a.warmupSamples = []; }],
    ["wrong input hash", (_m: any, a: any) => { a.samples[0].inputSha256 = hash("wrong"); }],
    ["wrong source hash", (_m: any, a: any) => { a.samples[0].sourceSha256 = hash("wrong"); }],
    ["wrong build hash", (_m: any, a: any) => { a.samples[0].buildSha256 = hash("wrong"); }],
    ["wrong runner hash", (_m: any, a: any) => { a.artifactHashes.runner = hash("wrong"); }],
    ["changed environment", (_m: any, a: any) => { a.environment = { node: "other" }; }],
    ["incomplete attempt", (_m: any, a: any) => { a.complete = false; }],
  ] as const)("rejects %s independently", (_name, mutate) => expect(result(mutate).status).toBe("INVALID"));
  it.each([0, -1, NaN, Infinity])("rejects elapsed time %s", value => {
    expect(result((_m, a) => { a.samples[0].elapsedNs = value; }).status).toBe("INVALID");
  });
  it.each(["warmupSamples", "samples"])("rejects rehashed wrong output in %s", key => {
    expect(result((_m, a) => { const wrong = { mode: "visual", reasons: ["visual_context"], warnings: [] };
      a[key][0].output = wrong; a[key][0].outputHash = digest(wrong); }).status).toBe("INVALID");
  });
  it("rejects a seed change even when manifest digest is recomputed", () => {
    expect(result((m, a) => { m.seeds.shuffle++; seal(m); a.manifestSha256 = m.manifestSha256; }).status).toBe("INVALID");
  });
  it("rejects a missing oracle even with a correct manifest digest", () => {
    expect(result((m, a) => { delete m.recipes[0].expectedOutputs.B; seal(m); a.manifestSha256 = m.manifestSha256; }).status).toBe("INVALID");
  });
  it("rejects duplicate recipe IDs", () => {
    expect(result((m, a) => { m.recipes[1].id = "good"; seal(m); a.manifestSha256 = m.manifestSha256; }).status).toBe("INVALID");
  });
  it("rejects repeated order within a block", () => {
    expect(result((_m, a) => { for (const r of a.samples) r.variant = variants[r.position]; }).status).toBe("INVALID");
  });
  it.each([0.96, 1.04])("invalidates paired A-prime/A %s", factor => {
    const r = result((_m, a) => { for (const row of a.samples) if (row.variant === "A-prime") row.elapsedNs *= factor; });
    expect(r.status).toBe("INVALID"); expect(r.recipes[0].aaRatio).toBeCloseTo(factor);
  });
  it("keeps valid FAIL terminal alongside local INVALID", () => {
    const r = result((_m, a) => {
      a.samples = a.samples.filter((row: any) => row.recipeId !== "good");
      for (const row of a.samples) if (row.variant === "B") row.elapsedNs = 110;
    });
    expect(r.status).toBe("INVALID"); expect(r.recipes[1].status).toBe("FAIL"); expect(r.retryEligible).toBe(false);
  });
  it("never retries an interrupted attempt that already has a complete failing recipe", () => {
    const r = result((_m, a) => { a.complete = false;
      for (const row of a.samples) if (row.recipeId === "good" && row.variant === "B") row.elapsedNs = 108;
      a.samples = a.samples.filter((row: any) => row.recipeId !== "bad"); });
    expect(r.status).toBe("INVALID"); expect(r.retryEligible).toBe(false);
  });
  it("hashes object keys in locale-independent code-unit order", () => {
    expect(api.canonical({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}');
  });
  it("matches independently calculated Python PRNG, order and bootstrap literals", () => {
    const random = api.mulberry32(0x4e173001);
    expect([random(), random(), random()]).toEqual([0.5791191377211362, 0.448816052172333, 0.8977202572859824]);
    expect(api.schedule().slice(0, 6).map((r: string[]) => r.join(","))).toEqual([
      "A,A-prime,B", "B,A,A-prime", "A,B,A-prime", "B,A-prime,A", "A-prime,A,B", "A-prime,B,A",
    ]);
    expect(api.bootstrapMedian([[1,1,1,1,1,100], [2,2,2,2,2,100], [3,3,3,3,3,100],
      [4,4,4,4,4,100], [5,5,5,5,5,100], [6,6,6,6,6,100]]).ci).toEqual([2, 6]);
  });
  it.each([0.97, 1.03])("includes A-prime/A boundary %s", factor => {
    const r = result((_m, a) => { for (const row of a.samples) if (row.variant === "A-prime") row.elapsedNs = 100 * factor; });
    expect(r.recipes[0].aaRatio).toBeCloseTo(factor); expect(r.recipes[0].status).not.toBe("INVALID");
  });
  it("keeps point and CI exactly 1.03 at PASS", () => {
    const r = result((_m, a) => { for (const row of a.samples) if (row.variant === "B") row.elapsedNs = 103; });
    expect(r.recipes[0].pointEstimate).toBe(1.03); expect(r.recipes[0].bootstrap.ci).toEqual([1.03, 1.03]); expect(r.status).toBe("PASS");
  });
  it("rejects ratios that overflow from finite sample values without throwing", () => {
    expect(result((_m, a) => { for (const row of a.samples) row.elapsedNs = row.variant === "B" ? Number.MAX_VALUE : Number.MIN_VALUE; }).status).toBe("INVALID");
  });
  it("allows only the first invalid attempt to request retry", () => {
    expect(result((_m, a) => a.samples.pop()).retryEligible).toBe(true);
    expect(result((_m, a) => { a.attempt = 2; a.samples.pop(); }).retryEligible).toBe(false);
  });
  it("computes arithmetic-mean drift sorted by round, diagnostically", () => {
    const r = result((_m, a) => {
      for (const row of a.warmupSamples) if (row.variant === "A") row.elapsedNs = row.round < 6 ? (row.round === 0 ? 11 : 1) : 4;
      for (const row of a.samples) row.elapsedNs = row.round < 18 ? (row.round === 0 ? 19 : 1) : 4;
      a.warmupSamples.reverse(); a.samples.reverse();
    });
    expect(r.status).toBe("PASS"); expect(r.recipes[0].drift.A.warmupBackFront).toBeCloseTo(1.5);
    expect(r.recipes[0].drift.A.measuredBackFront).toBeCloseTo(2);
  });
  it("bootstraps complete blocks with the median of all 36 values", () => {
    const blocks = [[1,1,1,1,1,100], [2,2,2,2,2,100], [3,3,3,3,3,100],
      [4,4,4,4,4,100], [5,5,5,5,5,100], [6,6,6,6,6,100]];
    // Median of six block medians is 3.5; actual pooled positions18/19 are both4.
    const r = api.bootstrapMedian(blocks); expect(r.pointEstimate).toBe(4);
    expect(r).toEqual(api.bootstrapMedian(blocks)); expect(r.ci[0]).toBeLessThanOrEqual(4);
    expect(r.ci[1]).toBeGreaterThanOrEqual(4); expect(api.type7([1, 2, 3, 4], .25)).toBe(1.75);
    expect(api.median([1, 2, 4, 100])).toBe(3);
  });
  it("marks point-under-threshold with upper CI above threshold BORDERLINE", () => {
    const r = result((_m, a) => { for (const row of a.samples) if (row.variant === "B") row.elapsedNs = row.block < 3 ? 98 : 106; });
    expect(r.recipes[0].pointEstimate).toBeCloseTo(1.02); expect(r.status).toBe("BORDERLINE");
  });
});

describe("N-17 measurement recipes", () => {
  it("requires identical manifest and recomputed analysis before granting attempt two", async () => {
    const runner = await import("../scripts/measure-n17-policy.mjs" as string);
    const { manifest: m, artifact: a } = fixture(); a.samples.pop();
    expect(runner.retryAllowed(m, a)).toBe(true);
    a.analysis = api.analyze(m, a); expect(runner.retryAllowed(m, a)).toBe(true);
    a.analysis.status = "PASS"; expect(runner.retryAllowed(m, a)).toBe(false);
    a.analysis = null; a.manifestSha256 = hash("foreign"); expect(runner.retryAllowed(m, a)).toBe(false);
    const valid = fixture(); expect(runner.retryAllowed(valid.manifest, valid.artifact)).toBe(false);
    for (const row of valid.artifact.samples) if (row.variant === "B") row.elapsedNs = 110;
    expect(runner.retryAllowed(valid.manifest, valid.artifact)).toBe(false);
  });
  it("constructs seven exact UTF-8 worst inputs with the approved repetition structure", async () => {
    const runner = await import("../scripts/measure-n17-policy.mjs" as string);
    const worst = runner.RECIPES.filter((r: any) => r.kind === "worst");
    expect(worst).toHaveLength(7);
    for (const recipe of worst) {
      const bytes = runner.recipeInput(recipe);
      expect(bytes.length).toBe(10 * 1024 * 1024);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (recipe.id === "ko-repeated-space") expect(text.startsWith("비밀 번호 비밀 번호 ")).toBe(true);
      else {
        expect(text.startsWith("비밀번호")).toBe(true);
        expect(text.slice(4).trim()).toBe("");
        expect(text.indexOf("비밀번호", 1)).toBe(-1);
      }
      expect(recipe.expectedOutputs.B).toEqual({ mode: "unknown", reasons: ["insufficient_semantic_signal"], warnings: ["lossy_compression_not_allowed"] });
    }
  });
  it("keeps representative inputs short and gives the Korean change distinct literal outputs", async () => {
    const runner = await import("../scripts/measure-n17-policy.mjs" as string);
    for (const recipe of runner.RECIPES.filter((r: any) => r.kind !== "worst")) expect(runner.recipeInput(recipe).length).toBeLessThan(200);
    const korean = runner.RECIPES.find((r: any) => r.id === "ko-positive-literal");
    expect(korean.expectedOutputs.A).toEqual(semantic); expect(korean.expectedOutputs.B).toEqual(secret);
    expect(runner.RECIPES.find((r: any) => r.id === "numeric").expectedOutputs.B).toEqual({ mode: "exact", reasons: ["numeric_or_table"], warnings: ["lossy_compression_not_allowed"] });
  });
});
