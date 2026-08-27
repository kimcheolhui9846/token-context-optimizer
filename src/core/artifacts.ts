import { createHash } from "node:crypto";
import { realpath, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import { classifyContext, lossyCompressionAllowed } from "./policy.js";
import { estimateTextTokens } from "./token-estimator.js";
import type { ArtifactRecord, CommonResponseFields, SourceLine } from "./types.js";

export interface ArtifactStore {
  get(artifactId: string): ArtifactRecord | undefined;
  put(record: ArtifactRecord): void;
}

export class MemoryArtifactStore implements ArtifactStore {
  private readonly records = new Map<string, ArtifactRecord>();

  get(artifactId: string): ArtifactRecord | undefined {
    return this.records.get(artifactId);
  }

  put(record: ArtifactRecord): void {
    this.records.set(record.artifactId, record);
  }
}

export const defaultArtifactStore = new MemoryArtifactStore();

export async function indexArtifact(input: {
  path: string;
  store?: ArtifactStore;
  allowedRoots?: string[];
  maxBytes?: number;
}): Promise<ArtifactRecord> {
  const absolutePath = await validateReadableFile(input.path, {
    allowedRoots: input.allowedRoots ?? [process.cwd()],
    maxBytes: input.maxBytes ?? 10 * 1024 * 1024,
  });
  const buffer = await readFile(absolutePath);
  const content = decodeUtf8Strict(buffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const identityHash = createHash("sha256")
    .update(`${absolutePath}\0${sha256}`, "utf8")
    .digest("hex");
  const sourceMap = buildSourceMap(content);
  const record: ArtifactRecord = {
    artifactId: `artifact_${identityHash.slice(0, 16)}`,
    path: absolutePath,
    sha256,
    byteLength: buffer.byteLength,
    lineCount: sourceMap.length,
    content,
    sourceMap,
  };

  input.store?.put(record);
  if (!input.store) {
    defaultArtifactStore.put(record);
  }
  return record;
}

export function queryArtifact(input: {
  artifactId: string;
  query: string;
  maxTokens: number;
  contextLines?: number;
  store?: ArtifactStore;
}): CommonResponseFields & {
  excerpts: Array<{
    text: string;
    sourceMap: {
      path: string;
      startLine: number;
      endLine: number;
      startByte: number;
      endByte: number;
      completeSpan: boolean;
    };
  }>;
} {
  const store = input.store ?? defaultArtifactStore;
  const artifact = requireArtifact(store, input.artifactId);
  const contextLines = input.contextLines ?? 2;
  const match = findBestLine(artifact, input.query);
  if (match.reason) {
    return {
      ...commonFields(artifact, 0, [match.warning], match.reason),
      excerpts: [],
    };
  }
  const bestLine = match.index;
  const startIndex = Math.max(0, bestLine - contextLines);
  const endIndex = Math.min(artifact.sourceMap.length - 1, bestLine + contextLines);
  const span = fitCompleteLineSpan(artifact, startIndex, bestLine, endIndex, input.maxTokens);

  if (!span) {
    return {
      ...commonFields(
        artifact,
        0,
        ["complete_span_required"],
        "source_span_exceeds_budget",
      ),
      excerpts: [],
    };
  }

  const text = renderSpanText(artifact, span.startIndex, span.endIndex);
  const estimatedTokens = estimateTextTokens(text);

  return {
    ...commonFields(artifact, estimatedTokens, [], null),
    excerpts: [
      {
        text,
        sourceMap: {
          path: artifact.path,
          startLine: span.startIndex + 1,
          endLine: span.endIndex + 1,
          startByte: artifact.sourceMap[span.startIndex].startByte,
          endByte: artifact.sourceMap[span.endIndex].endByte,
          completeSpan: true,
        },
      },
    ],
  };
}

export function summarizeArtifact(input: {
  artifactId: string;
  maxTokens: number;
  store?: ArtifactStore;
}): CommonResponseFields & {
  summary: string;
  sourceMap: {
    path: string;
    startLine: number;
    endLine: number;
  } | null;
} {
  const store = input.store ?? defaultArtifactStore;
  const artifact = requireArtifact(store, input.artifactId);
  const classification = classifyContext(artifact.content);

  if (!lossyCompressionAllowed(classification)) {
    return {
      ...commonFields(
        artifact,
        0,
        ["lossy_summary_blocked", ...classification.warnings],
        fallbackReasonForClassification(classification.mode),
      ),
      summary: "",
      sourceMap: null,
    };
  }

  const candidateLines = artifact.sourceMap.slice(0, 6);
  const selectedLines = fitCompleteSummaryLines(candidateLines, input.maxTokens);

  if (selectedLines.length === 0 && artifact.sourceMap.length > 0) {
    return {
      ...commonFields(
        artifact,
        0,
        ["complete_summary_span_required"],
        "summary_span_exceeds_budget",
      ),
      summary: "",
      sourceMap: null,
    };
  }

  const summary = renderSummaryText(selectedLines);

  return {
    ...commonFields(artifact, estimateTextTokens(summary), [], null),
    summary,
    sourceMap:
      selectedLines.length === 0
        ? null
        : {
            path: artifact.path,
            startLine: selectedLines[0].line,
            endLine: selectedLines[selectedLines.length - 1].line,
          },
  };
}

function buildSourceMap(content: string): SourceLine[] {
  const matches = [...content.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/gu)];
  let byteCursor = 0;

  return matches
    .filter((match, index) => match[1].length > 0 || index < matches.length - 1)
    .map((match, index) => {
      const text = match[1];
      const delimiter = match[2];
      const lineBytes = Buffer.byteLength(text, "utf8");
      const sourceLine = {
        line: index + 1,
        startByte: byteCursor,
        endByte: byteCursor + lineBytes,
        text,
        delimiter,
      };
      byteCursor += lineBytes + Buffer.byteLength(delimiter, "utf8");
      return sourceLine;
    });
}

function findBestLine(
  artifact: ArtifactRecord,
  query: string,
): { index: number; score: number; reason?: string; warning: string } {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return {
      index: 0,
      score: 0,
      reason: "no_query_terms",
      warning: "query_has_no_searchable_terms",
    };
  }

  let bestIndex = 0;
  let bestScore = -1;
  artifact.sourceMap.forEach((line, index) => {
    const lower = normalizeSearchText(line.text);
    const score = terms.reduce(
      (total, term) => total + (lower.includes(term) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestScore <= 0) {
    return {
      index: bestIndex,
      score: bestScore,
      reason: "no_query_match",
      warning: "query_terms_not_found",
    };
  }

  return { index: bestIndex, score: bestScore, warning: "" };
}

function trimToTokenBudget(text: string, maxTokens: number): string {
  let candidate = text.trim();
  while (estimateTextTokens(candidate) > maxTokens && candidate.length > 0) {
    candidate = candidate.slice(0, Math.max(0, candidate.length - 8)).trimEnd();
  }
  return candidate;
}

function fitCompleteSummaryLines(
  lines: SourceLine[],
  maxTokens: number,
): SourceLine[] {
  const selected: SourceLine[] = [];
  for (const line of lines) {
    const candidate = renderSummaryText([...selected, line]);
    if (estimateTextTokens(candidate) > maxTokens) {
      break;
    }
    selected.push(line);
  }
  return selected;
}

function renderSummaryText(lines: SourceLine[]): string {
  return lines
    .map((line, index) => (index === lines.length - 1 ? line.text : `${line.text}\n`))
    .join("");
}

function fitCompleteLineSpan(
  artifact: ArtifactRecord,
  requestedStartIndex: number,
  bestLine: number,
  requestedEndIndex: number,
  maxTokens: number,
): { startIndex: number; endIndex: number } | null {
  let startIndex = requestedStartIndex;
  let endIndex = requestedEndIndex;

  while (startIndex <= endIndex) {
    const candidate = renderSpanText(artifact, startIndex, endIndex);
    if (estimateTextTokens(candidate) <= maxTokens) {
      return { startIndex, endIndex };
    }

    if (startIndex === endIndex) {
      return null;
    }

    if (bestLine - startIndex >= endIndex - bestLine && startIndex < bestLine) {
      startIndex += 1;
    } else if (endIndex > bestLine) {
      endIndex -= 1;
    } else {
      startIndex += 1;
    }
  }

  return null;
}

function renderSpanText(
  artifact: ArtifactRecord,
  startIndex: number,
  endIndex: number,
): string {
  return artifact.sourceMap
    .slice(startIndex, endIndex + 1)
    .map((line, index, lines) =>
      index === lines.length - 1 ? line.text : `${line.text}${line.delimiter}`,
    )
    .join("");
}

function tokenize(text: string): string[] {
  return [...normalizeSearchText(text).matchAll(/[\p{L}\p{N}_./:-]+/gu)].map(
    (match) => match[0],
  );
}

function normalizeSearchText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase();
}

async function validateReadableFile(
  path: string,
  options: { allowedRoots: string[]; maxBytes: number },
): Promise<string> {
  const absolutePath = await realpath(resolve(path));
  const allowedRoots = await Promise.all(
    options.allowedRoots.map((root) => realpath(resolve(root))),
  );
  const isAllowed = allowedRoots.some((root) => isPathInside(absolutePath, root));
  if (!isAllowed) {
    throw new Error(`File is outside allowed roots: ${absolutePath}`);
  }

  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error(`Path is not a regular file: ${absolutePath}`);
  }
  if (fileStat.size > options.maxBytes) {
    throw new Error(`File exceeds maxBytes limit: ${fileStat.size}`);
  }

  return absolutePath;
}

function isPathInside(path: string, root: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

function decodeUtf8Strict(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new Error("Artifact must be valid UTF-8 text");
  }
}

function commonFields(
  artifact: ArtifactRecord,
  estimatedTokens: number,
  warnings: string[],
  fallbackReason: string | null,
): CommonResponseFields {
  return {
    artifactId: artifact.artifactId,
    sha256: artifact.sha256,
    estimatedTokens,
    confidence: "low",
    warnings,
    fallbackReason,
  };
}

function requireArtifact(store: ArtifactStore, artifactId: string): ArtifactRecord {
  const artifact = store.get(artifactId);
  if (!artifact) {
    throw new Error(`Artifact not indexed: ${artifactId}`);
  }
  return artifact;
}

export function artifactLabel(record: ArtifactRecord): string {
  return `${basename(record.path)} ${record.sha256.slice(0, 12)}`;
}

function fallbackReasonForClassification(mode: string): string {
  if (mode === "exact") {
    return "exact_content_requires_source";
  }
  if (mode === "visual") {
    return "visual_content_requires_source";
  }
  return "unknown_content_requires_source";
}
