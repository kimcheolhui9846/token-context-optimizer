// Planning-only: pinned Git inputs, read-only dist, untimed in-memory candidate.
// Usage: node <PR>/research/src/n32-quoted-label-impact.mjs <built-f612-checkout> --out <file>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

assert(process.argv.length === 5 && process.argv[3] === '--out', 'usage: script <built-f612-checkout> --out <file>');
const root = resolve(process.argv[2]), out = resolve(process.argv[4]);
const BASE = 'f612f081985f43fe37af4bb1f1e1e73bc003e290';
const PRE = '3e4c9720e4d95e54ba369e6fc919b69cd61b3caa';
const POLICY_SHA = '308043afc87102079a8b8a082199afaf26301d88f8253ffb349e0d7b1ba7174e';
const sha = x => createHash('sha256').update(x).digest('hex');
const lf = x => x.replaceAll('\r\n', '\n');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024 });
const blobs = new Map();
const blob = (file, ref = BASE) => { const key = `${ref}:${file}`; if (!blobs.has(key)) blobs.set(key, lf(git(['show', key]))); return blobs.get(key); };
const list = ref => git(['ls-tree', '-rz', '--name-only', ref]).split('\0').filter(Boolean).sort();
const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const ts = createRequire(resolve(root, 'package.json'))('typescript');
const source = blob('src/core/policy.ts');
assert.equal(git(['rev-parse', 'HEAD']).trim(), BASE, 'use a checkout at the pinned baseline');
assert.equal(sha(source), POLICY_SHA, 'baseline source hash mismatch');
assert.equal(lf(readFileSync(resolve(root, 'src/core/policy.ts'), 'utf8')), source, 'dirty policy source');
assert.equal(blob('src/core/policy.ts', PRE), source, 'predesign policy differs');
const distPath = resolve(root, 'dist/src/core/policy.js');
const dist = readFileSync(distPath, 'utf8'), distHash = sha(dist);
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
assert.equal(dist, compiled, 'dist is stale or not the pinned source build');
const predesign = JSON.parse(blob('research/results/n32/2026-11-07.json'));
const parse = s => new RegExp(s.slice(1, s.lastIndexOf('/')), s.slice(s.lastIndexOf('/') + 1));
const newLiterals = predesign.candidates.find(c => c.id === 'U3').sources;
const suffix = String.raw`(?:\*{1,3}|["')”’）」』])?`;
const oldLiterals = newLiterals.map(s => { assert.equal(s.split(suffix).length, 2); return s.replace(suffix, String.raw`\*{0,3}`); });
const oldRegexes = oldLiterals.map(parse), newRegexes = newLiterals.map(parse);
assert.deepEqual(newRegexes.map(r => r.flags), ['iu', 'i', 'i', 'i']);
let changed = dist;
const regexes = oldLiterals.map((old, i) => {
  assert.equal(source.split(old).length, 2); assert.equal(changed.split(old).length, 2);
  changed = changed.replace(old, () => newLiterals[i]);
  return { file: 'src/core/policy.ts', line: source.slice(0, source.indexOf(old)).split('\n').length, old, new: newLiterals[i], flags: newRegexes[i].flags, oldSha256: sha(old), newSha256: sha(newLiterals[i]) };
});
assert.notEqual(changed, dist);
const instrument = (text, tag) => import('data:text/javascript;base64,' + Buffer.from(text + '\nexport { EXACT_PATTERNS };\n//' + tag).toString('base64'));
const product = await import(pathToFileURL(distPath).href);
const A = await instrument(dist, 'A'), Aprime = await instrument(dist, 'A-prime'), B = await instrument(changed, 'B');
const tuple = (m, s) => { const p = m.EXACT_PATTERNS[0][1]; return typeof p === 'function' ? p(s) : p.test(s); };
const oldHit = s => oldRegexes.some(r => r.test(s)), newHit = s => newRegexes.some(r => r.test(s));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cache = new Map();
function compare(text) {
  if (!cache.has(text)) {
    const before = A.classifyContext(text), after = B.classifyContext(text);
    assert.deepEqual(before, product.classifyContext(text));
    cache.set(text, { before, after, tuple0: { before: tuple(A, text), after: tuple(B, text) }, modeChanged: before.mode !== after.mode, reasonsChanged: !same(before.reasons, after.reasons), warningsChanged: !same(before.warnings, after.warnings) });
  }
  return cache.get(text);
}
const planSource = f => /^(?:research\/plans|docs\/agent\/handoffs)\//.test(f);
function collector() {
  const seen = new Set(), positives = new Set(), changes = new Map(), files = new Set(); let occurrences = 0;
  return {
    add(kind, file, location, text) {
      if (!text.trim()) return;
      occurrences++; files.add(file); const key = kind + '\0' + text;
      const a = oldHit(text), b = newHit(text); assert(!a || b, 'lost current positive');
      seen.add(key); if (a) positives.add(key);
      if (!b || a) return;
      if (!changes.has(key)) changes.set(key, { kind, textSha256: sha(text), ...compare(text), sources: new Map(), occurrences: 0 });
      const row = changes.get(key); row.occurrences++;
      row.sources.set(JSON.stringify([file, location]), { file, ...location });
    },
    finish() {
      const rows = [...changes.values()].map(r => ({ ...r, sources: [...r.sources.values()].sort((a,b) => order(JSON.stringify(a),JSON.stringify(b))) })).sort((a,b) => order(a.kind+a.textSha256,b.kind+b.textSha256));
      const sum = rs => ({ newHits: rs.length, changedOccurrences: rs.reduce((n,r)=>n+r.occurrences,0), modeChanges: rs.filter(r=>r.modeChanged).length, reasonsChanges: rs.filter(r=>r.reasonsChanged).length, warningsChanges: rs.filter(r=>r.warningsChanged).length });
      return { files: files.size, occurrences, uniqueUnits: seen.size, currentPositiveUnits: positives.size, ...sum(rows), excludingPlans: sum(rows.filter(r=>r.sources.some(s=>!planSource(s.file)))), mixedSourceUnits: rows.filter(r=>r.sources.some(s=>planSource(s.file)) && r.sources.some(s=>!planSource(s.file))).length, changes: rows };
    }
  };
}
function markdown(ref) {
  const c = collector(), files = list(ref).filter(f=>f.endsWith('.md'));
  for (const file of files) {
    const text = blob(file, ref);
    text.split('\n').forEach((line,i)=>c.add('line',file,{line:i+1},line));
    const parts = text.split(/\n\s*\n/); let cursor = 0;
    for (const part of parts) { const at = text.indexOf(part,cursor); c.add('paragraph',file,{line:text.slice(0,at).split('\n').length},part); cursor=at+part.length; }
  }
  return { ...c.finish(), trackedFiles: files.length };
}
const preMarkdown = markdown(PRE), baseMarkdown = markdown(BASE);
assert.equal(preMarkdown.newHits, 8); assert.equal(preMarkdown.modeChanges, 1);
assert.equal(preMarkdown.excludingPlans.modeChanges, 0); assert.equal(preMarkdown.excludingPlans.reasonsChanges, 2);
const groups = { ordinary: collector(), historicalResearch: collector(), researchCode: collector() };
const rawCode = collector();
const inventory = { codeFiles: 0, jsonFiles: 0, excluded: ['bin/**', 'package-lock.json'], otherTrackedFiles: list(BASE).filter(f=>!(/\.(?:md|ts|js|mjs|cjs|json)$/.test(f))), dynamicExpressions: 'Not evaluated; N27 generated matrix and boundary literals are checked separately.' };
for (const file of list(BASE)) {
  if (file.startsWith('bin/') || file === 'package-lock.json') continue;
  const c = groups[file.startsWith('research/results/') ? 'historicalResearch' : file.startsWith('research/') ? 'researchCode' : 'ordinary'];
  if (/\.(?:ts|js|mjs|cjs)$/.test(file)) {
    inventory.codeFiles++; const text = blob(file), sf = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
    text.split('\n').forEach((line,i)=>rawCode.add('raw-code-line',file,{line:i+1},line));
    const walk = n => { if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) c.add('code',file,{line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1},n.text); ts.forEachChild(n,walk); }; walk(sf);
  } else if (file.endsWith('.json')) {
    inventory.jsonFiles++; const value = JSON.parse(blob(file).replace(/^\uFEFF/,''));
    const walk = (v, pointer) => { if(typeof v==='string') c.add('json',file,{jsonPointer:pointer},v); else if(v&&typeof v==='object') for(const[k,x]of Object.entries(v)) walk(x,pointer+'/'+k.replaceAll('~','~0').replaceAll('/','~1')); }; walk(value,'');
  }
}
const staticStrings = Object.fromEntries(Object.entries(groups).map(([k,c])=>[k,c.finish()]));

const testFile='tests/policy-n27.test.ts', test=blob(testFile);
const start=test.indexOf('const outputs ='), end=test.indexOf('const oldRegexes ='); assert(start>=0&&end>start);
const emitted=ts.transpileModule(test.slice(start,end)+'\n globalThis.result = {cases, matrix};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {cases}=runInNewContext(emitted+'\nresult',{}, {timeout:1000}); assert.equal(cases.length,468);
const migrations=[];
for(const row of cases) {
  const actual=compare(row.content); assert(same(actual.before,row.after), 'existing literal differs from baseline');
  if(same(actual.before,actual.after)) continue;
  const [lang,label,form,placement]=row.name.split('/'); assert(['dquote','squote','paren'].includes(form));
  const needle=JSON.stringify([lang,label]).slice(0,-1).replace(',', ', ');
  const index=test.indexOf(needle); assert(index>=0, 'matrix row location missing');
  migrations.push({id:row.name,file:testFile,line:test.slice(0,index).split('\n').length,assertionLine:test.slice(0,test.indexOf('expect(classifyContext(content)).toEqual(after)')).split('\n').length,lang,label,form,placement,input:row.content,...actual});
}
assert.equal(migrations.length,78); assert.equal(migrations.filter(r=>r.modeChanged).length,72);
const e3File='tests/policy-f21-rework.test.ts', e3=blob(e3File);
const oldE3=oldRegexes[1].source,newE3=newRegexes[1].source; assert(e3.includes(oldE3));
const structural={id:'E3-source',file:e3File,line:e3.slice(0,e3.indexOf('const APPROVED_E3_SOURCE')).split('\n').length,assertionLine:e3.slice(0,e3.indexOf('expect(current.f21CredentialLabel?.source)')).split('\n').length,before:oldE3,after:newE3,flags:'i'};

// Prove that the cheap raw-text prefilter follows the product's actual call chain.
const callSites = [
  'return f21CredentialLabel.test(content);',
  'return typeof predicate === "function" ? predicate(content) : predicate.test(content);',
  'hasCredentialLabel(content) ||\n    KOREAN_CREDENTIAL_LABEL.test(content) ||\n    KOREAN_API_CREDENTIAL_LABEL.test(content)',
  'for (const [reason, pattern] of EXACT_PATTERNS) {\n    if (matchesPolicyPredicate(pattern, content))',
  'return classifyContextUnchecked(content);',
].map(text=>{const at=source.indexOf(text);assert(at>=0,'raw call chain changed');return {file:'src/core/policy.ts',line:source.slice(0,at).split('\n').length,text};});
const sourceReferences=[];
const tails=[String.raw`\*{0,3}\s*[:=：]`,String.raw`\\*{0,3}\\s*[:=：]`];
for(const file of list(BASE).filter(f=>/\.(?:ts|js|mjs|cjs)$/.test(f)&&!f.startsWith('bin/'))) {
  blob(file).split('\n').forEach((text,i)=>{
    const matches=oldRegexes.flatMap((r,n)=>text.includes(r.source)||text.includes(r.source.replaceAll('\\','\\\\'))?[n]:[]);
    if(matches.length||tails.some(t=>text.includes(t))) sourceReferences.push({file,line:i+1,regexIndexes:matches,textSha256:sha(text)});
  });
}
const boundaryStart=test.indexOf('const boundaryCases ='),boundaryEnd=test.indexOf('it.each(boundaryCases)');
assert(boundaryStart>0&&boundaryEnd>boundaryStart);
const boundaryCode=ts.transpileModule(test.slice(boundaryStart,boundaryEnd)+'\n globalThis.result=boundaryCases;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const boundaryRows=runInNewContext(boundaryCode+'\nresult',{}, {timeout:1000});
for(const row of boundaryRows){const actual=compare(row.content);assert(same(actual.before,row.after));assert(same(actual.after,row.after));assert.equal(actual.tuple0.after,row.tuple0);}
const differentialStart=test.indexOf('it("preserves every frozen old positive'),differentialEnd=test.indexOf('// Nine verbatim');
const differentialExcerpt=test.slice(differentialStart,differentialEnd);assert(differentialStart>0&&differentialEnd>differentialStart);
assert(differentialExcerpt.includes('if(old.test(content))'));assert(differentialExcerpt.includes('approvedRegexes[i].test(content)'));
const structuralAudit={sourceReferences,callSites,n27BoundaryPlacements:boundaryRows.length,n27BoundaryChanges:0,n27Differential:{file:testFile,line:test.slice(0,differentialStart).split('\n').length,excerpt:differentialExcerpt,assessment:'Only old-positive implication is asserted; approvedRegexes stays the frozen N27 contract. No equality to current sources or rejection of additional U3 positives. Tuple ordering and slice(1) equality remain unchanged.'},assessment:'Only the F21 E3 source equality requires migration. Source literals in product are the four planned edits; N27 approvedRegexes are frozen historical inputs, not current source assertions. Historical research probes stay unchanged.'};

for(const file of ['scripts/measure-n27-policy.mjs','scripts/analyze-n27-policy.mjs']) assert.equal(lf(readFileSync(resolve(root,file),'utf8')),blob(file),'dirty N27 tool');
const {RECIPES,recipeInput}=await import(pathToFileURL(resolve(root,'scripts/measure-n27-policy.mjs')).href);
const {PROTOCOL,SEEDS}=await import(pathToFileURL(resolve(root,'scripts/analyze-n27-policy.mjs')).href);
const unknown={mode:'unknown',reasons:['insufficient_semantic_signal'],warnings:['lossy_compression_not_allowed']};
const extra=[
  ['quoted-password-nbsp-60','"password"'+'\u00a0'.repeat(60)+' '],
  ['quoted-password-nbsp-8','"password"'+'\u00a0'.repeat(8)],
  ['quoted-password-wide-8','"password"'+'\u3000'.repeat(8)],
  ['quoted-password-space','"password" '], ['paren-password-space','(password) '],
  ['quoted-korean-nbsp-8','"비밀번호"'+'\u00a0'.repeat(8)],
  ['corner-korean-nbsp-8','「비밀번호」'+'\u00a0'.repeat(8)],
  ['quoted-api-ko-nbsp-8','"api키"'+'\u00a0'.repeat(8)]
].map(([id,unit])=>({id,kind:'worst',prefix:'',unit,expectedOutputs:{A:unknown,'A-prime':unknown,B:unknown}}));
const recipes=[];
for(const recipe of [...RECIPES,...extra]) {
  const bytes=recipeInput(recipe),input=bytes.toString('utf8'); assert.equal(bytes.length,10*1024*1024);
  const expectedTuple0=recipe.id==='ko-credential-10mib';
  for(const[name,m]of Object.entries({A,'A-prime':Aprime,B})) { assert.deepEqual(m.classifyContext(input),recipe.expectedOutputs[name],recipe.id+'/'+name); assert.equal(tuple(m,input),expectedTuple0,recipe.id+'/'+name+' tuple0'); }
  recipes.push({id:recipe.id,kind:recipe.kind,prefix:recipe.prefix,unit:recipe.unit,bytes:bytes.length,inputSha256:sha(bytes),expectedOutputs:recipe.expectedOutputs,expectedTuple0:{A:expectedTuple0,'A-prime':expectedTuple0,B:expectedTuple0}});
}
assert.equal(recipes.length,28); assert.equal(sha(readFileSync(distPath)),distHash,'dist changed during survey');
const preservedFiles=['src/core/policy.ts','tests/policy-n27.test.ts','tests/policy-f21-rework.test.ts','tests/helpers/policy-baseline-n27.ts','scripts/measure-n27-policy.mjs','scripts/analyze-n27-policy.mjs','tests/n27-policy-evidence.test.ts',...list(BASE).filter(f=>f.startsWith('docs/research/evidence/n27/'))];
const result={schema:'n32-plan-impact/v1',base:BASE,predesignBase:PRE,performanceMeasured:false,provenance:{policySha256Lf:sha(source),distSha256:distHash,distMatchesSource:true,distUnchanged:true,typescript:ts.version,scriptSha256Lf:sha(lf(readFileSync(new URL(import.meta.url),'utf8'))),preservedFiles:Object.fromEntries(preservedFiles.map(f=>[f,sha(blob(f))]))},regexes,markdown:{predesign:preMarkdown,baseline:baseMarkdown},staticStrings:{inventory,...staticStrings},migrations:{count:79,behaviorCount:78,modeChanges:72,reasonsOnly:6,rows:migrations,structural:[structural]},performancePlan:{protocol:PROTOCOL,seeds:SEEDS,warmupCells:1008,measuredCells:3024,totalCells:4032,recipes},limitations:['Static literals and JSON string values only; arbitrary runtime-generated inputs are not an exhaustive execution trace.','All unchanged tuple0 inputs are unchanged by the verified four-literal-only candidate; full classification runs on new tuple0 hits and synthetic migrations/recipes.','Corpus raw text is not serialized; approved synthetic migration inputs and recipe units are included.','These in-memory modules are for untimed impact/output checks, never for the performance campaign.']};
result.structuralAudit = structuralAudit;
result.provenance.node = process.version;
result.migrations.warningsChanges = migrations.filter(r=>r.warningsChanged).length;
result.migrations.count = migrations.length + result.migrations.structural.length;
result.performancePlan.warmupCells = recipes.length * PROTOCOL.warmupRounds * 3;
result.performancePlan.measuredCells = recipes.length * PROTOCOL.measuredRounds * 3;
result.performancePlan.totalCells = result.performancePlan.warmupCells + result.performancePlan.measuredCells;
result.rawCodeLines = rawCode.finish();
result.codeSyntaxExamples = ['def login(password):','def verify(token):','(token) => token','.map((pass) => pass)','(secret)===x'].map(input=>({input,...compare(input)}));
const identifiers = ['f21CredentialLabel','hasCredentialLabel','KOREAN_CREDENTIAL_LABEL','KOREAN_API_CREDENTIAL_LABEL'];
const policyAst = ts.createSourceFile('policy.ts',source,ts.ScriptTarget.Latest,true);
structuralAudit.identifierReferences = Object.fromEntries(identifiers.map(name=>[name,[]]));
const identifiersWalk = n => { if(ts.isIdentifier(n)&&identifiers.includes(n.text)) structuralAudit.identifierReferences[n.text].push({line:policyAst.getLineAndCharacterOfPosition(n.getStart(policyAst)).line+1,kind:ts.SyntaxKind[n.parent.kind]}); ts.forEachChild(n,identifiersWalk); }; identifiersWalk(policyAst);
for(const refs of Object.values(structuralAudit.identifierReferences)) assert.equal(refs.length,2,'unexpected reference outside the raw tuple0 chain');
structuralAudit.n27EvidenceTest = {file:'tests/n27-policy-evidence.test.ts',sha256Lf:sha(blob('tests/n27-policy-evidence.test.ts')),assessment:'Directly inspected: synthetic manifest/sample fixtures and recipesManifest generator/output-hash checks only. No read/hash assertion against live policy source or dist; historical evidence test stays unchanged.'};
result.limitations.push('Static group files counts only files contributing a nonblank string; inventory counts every parsed file. Raw code lines are a separate exploratory surface, not actual classifier inputs. JSON keys/whole files and arbitrary runtime-generated inputs are not covered by the literal-value survey.');
mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({base:BASE,markdown:{files:baseMarkdown.trackedFiles,newHits:baseMarkdown.newHits,mode:baseMarkdown.modeChanges,reasons:baseMarkdown.reasonsChanges,excludingPlans:baseMarkdown.excludingPlans},static:Object.fromEntries(Object.entries(staticStrings).map(([k,v])=>[k,{newHits:v.newHits,mode:v.modeChanges,reasons:v.reasonsChanges}])),migrations:79,recipes:28,performanceMeasured:false}));
