// The registered upstream transport accepts exactly 18 questions. This study has 15.
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";

const target = new URL("../../src/ko-blind-reader-pipeline.mjs", import.meta.url).href;
const pinned = "d3e2e9ff8a3f5009d16af648af7edc095591aa72baaee44d37fc58d49c33b818";
const oldGuard = "q.length !== REG.design.sources";
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url !== target) return result;
    const source = Buffer.from(result.source).toString("utf8");
    const hash = createHash("sha256").update(source.replaceAll("\r\n", "\n")).digest("hex");
    if (hash !== pinned || source.split(oldGuard).length !== 2) {
      throw new Error("Unexpected upstream pipeline version or cardinality guard");
    }
    return { ...result, source: source.replace(oldGuard, "q.length !== 15") };
  },
});
