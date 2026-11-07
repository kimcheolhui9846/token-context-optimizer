import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const api = await import("../scripts/analyze-n32-policy.mjs" as string);
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
    schema: "n32-policy-performance/v1", version: 1, campaign: {firstAttempt: 1, maxAttempt: 2},
    protocol: api.PROTOCOL, seeds: { shuffle: 0x4e173001, bootstrap: 0x4e173002 },
    variants: Object.fromEntries(variants.map(v => [v, { path: `dist/${v}.js`, sourceSha256: h, buildSha256: h }])),
    artifacts: { runner: { sha256: h } }, environment: { node: "test" },
    recipes: ["good", "bad", ...Array.from({length:26}, (_,i)=>`extra-${i}`)].map(id => ({ id, kind: "worst", bytes: 10485760, prefix: "", unit: "x", generator: {version:1, unit:"x", padding:"ascii-space"}, inputSha256: hash(id),
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

describe("N-32 evidence validation and statistics", () => {
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


describe("N32 campaign additions", () => {
 it.each([999999,1000000,1000001])("enforces representative median floor at %s ns", ns => {
   const r=result((m,a)=>{m.recipes.forEach((r:any)=>r.kind="representative");seal(m);a.manifestSha256=m.manifestSha256;a.samples.forEach((r:any)=>r.elapsedNs=ns);});
   expect(r.status).toBe(ns<1000000?"INVALID":"PASS");
   expect(r.recipes[0].variantMedianNs).toEqual({A:ns,"A-prime":ns,B:ns});
 });
 it("reports six round-ratio block medians without retrying BORDERLINE",()=>{
  const r=result((_m,a)=>a.samples.forEach((r:any)=>{if(r.variant==="B")r.elapsedNs=r.block<3?98:106;}));
  expect(r.status).toBe("BORDERLINE");expect(r.retryEligible).toBe(false);
  expect(r.recipes[0].blockMedians).toEqual([.98,.98,.98,1.06,1.06,1.06]);
 });
 it("enforces identical prior analysis and refuses FAIL/foreign manifest retry",async()=>{
  const runner=await import("../scripts/measure-n32-policy.mjs" as string);
  const {manifest:m,artifact:a}=fixture();a.samples.pop();expect(runner.retryAllowed(m,a)).toBe(true);
  a.analysis=api.analyze(m,a);expect(runner.retryAllowed(m,a)).toBe(true);
  a.analysis.status="PASS";expect(runner.retryAllowed(m,a)).toBe(false);
  a.analysis=null;a.manifestSha256=hash("foreign");expect(runner.retryAllowed(m,a)).toBe(false);
  const f=fixture();f.artifact.samples.forEach((r:any)=>{if(r.variant==="B")r.elapsedNs=110;});
  expect(runner.retryAllowed(f.manifest,f.artifact)).toBe(false);
 });
 it("accepts only fresh campaign attempts1/2",async()=>{
  const r=await import("../scripts/measure-n32-policy.mjs" as string);
  expect(r.attemptRange(1)).toEqual({first:1,last:2});expect(r.attemptRange(2)).toEqual({first:1,last:2});
  for(const n of [0,3,4,"1",null])expect(r.attemptRange(n)).toBeNull();
  expect(r.attemptRange(2,{firstAttempt:2,maxAttempt:3})).toBeNull();
 });
 it("rejects historical N17 and malformed campaign",()=>{
  expect(result((m,a)=>{m.schema=a.schema="n17-policy-performance/v1";seal(m);a.manifestSha256=m.manifestSha256;}).status).toBe("INVALID");
  expect(result((m,a)=>{delete m.campaign;seal(m);a.manifestSha256=m.manifestSha256;}).status).toBe("INVALID");
 });
 it("pins complete approved generator units and literal output hashes",async()=>{
  const r=await import("../scripts/measure-n32-policy.mjs" as string);
  const recipes=r.recipesManifest();expect(recipes).toHaveLength(28);
  expect(recipes.filter((x:any)=>x.kind==="representative")).toHaveLength(5);
  const units=["**password**"+"\u00a0".repeat(60),"**password**"+"\u00a0".repeat(8),"**비밀번호**"+"\u00a0".repeat(8),"**password**"+"\u3000".repeat(8),"password************ ","**password** ","**passwd**"+"\u00a0".repeat(60),"**api키**"+"\u00a0".repeat(8),"비밀 번호 "];
  expect(recipes.slice(0,9).map((x:any)=>x.unit)).toEqual(units);
  for(const recipe of recipes){expect(recipe.bytes).toBe(10485760);expect(recipe.generator.version).toBe(1);
   for(const v of variants)expect(recipe.expectedOutputHashes[v]).toBe(digest(recipe.expectedOutputs[v]));}
  expect(recipes.find((x:any)=>x.id==="starred-passwd-nbsp-60").inputSha256).toBe("fa620fdbb9c166656065526890e74e8b83fe2da2d4100b812cd54bef85bb8c26");
  expect(recipes.find((x:any)=>x.id==="starred-api-ko-nbsp-8").inputSha256).toBe("5f71e3faac3397e3ea9f0ccd7940f21429aef5f77af1b2a56a10f4cff358ec15");
  expect(recipes.find((x:any)=>x.id==="quoted-password-nbsp-60").unit).toBe('"password"' + "\u00a0".repeat(60) + " ");
  expect(recipes.find((x:any)=>x.id==="corner-korean-nbsp-8").unit).toBe("\u300C비밀번호\u300D" + "\u00a0".repeat(8));
  expect(recipes.find((x:any)=>x.id==="quoted-password-nbsp-60").inputSha256).toBe("51c5c29485c49e311eb7076106824076e3354fbaf029a0b7990bab5af3c81e41");
  expect(recipes.find((x:any)=>x.id==="corner-korean-nbsp-8").inputSha256).toBe("bf4ff26ef7dfdd3d68fde06c9340ad62417ad904fc1a3d94d392961e1507a03f");
  expect(recipes.find((x:any)=>x.id==="ko-credential-10mib").expectedOutputs).toEqual({A:secret,"A-prime":secret,B:secret});
 });
 it("matches every recipe field against the approved performance plan",async()=>{
  const runner=await import("../scripts/measure-n32-policy.mjs" as string);
  const plan=JSON.parse(readFileSync("research/results/n32/2026-11-07-plan-impact.json","utf8")).performancePlan.recipes;
  const recipes=runner.recipesManifest();
  expect(recipes).toHaveLength(plan.length);
  expect(recipes.map((r:any)=>({id:r.id,kind:r.kind,prefix:r.prefix,unit:r.unit,bytes:r.bytes,inputSha256:r.inputSha256,expectedOutputs:r.expectedOutputs,expectedTuple0:r.expectedTuple0}))).toEqual(
    plan.map((r:any)=>({id:r.id,kind:r.kind,prefix:r.prefix,unit:r.unit,bytes:r.bytes,inputSha256:r.inputSha256,expectedOutputs:r.expectedOutputs,expectedTuple0:r.expectedTuple0})));
 });
});
