// S-10 harness probe (scratch, kept as evidence for the run1 D1 self-check failure).
// argv: <dist artifacts.js> <10 MiB empty-line fixture> <root> <plain|thenTiny|wrapped|directStore>
// Measures residual heapUsed+external after a budget-sized flush put, before and after one
// setTimeout tick. Usage: node --expose-gc research/src/s10-store-bound-harness-probe.mjs ...
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const [mod, file, root, mode] = process.argv.slice(2);
const m = await import(pathToFileURL(mod).href);
const gc3 = () => { gc(); gc(); gc(); };
const lvl = () => { const x = process.memoryUsage(); return x.heapUsed + x.external; };
const tiny = root + '/tiny.txt'; writeFileSync(tiny, 'tiny');
gc3(); const base = lvl();
const max = m.defaultArtifactStore.maxEstimatedBytes;
const flush = () => m.defaultArtifactStore.put({ artifactId: 'flush' + Math.random(), path: '/f', sha256: '0', byteLength: (max - 32768) / 2, lineCount: 0, content: '', sourceMap: [] });
if (mode === 'plain') { await m.indexArtifact({ path: file, allowedRoots: [root] }); }
if (mode === 'thenTiny') { await m.indexArtifact({ path: file, allowedRoots: [root] }); await m.indexArtifact({ path: tiny, allowedRoots: [root] }); }
if (mode === 'wrapped') { await (async () => { await m.indexArtifact({ path: file, allowedRoots: [root] }); })(); }
if (mode === 'directStore') { const st = new m.MemoryArtifactStore(); await m.indexArtifact({ path: file, store: st, allowedRoots: [root] }); st.put({ artifactId: 'f', path: '/f', sha256: '0', byteLength: (max - 32768) / 2, lineCount: 0, content: '', sourceMap: [] }); console.log('direct count', st.entries.size); }
flush();
gc3();
const r1 = lvl() - base;
await new Promise((r) => setTimeout(r, 50));
gc3();
console.log(JSON.stringify({ mode, afterFlushMiB: (r1 / 1048576).toFixed(1), afterTickMiB: ((lvl() - base) / 1048576).toFixed(1), defaultCount: m.defaultArtifactStore.entries.size }));
