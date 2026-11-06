// Pinned implementation-baseline survey. No product mutation, performance timers or hosted calls.
// Run npm run build at the pinned source, then node research/src/n27-n30-credential-impact-impl.mjs --out research/results/n27-n30/2026-11-06-implementation-impact.json.
// Extraction helpers below adapt scripts/analyze-f21-uri-impact.mjs; only pure fixture builders are transpiled.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.cwd();
const BASE = "0bc79590f926a38d53b11b470b23926ff9f1377e";
const EXPECTED_DIST_LF_SHA256 = "e90432196ff0cbf785d6f6ba6ee65dd727e7631840e5889922dd16a08a27ca6a";
const require = createRequire(import.meta.url), ts = require("typescript"), moduleWithNodePaths = Module;
const paths = { policy: "src/core/policy.ts", corpus: "tests/helpers/policy-corpus.ts", characterization: "tests/fixtures/policy/characterization.json", benchmark: "benchmarks/run.ts", coreTest: "tests/core.test.ts" };
const unresolvedSites = [], sourceFiles = new Map();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const lf = value => value.replaceAll("\r\n", "\n");
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
function readBaseText(file) {
  if (!sourceFiles.has(file)) {
    const text = git(["show", BASE + ":" + file]);
    sourceFiles.set(file, { text, blob: git(["rev-parse", BASE + ":" + file]).trim(), sha256Lf: sha256(lf(text)) });
  }
  return sourceFiles.get(file).text;
}

function compileModule(source, sourcePath, exportSuffix) {
  const compiledSource = `${source}\n${exportSuffix}\n`;
  const js = ts.transpileModule(compiledSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const module = new Module(sourcePath);
  module.filename = sourcePath;
  module.paths = moduleWithNodePaths._nodeModulePaths(root);
  module._compile(js, sourcePath);
  return module.exports;
}

function isStringNode(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function stringValue(node) {
  return ts.isStringLiteral(node) ? node.text : node.text;
}

function staticString(node) {
  if (!node) return undefined;
  if (isStringNode(node)) return node.text;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "join" && ts.isArrayLiteralExpression(node.expression.expression)) {
    const values = node.expression.expression.elements.map(staticString);
    const separator = staticString(node.arguments[0]);
    if (values.every(v=>typeof v === "string") && typeof separator === "string") return values.join(separator);
  }
  return undefined;
}

function lineContext(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lineText = sourceFile.text.split(/\r?\n/u)[start.line] ?? "";
  return { line: start.line + 1, column: start.character + 1, context: lineText.trim() };
}

function collectClassifierLiterals(filePath) {
  const source = readBaseText(filePath);
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = [];
  const add = (node, context, value) => {
    if (typeof value !== "string") return;
    entries.push({ content: value, ...lineContext(sourceFile, node), context });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["classifyContext", "writeFile"].includes(node.expression.text)) {
      const arg = node.arguments[node.expression.text === "writeFile" ? 1 : 0];
      if (typeof staticString(arg) === "string") add(arg, node.expression.text + " static input", staticString(arg));
      else {
        let resolved;
        for (let scope = node.parent; scope && resolved === undefined; scope = scope.parent) {
          if (ts.isBlock(scope) && arg && ts.isIdentifier(arg)) {
            for (const statement of scope.statements) if (ts.isVariableStatement(statement)) {
              const declaration = statement.declarationList.declarations.find(d=>ts.isIdentifier(d.name)&&d.name.text===arg.text);
              if (declaration?.initializer) resolved = staticString(declaration.initializer);
            }
          }
        }
        if (resolved !== undefined) add(arg, node.expression.text + " resolved local literal", resolved);
        else unresolvedSites.push({file:filePath,...lineContext(sourceFile,node),argument:arg?.getText(sourceFile),note:"dynamic input; each-table input is enumerated separately when present"});
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "each") {
      const table = node.arguments[0];
      if (table && ts.isArrayLiteralExpression(table)) {
        const callback = ts.isCallExpression(node.parent) ? node.parent.arguments[1] : undefined;
        assert(callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)), 'each callback missing');
        const inputIndex = callback.parameters.findIndex(p => p.name.getText(sourceFile) === 'content');
        assert(inputIndex >= 0, 'explicit content parameter required for table extraction');
        for (const row of table.elements) {
          if (ts.isArrayLiteralExpression(row)) {
            const input = row.elements[inputIndex];
            assert(input && isStringNode(input), 'nonliteral table input needs explicit collector');
            add(input, "it.each validated content parameter " + inputIndex, stringValue(input));
          } else if (isStringNode(row)) {
            assert.equal(inputIndex, 0);
            add(row, "it.each row input literal", stringValue(row));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  const safety = sourceFile.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.arguments[0]&&isStringNode(n.expression.arguments[0])&&n.expression.arguments[0].text === (filePath === paths.coreTest ? "safety policy" : "F-21 URI and credential boundaries"));
  assert(safety, `classifier describe missing: ${filePath}`);
  visit(safety);
  return { sourceHash: sha256(source), sourceLfHash: sha256(source.replaceAll("\r\n", "\n")), entries };
}

function collectBenchmarkSources() {
  const source = readBaseText(paths.benchmark);
  const sourceFile = ts.createSourceFile(paths.benchmark, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const entries = [];
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "source" && isStringNode(node.initializer)) {
      const object = node.parent;
      const nameProperty = ts.isObjectLiteralExpression(object)
        ? object.properties.find((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === "name" && isStringNode(property.initializer))
        : undefined;
      entries.push({
        content: stringValue(node.initializer),
        name: nameProperty ? stringValue(nameProperty.initializer) : null,
        ...lineContext(sourceFile, node.initializer),
        context: "benchmark source property literal",
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const prelude = readBaseText("src/core/token-estimator.ts");
  const names=["buildLargeBuildLog","buildSemanticDegradationFixtures","buildCodeContextFixture"];
  const nodes=sourceFile.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));
  assert.equal(nodes.length,3);
  const constants=sourceFile.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&["CODE_CONTEXT_EXPECTED_LINES","CODE_CONTEXT_DISTRACTOR_LINES"].includes(d.name.text)));
  const builders=compileModule(prelude+"\n"+[...constants,...nodes].map(n=>n.getText(sourceFile)).join("\n"),resolve(root,paths.benchmark),"export { "+names.join(",")+" };");
  for(const fixture of builders.buildSemanticDegradationFixtures()) entries.push({name:fixture.name+" (80-line document)",content:Array(80).fill(fixture.source).join("\n"),...lineContext(sourceFile,nodes.find(n=>n.name.text==="buildSemanticDegradationFixtures")),context:"actual repeated semantic benchmark document"});
  entries.push({name:"25K build log",content:builders.buildLargeBuildLog(25000),...lineContext(sourceFile,nodes.find(n=>n.name.text==="buildLargeBuildLog")),context:"actual pure benchmark builder; benchmark runner not invoked"});
  entries.push({name:"8K code context",content:builders.buildCodeContextFixture(8000).source,...lineContext(sourceFile,nodes.find(n=>n.name.text==="buildCodeContextFixture")),context:"actual pure benchmark builder; benchmark runner not invoked"});
  return { sourceHash: sha256(source), sourceLfHash: sha256(source.replaceAll("\r\n", "\n")), entries };
}

function collectGeneratedInputs(corpus) {
  const definitions = [["tests/policy-redos.test.ts","group1DifferentialInputs"],["tests/policy-redos-group2.test.ts","group2DifferentialInputs"],["tests/policy-redos-group3.test.ts","group3DifferentialInputs"],["tests/policy-redos-group4.test.ts","group4Inputs"],["tests/policy-large-input.test.ts","smallDifferentialInputs"]];
  return definitions.flatMap(([file,name])=>{
    const source=readBaseText(file);
    const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
    const node=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert(node, "generator not found: "+name);
    const globals=sf.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&["whitespace","lineTerminators","starts","commands","codeKeywords"].includes(d.name.text))).map(n=>n.getText(sf)).join("\n");
    const module=compileModule("const policyCorpus="+JSON.stringify(corpus)+";\n"+globals+"\n"+node.getText(sf),resolve(root,file),"export { "+name+" };");
    const values=module[name]();assert(Array.isArray(values));
    return values.map((content,index)=>({group:"generated-test-inputs",id:name+":"+index,content,location:{file,...lineContext(sf,node),function:name,index}}));
  });
}



const PRE = '27b4356';
const blob = (rev, file) => git(['show', rev + ':' + file]);
const args = process.argv.slice(2);
assert.equal(args.length, 2); assert.equal(args[0], '--out');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const policy = lf(readBaseText(paths.policy));
const buildInputDelta = git(['diff','--name-only',PRE,BASE,'--','src','package.json','package-lock.json','tsconfig.json','tsconfig.scripts.json']).trim().split('\n').filter(Boolean);
assert.equal(buildInputDelta.length,0,'build inputs changed between bases');
const lockfileSha256Lf=sha256(lf(readBaseText('package-lock.json')));
const workingBuildInputDelta=git(['diff','--name-only',BASE,'--','src','package.json','package-lock.json','tsconfig.json','tsconfig.scripts.json']).trim().split('\n').filter(Boolean);
assert.equal(workingBuildInputDelta.length,0,'working build inputs differ from base');
const untrackedBuildInputs=git(['ls-files','--others','--exclude-standard','--','src','package.json','package-lock.json','tsconfig*.json']).trim().split('\n').filter(Boolean);
assert.equal(untrackedBuildInputs.length,0,'untracked build inputs need explicit review');
assert.equal(policy, lf(blob(PRE,paths.policy)), 'policy changed between pinned bases');
assert.equal(policy, lf(readFileSync(resolve(root,paths.policy),'utf8')), 'working policy differs');
const distPath = 'dist/src/core/policy.js';
const distBytes = readFileSync(resolve(root,distPath));
const distText = lf(distBytes.toString('utf8'));
assert.equal(sha256(distText), EXPECTED_DIST_LF_SHA256, 'stale dist; rebuild pinned base');
// Frozen old literals, not recovered from the candidate. Exact source/flags occurrence is checked.
const oldRegexes = [
  /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\s*[:=]/iu,
  /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\s*[:=]/i,
  /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\s*[:=：]/i,
  /(?<![A-Za-z0-9])api[ \t]?키\s*[:=：]/i,
];
const newRegexes = oldRegexes.map((re,i)=>new RegExp(re.source.replace(i<2?String.raw`\s*[:=]`:String.raw`\s*[:=：]`,String.raw`\*{0,3}\s*[:=：]`),re.flags));
const frozenCandidate=[
  /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\*{0,3}\s*[:=：]/iu,
  /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\*{0,3}\s*[:=：]/i,
  /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\*{0,3}\s*[:=：]/i,
  /(?<![A-Za-z0-9])api[ \t]?키\*{0,3}\s*[:=：]/i,
];
assert.deepEqual(newRegexes.map(String),frozenCandidate.map(String));
function substitute(text,from,to){
  return from.reduce((s,re,i)=>{ const literal=re.toString(); assert.equal(s.split(literal).length-1,1,'literal missing/duplicate: '+literal); return s.replace(literal,to[i].toString()); },text);
}
substitute(policy,oldRegexes,oldRegexes);
assert.throws(()=>substitute(distText,[/deliberately_wrong_literal/],[/x/]),/literal missing/);
const identityText=substitute(distText,oldRegexes,oldRegexes);
assert.equal(identityText,distText);
const candidateText=substitute(distText,oldRegexes,newRegexes);
assert.equal(substitute(candidateText,newRegexes,oldRegexes),distText,'change outside four literals');
const expose='\nexport { EXACT_PATTERNS, KOREAN_CREDENTIAL_LABEL, KOREAN_API_CREDENTIAL_LABEL, f21CredentialLabel };\n';
const memoryModule = text=>import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
const baseline=await import(pathToFileURL(resolve(root,distPath)).href);
const identity=await memoryModule(identityText+expose);
const candidate=await memoryModule(candidateText+expose);
assert.equal(identity.f21CredentialLabel.source,oldRegexes[1].source);
assert.equal(candidate.f21CredentialLabel.source,newRegexes[1].source);
assert.deepEqual(identity.EXACT_PATTERNS.map(x=>x[0]),candidate.EXACT_PATTERNS.map(x=>x[0]));
identity.EXACT_PATTERNS.slice(1).forEach(([,p],i)=>assert.equal(p.toString(),candidate.EXACT_PATTERNS[i+1][1].toString()));
const evaluate=(p,s)=>typeof p==='function'?p(s):p.test(s);
const cache=new Map();
const supersetCounts=oldRegexes.map(()=>({oldPositive:0,newPositive:0,lost:0}));
function analyze(content){
  if(cache.has(content)) return cache.get(content);
  const before=baseline.classifyContext(content), after=candidate.classifyContext(content);
  assert.deepEqual(identity.classifyContext(content),before,'identity classifier differs');
  const oldHits=oldRegexes.map(r=>r.test(content)),newHits=newRegexes.map(r=>r.test(content));
  oldHits.forEach((hit,i)=>{ assert(!hit||newHits[i],'lost old positive'); supersetCounts[i].oldPositive+=+hit;supersetCounts[i].newPositive+=+newHits[i]; });
  const gained=!oldHits.some(Boolean)&&newHits.some(Boolean);
  // Separate output model checks ordered reasons, warnings, and resource fallback.
  const expected=!gained||before.reasons.includes('classification_resource_limit')?before:{mode:'exact',reasons:['secret',...(before.mode==='exact'?before.reasons.filter(r=>r!=='secret'):[])],warnings:['lossy_compression_not_allowed']};
  assert.deepEqual(after,expected,'unexpected output outside tuple0 insertion');
  const predicateFlips=oldHits.flatMap((hit,i)=>hit!==newHits[i]?[{regexIndex:i,before:hit,after:newHits[i]}]:[]);
  const row={baseline:before,candidate:after,oldHits,newHits,predicateFlips,newHit:gained,modeChanged:before.mode!==after.mode,reasonsChanged:!equal(before.reasons,after.reasons),secretIndex:after.reasons.indexOf('secret')};
  cache.set(content,row);return row;
}
// Deterministic failure-path control: inject the same RangeError into tuple1 in two memory copies.
const failSuffix=expose+'\nEXACT_PATTERNS[1][1] = () => { throw new RangeError("Maximum call stack size exceeded"); };';
const failA=await memoryModule(distText+failSuffix),failB=await memoryModule(candidateText+failSuffix);
const resourceControl={content:'Guest wifi **password**: hunter2 is taped under the desk for visitors.',baseline:failA.classifyContext('Guest wifi **password**: hunter2 is taped under the desk for visitors.'),candidate:failB.classifyContext('Guest wifi **password**: hunter2 is taped under the desk for visitors.')};
assert.deepEqual(resourceControl.baseline,resourceControl.candidate);
assert(resourceControl.baseline.reasons.includes('classification_resource_limit'));
function summarize(rows){
  const result={sourceRows:rows.length,newHits:0,modeChanges:0,reasonsChanges:0,reasonsOnlyChanges:0,changed:[],predicateChanged:[]};
  for(const row of rows){const r=analyze(row.content);result.newHits+=+r.newHit;result.modeChanges+=+r.modeChanged;result.reasonsChanges+=+r.reasonsChanged;result.reasonsOnlyChanges+=+(!r.modeChanged&&r.reasonsChanged);if(r.modeChanged||r.reasonsChanged)result.changed.push({...row,...r});if(r.predicateFlips.length)result.predicateChanged.push({...row,...r});}
  return result;
}
function markdown(rev){
  const files=git(['ls-tree','-r','--name-only','-z',rev]).split('\0').filter(f=>f.endsWith('.md')).sort();
  const units=new Map(),filesInfo=[];let raw=0;
  for(const file of files){const text=lf(blob(rev,file));filesInfo.push({file,sha256Lf:sha256(text)});
    for(const [kind,parts] of [['line',text.split('\n')],['paragraph',text.split(/\n\s*\n/u)]])parts.forEach((content,i)=>{if(!content.trim())return;raw++;const key=kind+'\0'+content;if(!units.has(key))units.set(key,{kind,content,sources:[]});units.get(key).sources.push({file,index:i+1});});
  }
  const rows=[...units.values()];
  const isSelf=file=>file.startsWith('research/plans/')||file.startsWith('docs/agent/handoffs/')||file.startsWith('docs/superpowers/plans/');
  return {files:files.length,rawUnits:raw,uniqueUnits:rows.length,filesInfo,...summarize(rows),excludingSelfReferentialOnly:summarize(rows.filter(r=>r.sources.some(s=>!isSelf(s.file)))),selfReferentialDefinition:'research/plans/, docs/agent/handoffs/, docs/superpowers/plans/; exclude only units with no other provenance',rows};
}
const pre=markdown(PRE),base=markdown(BASE);
assert.equal(pre.files,208);assert.equal(pre.uniqueUnits,23720);assert.equal(pre.newHits,9);assert.equal(pre.modeChanges,0);assert.equal(pre.reasonsChanges,9);
const preMap=new Map(pre.filesInfo.map(r=>[r.file,r.sha256Lf])),baseMap=new Map(base.filesInfo.map(r=>[r.file,r.sha256Lf]));
const fileDelta=[...new Set([...preMap.keys(),...baseMap.keys()])].sort().filter(f=>preMap.get(f)!==baseMap.get(f)).map(file=>({file,kind:!preMap.has(file)?'added':!baseMap.has(file)?'removed':'modified',beforeSha256Lf:preMap.get(file)??null,afterSha256Lf:baseMap.get(file)??null}));
const unitKey=r=>r.kind+'\0'+r.content;
const preKeys=new Set(pre.rows.map(unitKey)),baseKeys=new Set(base.rows.map(unitKey));
const markdownDelta={files:fileDelta,added:summarize(base.rows.filter(r=>!preKeys.has(unitKey(r)))),removed:summarize(pre.rows.filter(r=>!baseKeys.has(unitKey(r)))),classifierChanged:buildInputDelta.length>0,buildInputDelta};
delete pre.rows;delete base.rows;

const records=[];
const add=(group,content,location,asserted=null)=>{assert.equal(typeof content,'string');records.push({group,content,location,asserted});};
const corpus=compileModule(readBaseText(paths.corpus),resolve(root,paths.corpus),'').policyCorpus;
const frozen=JSON.parse(readBaseText(paths.characterization)).entries;
const overlays=JSON.parse(readBaseText('tests/fixtures/policy/f21-uri-expectations.json')).entries;
assert.equal(corpus.length,120);assert.deepEqual(corpus.map(x=>[x.id,x.content]),frozen.map(x=>[x.id,x.content]));
const overlayMap=new Map(overlays.map(r=>[r.id,r]));
for(const r of frozen){const expected=overlayMap.get(r.id)?.classification??r.classification;assert.deepEqual(baseline.classifyContext(r.content),expected);add('characterization+F21',r.content,{file:paths.characterization,id:r.id},expected);}
corpus.forEach(r=>add('policyCorpus',r.content,{file:paths.corpus,id:r.id}));
overlays.forEach(r=>add('f21-overlay',r.content,{file:'tests/fixtures/policy/f21-uri-expectations.json',id:r.id},r.classification));
for(const file of [paths.coreTest,'tests/policy-uri-scheme.test.ts'])for(const r of collectClassifierLiterals(file).entries)add('static-test-inputs',r.content,{file,line:r.line,column:r.column,context:r.context});
for(const r of collectGeneratedInputs(corpus))add('generated-test-inputs',r.content,r.location);
for(const r of collectBenchmarkSources().entries)add('benchmark-fixtures',r.content,{file:paths.benchmark,name:r.name,line:r.line});

// Replay only the synchronous N17 case builders. This records inputs/assertions;
// it is NOT a Vitest run and does not replace the actual repository test gate.
const replayCounts=[];
function collectReplay(file,group){
  const source=readBaseText(file),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const body=sf.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(sf)).join('\n');
  let testName='',caseIndex=0,counts;const observed=new WeakMap();
  const run=(name,fn,args=[])=>{testName=name;caseIndex++;counts={file,test:name,classifyCalls:0,fullOutputAssertions:0,otherMatchers:0,internalsCalls:0};replayCounts.push(counts);const returned=fn(...args);assert(!returned||typeof returned.then!=='function','async test requires a different collector');};
  const it=(name,fn)=>run(name,fn);
  it.each=rows=>(name,fn)=>rows.forEach((row,index)=>run(name+' ['+index+']',fn,Array.isArray(row)?row:[row]));
  const describe=(_name,fn)=>fn();
  const classifyContext=content=>{const value=baseline.classifyContext(content);counts.classifyCalls++;add(group,content,{file,test:testName,caseIndex});observed.set(value,records.at(-1));return value;};
  const expect=actual=>{const chain={toEqual(expected){const record=actual&&typeof actual==='object'?observed.get(actual):undefined;if(record){assert.deepEqual(actual,expected,'baseline replay assertion mismatch');record.asserted=expected;counts.fullOutputAssertions++;}else counts.otherMatchers++;},toBe(){counts.otherMatchers++;},toHaveLength(){counts.otherMatchers++;}};chain.not={toEqual(){counts.otherMatchers++;}};return chain;};
  function wrap(p,q,label){const call=content=>{counts.internalsCalls++;const before=evaluate(p,content),after=evaluate(q,content);add(group+'-internals',content,{file,test:testName,caseIndex,predicate:label,before,after});return before;};return typeof p==='function'?call:{test:call,flags:p.flags,toString:()=>p.toString()};}
  const loadPolicyInternals=()=>({...identity,EXACT_PATTERNS:identity.EXACT_PATTERNS.map(([reason,p],i)=>[reason,wrap(p,candidate.EXACT_PATTERNS[i][1],'tuple'+i)]),KOREAN_CREDENTIAL_LABEL:wrap(identity.KOREAN_CREDENTIAL_LABEL,candidate.KOREAN_CREDENTIAL_LABEL,'Korean'),KOREAN_API_CREDENTIAL_LABEL:wrap(identity.KOREAN_API_CREDENTIAL_LABEL,candidate.KOREAN_API_CREDENTIAL_LABEL,'Korean API')});
  const js=ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const f21=compileModule(readBaseText('tests/helpers/policy-baseline-f21.ts'),resolve(root,'tests/helpers/policy-baseline-f21.ts'),'').classifyContext;
  new Function('describe','it','expect','classifyContext','classifyBaseline','loadPolicyInternals','classifyF21',js)(describe,it,expect,classifyContext,()=>({}),loadPolicyInternals,f21);
}
collectReplay('tests/policy-n17.test.ts','n17-classifier-calls');
collectReplay('tests/policy-uri-scheme.test.ts','f21-classifier-calls');
function collectSplit(){
  const file='tests/policy-n17-split.test.ts',source=readBaseText(file),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const names=['koreanLabels','koreanNegativeLabels','koreanCompoundLabels','delimiters','whitespace','contexts','narratives'];
  const declarations=sf.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.every(d=>names.includes(d.name.getText(sf))));
  const fn=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='matrixInputs');assert.equal(declarations.length,7);assert(fn);
  let apiRows;
  function visit(n){if(ts.isCallExpression(n)&&ts.isCallExpression(n.expression)&&n.arguments[0]?.text==='preserves the API lookbehind branch: %s')apiRows=n.expression.arguments[0].elements.map(x=>x.text);ts.forEachChild(n,visit);}visit(sf);assert.equal(apiRows.length,9);
  const mod=compileModule([...declarations,fn].map(n=>n.getText(sf)).join('\n'),resolve(root,file),'export { '+names.join(',')+', matrixInputs };');
  for(const label of [...mod.koreanLabels,...mod.koreanNegativeLabels,...mod.koreanCompoundLabels,...apiRows])mod.matrixInputs(label).forEach((text,index)=>[text,text.normalize('NFD')].forEach((content,normalization)=>add('n17-split-generated',content,{file,label,index,normalization:normalization?'NFD':'original',assertionKind:'frozen Korean predicate differential'})));
}
collectSplit();
const splitPredicateFlipCount=records.filter(r=>r.group==='n17-split-generated'&&analyze(r.content).predicateFlips.length).length;
assert.equal(splitPredicateFlipCount,0,'split predicate expectation migration required');
const fixtureUnique=new Map();for(const {content,group,location,asserted} of records){if(!fixtureUnique.has(content))fixtureUnique.set(content,{content,sources:[]});fixtureUnique.get(content).sources.push({group,...location,...(asserted?{asserted}:{})});}
const fixtures=summarize([...fixtureUnique.values()]);
const conflicts=records.filter(r=>r.asserted&&!equal(analyze(r.content).candidate,r.asserted)).map(r=>({...r,...analyze(r.content)}));

// Site inventory is deliberately conservative: a generated input group is not
// claimed to cover every call in its source file, and integration traces are excluded.
const testFiles=git(['ls-tree','-r','--name-only','-z',BASE]).split('\0').filter(f=>/^tests\/.*\.test\.ts$/u.test(f)).sort();
const testFileInventory=testFiles.map(file=>{
  const source=readBaseText(file),sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),sites=[];
  const classifyNames=new Set(['classifyContext']);
  sf.statements.filter(ts.isImportDeclaration).forEach(n=>n.importClause?.namedBindings?.elements?.forEach(e=>{if((e.propertyName??e.name).text==='classifyContext')classifyNames.add(e.name.text);}));
  function visit(n){if(ts.isCallExpression(n)){
    const name=ts.isIdentifier(n.expression)?n.expression.text:ts.isPropertyAccessExpression(n.expression)?n.expression.name.text:'';
    const kind=classifyNames.has(name)?'classifier':name==='loadPolicyInternals'||name==='evaluatePolicyPredicate'?'internals':name==='test'?'test-method (policy or other regex)':null;
    if(kind){const loc=lineContext(sf,n);let disposition='excluded',reason='outside defined fixture collectors; integration/runtime substitution or other regex';
      if(file==='tests/policy-n17.test.ts'||file==='tests/policy-uri-scheme.test.ts'){disposition='covered';reason=kind==='classifier'?'current classifier inputs replayed; F21 historical comparisons evaluated; N17 historical negative-comparison helper is stubbed, not validated':'internals wrappers record evaluated inputs; structural/text assertions audited separately';}
      else if(file==='tests/policy-n17-split.test.ts'){disposition='covered';reason='actual matrixInputs generator and all label lists expanded with NFC/NFD; zero per-regex flips asserted';}
      else if(records.some(r=>r.location.file===file&&r.location.line===loc.line)){disposition='covered';reason='input at this source line extracted as a validated literal or pure generator';}
      else if(file==='tests/policy-characterization.test.ts'){reason='inputs collected via characterization+F21/policyCorpus; call site not individually traced';}
      else if(records.some(r=>r.location.file===file)){reason='inputs collected via '+[...new Set(records.filter(r=>r.location.file===file).map(r=>r.group))].join(', ')+'; call site not individually traced';}
      sites.push({kind,...loc,disposition,reason});
    }
  }ts.forEachChild(n,visit);}visit(sf);
  return {file,classifierSites:sites.filter(s=>s.kind==='classifier').length,internalsSites:sites.filter(s=>s.kind==='internals').length,testMethodSites:sites.filter(s=>s.kind.startsWith('test-method')).length,sourceInputOccurrences:records.filter(r=>r.location.file===file).length,coveredSites:sites.filter(s=>s.disposition==='covered').length,excludedSites:sites.filter(s=>s.disposition==='excluded').length,sites};
});
unresolvedSites.forEach(site=>{site.disposition=site.file==='tests/policy-uri-scheme.test.ts'?'covered by full synchronous replay':'excluded from static-call extraction; separately enumerated table inputs do not imply complete integration coverage';delete site.note;});

// Non-call dependencies matter too: the F21 source-equality pin intentionally fails under B.
const auditFiles=['tests/policy-n17.test.ts','tests/policy-n17-split.test.ts','tests/policy-f21-rework.test.ts','tests/n17-policy-evidence.test.ts','tests/helpers/policy-test-loader.ts','tests/helpers/policy-baseline-f21.ts','tests/helpers/policy-baseline-n17.ts','tests/helpers/policy-f21-rework-child.mjs'];
const structuralReferences=auditFiles.flatMap(file=>readBaseText(file).split(/\r?\n/u).flatMap((text,i)=>/f21CredentialLabel|KOREAN_(?:API_)?CREDENTIAL_LABEL|EXACT_PATTERNS|\.source\b|\.flags\b|toString\(|sha256|hash\(|policy\.ts|manifest|\[:=\]/iu.test(text)?[{file,line:i+1,text,disposition:file==='tests/n17-policy-evidence.test.ts'?'synthetic hashes/historical N17 runner and artifacts; preserve these files and clone tools for N27':file.includes('/helpers/')?'immutable historical oracle or generic loader/child; no edits proposed':'assertion/source reference; evaluated structural decisions below'}]:[]));
const f21File='tests/policy-f21-rework.test.ts',sourcePin='expect(current.f21CredentialLabel?.source).toBe(oracle.f21CredentialLabel?.source);';
const f21Lines=readBaseText(f21File).split(/\r?\n/u),pinLine=f21Lines.findIndex(line=>line.trim()===sourcePin)+1;assert(pinLine>0);
const frozenF21=compileModule(readBaseText('tests/helpers/policy-baseline-f21.ts'),resolve(root,'tests/helpers/policy-baseline-f21.ts'),'export { f21CredentialLabel };').f21CredentialLabel;
assert.equal(oldRegexes[1].source,frozenF21.source);assert.notEqual(newRegexes[1].source,frozenF21.source);
assert.equal(newRegexes[1].flags,frozenF21.flags);assert.equal(newRegexes[2].flags,'i');assert.equal(newRegexes[3].flags,'i');
const structuralAudit={references:structuralReferences,conflicts:[{file:f21File,line:pinLine,assertion:sourcePin,baselinePass:true,candidatePass:false,proposed:'Preserve the historical F21 oracle; replace this production-source equality with the approved frozen B E3 literal and rename the test. Keep flags and old-positive differential checks.'}],unchanged:['N17 tuple count/reason slots and nonzero tuple sources','N17 split flags i/i and 28224 predicate inputs','F21 regex existence and flags i','N17 evidence tests pin synthetic hashes and historical N17 recipes, not current policy source; retain runner/analyzer/evidence and create N27 copies']};
structuralAudit.deferred=[{file:f21File,line:10,disposition:'Subprocess dense/throw/timeout outcomes on candidate tuple0 are not surveyed; rerun the full Vitest gate during implementation. Baseline suite passed separately.'}];

// Reuse the predesign's pinned label/form/sentence definitions without executing its timing section.
const probe=readBaseText('research/src/n27-n30-credential-probe.mjs');
function checkedSlice(start,end){assert.equal(probe.split(start).length,2);assert.equal(probe.split(end).length,2);const a=probe.indexOf(start),b=probe.indexOf(end);assert(a>=0&&b>a);return probe.slice(a,b);}
const definition=checkedSlice('const enSentence =','report.matrix = []');
const sentenceDefinition=checkedSlice('const sentences =','report.sentences = {}');
const syntheticDefinitions=compileModule(definition+'\n'+sentenceDefinition,resolve(root,'research/src/n27-n30-credential-probe.mjs'),'export { enSentence,koSentence,enLabels,koLabels,forms,sentences };');
const matrix=[];
for(const [lang,labels,sentence] of [['en',syntheticDefinitions.enLabels,syntheticDefinitions.enSentence],['ko',syntheticDefinitions.koLabels,syntheticDefinitions.koSentence]])for(const label of labels)for(const [form,make] of syntheticDefinitions.forms)for(const [placement,content] of [['alone',make(label)+' hunter2'],['sentence',sentence(make(label))]])matrix.push({lang,label,form,placement,content,...analyze(content)});
assert.equal(matrix.length,468);
const approvedNewForms=new Set(['fullwidth-colon','space-fullwidth','bold-out','bold-out-fw','italic-star','bold-italic','bold-space','equals-bold']);
matrix.forEach(row=>assert(!row.newHit||approvedNewForms.has(row.form),'new hit outside approved L1/L2 matrix forms'));
matrix.forEach(row=>assert(!approvedNewForms.has(row.form)||row.newHits.some(Boolean),'approved form missing tuple0 hit (including already-positive Korean fullwidth)'));
oldRegexes.forEach((_r,i)=>assert(matrix.some(row=>!row.oldHits[i]&&row.newHits[i]),'matrix must exercise each edited regex'));
const negatives=syntheticDefinitions.sentences.mustNotMatch.map(content=>{const r=analyze(content);assert(!r.newHits.some(Boolean));assert.deepEqual(r.baseline,r.candidate);return{content,...r};});assert.equal(negatives.length,9);
const extras=['**password**：','**password** ：','*비밀번호*：','****password****:','**password*:','password*:','**password**\u3000：','**password**\u00a0:','PASSWORD：','ſecret：','Key：'].map(token=>({content:token+' hunter2',...analyze(token+' hunter2')}));
const extraExpected=[true,true,true,false,true,true,true,true,true,true,false];
extras.forEach((row,i)=>{row.expectedTuple0=extraExpected[i];assert.equal(row.newHits.some(Boolean),extraExpected[i]);});
for(const token of ['**password**\u3000：','**password**\u00a0:']){const content=syntheticDefinitions.enSentence(token),r=analyze(content);assert(r.newHits.some(Boolean));extras.push({content,expectedTuple0:true,...r});}
const limitations=[['__password__:','en','semantic'],['_password_:','en','semantic'],['_비밀번호_:','ko','semantic'],['__비밀번호__:','ko','unknown']].map(([token,lang,mode])=>{const content=(lang==='en'?syntheticDefinitions.enSentence:syntheticDefinitions.koSentence)(token),r=analyze(content);assert.equal(r.baseline.mode,mode);assert.deepEqual(r.candidate,r.baseline);return{content,expectedMode:mode,...r};});
const output={
  schema:'n27-n30-credential-impact/v1',base:BASE,compareBase:git(['rev-parse',PRE]).trim(),planningOnly:true,performanceMeasured:false,
  reproducibility:{node:process.version,typescript:ts.version,scriptSha256Lf:sha256(lf(readFileSync(fileURLToPath(import.meta.url),'utf8'))),policySha256Lf:{[PRE]:sha256(lf(blob(PRE,paths.policy))),[BASE]:sha256(policy)},lockfileSha256Lf,workingBuildInputDelta,untrackedBuildInputs,dist:{path:distPath,sha256:sha256(distBytes),sha256Lf:sha256(distText),expectedLf:EXPECTED_DIST_LF_SHA256,provenance:'Expected dist fingerprint established by baseline build; runtime asserts source/build inputs match pinned base and dist hash matches. Historical clean-build event is not inferred from this check.'},fixtureSources:Object.fromEntries([...sourceFiles].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([file,{blob,sha256Lf}])=>[file,{blob,sha256Lf}]))},
  regexes:oldRegexes.map((r,i)=>({before:r.toString(),after:newRegexes[i].toString(),...supersetCounts[i]})),
  controls:{literalOccurrences:4,wrongLiteralRejected:true,identityTextEqual:true,identityOutputsChecked:cache.size,candidateReversedToBaseline:true,nonzeroTupleSourcesEqual:true,orderedOutputModelChecked:cache.size,resourceControl},
  markdown:{deduplication:'kind + NUL + exact LF-normalized content; nonempty filter only, no trimming; line and paragraph remain distinct',predesign:pre,current:base,delta:markdownDelta},
  fixtures:{...fixtures,rawOccurrences:records.length,uniqueInputs:fixtureUnique.size,sourceCounts:Object.fromEntries([...new Set(records.map(r=>r.group))].map(group=>[group,records.filter(r=>r.group===group).length])),assertedConflicts:conflicts,splitPredicateFlipCount,replayCounts,testFileInventory,unresolvedStaticSites:unresolvedSites},
  structuralAudit,synthetic:{matrix,negatives,extras,underscoreLimitations:limitations},
  exclusions:['Not a whole integration execution trace: core/F21 static extractor unresolved sites are listed with locations; generated differential and both N17 suites are explicitly expanded.','Multi-MiB timing/stress subprocess inputs, raw experiment/dataset JSON and unrelated integration fixture substitutions are outside this input survey; no claim of complete test-run tracing.','Predesign matrix observations are impact evidence, not an independent literal oracle. Future implementation must author frozen expected outputs before product edits.','Markdown all-doc totals include historical synthetic examples; excludingSelfReferentialOnly gives the separately defined plan/handoff sensitivity analysis.'],
};
writeFileSync(resolve(root,args[1]),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({pre:{files:pre.files,units:pre.uniqueUnits,newHits:pre.newHits,mode:pre.modeChanges,reasons:pre.reasonsChanges},current:{files:base.files,units:base.uniqueUnits,newHits:base.newHits,mode:base.modeChanges,reasons:base.reasonsChanges},fixtures:{raw:records.length,unique:fixtureUnique.size,mode:fixtures.modeChanges,reasons:fixtures.reasonsChanges,assertedConflicts:conflicts.length},matrix:matrix.length}));
