import type { ContextClassification } from "./types.js";

const COMMANDS = new Set([
  "npm",
  "node",
  "git",
  "pnpm",
  "yarn",
  "cargo",
  "go",
  "python",
  "pytest",
  "curl",
  "echo",
  "copy",
  "cp",
  "mv",
  "rm",
  "mkdir",
  "cat",
  "grep",
  "rg",
  "sed",
  "awk",
  "ssh",
  "scp",
  "docker",
  "kubectl",
  "make",
  "systemctl",
  "terraform",
]);

type PolicyPredicate = RegExp | ((content: string) => boolean);

const SQL_LEADING_KEYWORD = /\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|CREATE|ALTER|DROP)\b/gu;
const SQL_TRAILING_KEYWORD = /\b(?:FROM|WHERE|SET|VALUES|TABLE)\b/gu;
const PHP_OPENER = /<\?[A-Za-z]/gu;
const FILE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "py",
  "go",
  "rs",
  "java",
  "cs",
  "md",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "env",
  "html",
  "css",
  "sql",
  "db",
  "sh",
]);

function isAsciiWordCode(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 95
  );
}

function isAsciiWordAt(content: string, index: number): boolean {
  return index >= 0 && index < content.length && isAsciiWordCode(content.charCodeAt(index));
}

function isWordBoundaryU(content: string, index: number): boolean {
  return isAsciiWordAt(content, index - 1) !== isAsciiWordAt(content, index);
}

function isSingleCharMatch(char: string | undefined, pattern: RegExp): boolean {
  return char !== undefined && pattern.test(char);
}

function isCodePointMatch(content: string, index: number, pattern: RegExp): boolean {
  return isSingleCharMatch(codePointAt(content, index), pattern);
}

function codePointAt(content: string, index: number): string | undefined {
  if (index < 0 || index >= content.length) {
    return undefined;
  }
  const first = content.charCodeAt(index);
  if (first >= 0xd800 && first <= 0xdbff && index + 1 < content.length) {
    const second = content.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return content.slice(index, index + 2);
    }
  }
  return content[index];
}

function isAsciiLetterCode(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isSchemeCode(code: number): boolean {
  return isAsciiLetterCode(code) || (code >= 48 && code <= 57) || code === 43 || code === 45 || code === 46;
}

function isAsciiAlphaNumericCode(code: number): boolean {
  return isAsciiLetterCode(code) || (code >= 48 && code <= 57);
}

function isFilenameRunCode(code: number): boolean {
  return isAsciiWordCode(code) || code === 46 || code === 45;
}

function hasUriScheme(content: string): boolean {
  let runHasEligibleStart = false;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (isSchemeCode(code)) {
      if (isAsciiLetterCode(code) && isWordBoundaryU(content, index)) {
        runHasEligibleStart = true;
      }
      continue;
    }
    if (code === 58 && runHasEligibleStart) {
      return true;
    }
    runHasEligibleStart = false;
  }
  return false;
}

function hasDottedTokenShape(content: string): boolean {
  let stemOrdinal = 0;
  let earliestEligibleOrdinal: number | null = null;
  for (let index = 0; index < content.length;) {
    const char = codePointAt(content, index);
    if (char && /^[\p{L}\p{N}_-]$/u.test(char)) {
      if (/^[\p{L}\p{N}]$/u.test(char) && isWordBoundaryU(content, index) && earliestEligibleOrdinal === null) {
        earliestEligibleOrdinal = stemOrdinal;
      }
      stemOrdinal += 1;
      index += char.length;
      continue;
    }

    if (char === "." && earliestEligibleOrdinal !== null && stemOrdinal - earliestEligibleOrdinal >= 2) {
      let extensionIndex = index + 1;
      for (let extensionLength = 1; extensionLength <= 12 && extensionIndex < content.length; extensionLength += 1) {
        const code = content.charCodeAt(extensionIndex);
        if (!isAsciiAlphaNumericCode(code)) {
          break;
        }
        extensionIndex += 1;
        if (isWordBoundaryU(content, extensionIndex)) {
          return true;
        }
      }
    }

    stemOrdinal = 0;
    earliestEligibleOrdinal = null;
    index += char?.length ?? 1;
  }
  return false;
}

function hasKnownFilename(content: string): boolean {
  let runOrdinal = 0;
  let earliestEligibleOrdinal: number | null = null;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (!isFilenameRunCode(code)) {
      runOrdinal = 0;
      earliestEligibleOrdinal = null;
      continue;
    }

    if (isWordBoundaryU(content, index) && earliestEligibleOrdinal === null) {
      earliestEligibleOrdinal = runOrdinal;
    }

    if (code === 46 && earliestEligibleOrdinal !== null && runOrdinal - earliestEligibleOrdinal >= 1) {
      for (const extension of FILE_EXTENSIONS) {
        const start = index + 1;
        const end = start + extension.length;
        if (content.slice(start, end) === extension && isWordBoundaryU(content, end)) {
          return true;
        }
      }
    }

    runOrdinal += 1;
  }
  return false;
}

function hasSqlKeywordSequence(content: string): boolean {
  SQL_LEADING_KEYWORD.lastIndex = 0;
  const leading = SQL_LEADING_KEYWORD.exec(content);
  if (!leading) {
    return false;
  }

  SQL_TRAILING_KEYWORD.lastIndex = 0;
  const earliestTrailingStart = leading.index + leading[0].length;
  for (let trailing = SQL_TRAILING_KEYWORD.exec(content); trailing; trailing = SQL_TRAILING_KEYWORD.exec(content)) {
    if (trailing.index >= earliestTrailingStart) {
      return true;
    }
  }
  return false;
}

function hasDelimiterThenSyntaxTail(content: string): boolean {
  const delimiter = content.search(/[{};]/u);
  if (delimiter === -1) {
    return false;
  }
  for (let index = delimiter + 1; index < content.length; index += 1) {
    const char = content[index];
    if (char === "=" || char === "(" || char === ")" || char === ".") {
      return true;
    }
  }
  return false;
}

function hasPhpBlock(content: string): boolean {
  PHP_OPENER.lastIndex = 0;
  const opener = PHP_OPENER.exec(content);
  return opener ? content.indexOf("?>", opener.index + opener[0].length) !== -1 : false;
}

function hasHtmlComment(content: string): boolean {
  const opener = content.indexOf("<!--");
  return opener !== -1 && content.indexOf("-->", opener + 4) !== -1;
}

function hasBangDeclaration(content: string): boolean {
  for (let index = 0; index < content.length;) {
    const opener = content.indexOf("<!", index);
    if (opener === -1 || opener + 2 >= content.length) {
      return false;
    }
    if (isAsciiLetterCode(content.charCodeAt(opener + 2))) {
      return content.indexOf(">", opener + 3) !== -1;
    }
    index = opener + 2;
  }
  return false;
}

function hasHtmlTag(content: string): boolean {
  return /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?>/u.test(content);
}

function isWordIuAt(content: string, index: number): boolean {
  return isCodePointMatch(content, index, /^[\w]$/iu);
}

function isWordBoundaryIu(content: string, index: number): boolean {
  return isWordIuAt(content, previousCodePointIndex(content, index)) !== isWordIuAt(content, index);
}

function previousCodePointIndex(content: string, index: number): number {
  if (index <= 0) {
    return -1;
  }
  const previous = index - 1;
  const code = content.charCodeAt(previous);
  if (code >= 0xdc00 && code <= 0xdfff && previous - 1 >= 0) {
    const lead = content.charCodeAt(previous - 1);
    if (lead >= 0xd800 && lead <= 0xdbff) {
      return previous - 1;
    }
  }
  return previous;
}

function isNameFirstIu(char: string | undefined): boolean {
  return isSingleCharMatch(char, /^[A-Za-z]$/iu);
}

function isNameRestIu(char: string | undefined): boolean {
  return isSingleCharMatch(char, /^[A-Za-z0-9_-]$/iu);
}

function isValueIu(char: string | undefined): boolean {
  return isSingleCharMatch(char, /^[A-Za-z0-9._-]$/iu);
}

function hasIdentifierIdValue(content: string): boolean {
  const states = {
    name: false,
    needI: false,
    needD: false,
    gap1: false,
    gap2: false,
    valueLength: 0,
  };

  for (let index = 0; index <= content.length;) {
    if (states.valueLength >= 6 && isWordBoundaryIu(content, index)) {
      return true;
    }
    if (index === content.length) {
      break;
    }

    const char = codePointAt(content, index);
    const next = {
      name: false,
      needI: false,
      needD: false,
      gap1: false,
      gap2: false,
      valueLength: 0,
    };

    if (isNameFirstIu(char) && isWordBoundaryIu(content, index)) {
      next.name = true;
    }
    if (states.name && isNameRestIu(char)) {
      next.name = true;
      if (char === "-" || char === "_") {
        next.needI = true;
      }
    }
    if (states.needI && isSingleCharMatch(char, /^[i]$/iu)) {
      next.needD = true;
    }
    if (states.needD && isSingleCharMatch(char, /^[d]$/iu)) {
      next.gap1 = true;
    }
    if (states.gap1 && isCodePointWhitespace(char)) {
      next.gap1 = true;
    }
    if (states.gap1 && (char === ":" || char === "=")) {
      next.gap2 = true;
    }
    if (states.gap2 && isCodePointWhitespace(char)) {
      next.gap2 = true;
    }
    if ((states.gap1 || states.gap2) && isValueIu(char)) {
      next.valueLength = Math.max(next.valueLength, 1);
    }
    if (states.valueLength > 0 && isValueIu(char)) {
      next.valueLength = Math.max(next.valueLength, states.valueLength + 1);
    }

    // Epsilon closure: the original separator is optional.
    if (next.gap1) {
      next.gap2 = true;
    }

    states.name = next.name;
    states.needI = next.needI;
    states.needD = next.needD;
    states.gap1 = next.gap1;
    states.gap2 = next.gap2;
    states.valueLength = next.valueLength;
    index += char?.length ?? 1;
  }
  return states.valueLength >= 6 && isWordBoundaryIu(content, content.length);
}

function isCodePointWhitespace(char: string | undefined): boolean {
  return isSingleCharMatch(char, /^\s$/u);
}

function hasTraceLikeValue(content: string): boolean {
  return /\b(?:trace|span|correlation|request|session|event)\s*(?:[:=]\s*)?[A-Za-z0-9._-]{6,}\b/iu.test(content);
}

function hasMultilinePipeTable(content: string): boolean {
  let leading = true;
  let bodyEmpty = false;
  let body = false;
  let trailing = false;

  for (let index = 0; index < content.length;) {
    const char = codePointAt(content, index);
    if (trailing && char === "\n") {
      return true;
    }

    let nextLeading = char === "\n";
    let nextBodyEmpty = false;
    let nextBody = false;
    let nextTrailing = false;

    if (leading) {
      if (isCodePointWhitespace(char)) {
        nextLeading = true;
      } else if (char === "|") {
        nextBodyEmpty = true;
      }
    }

    const isDot = char !== "\n" && char !== "\r" && char !== "\u2028" && char !== "\u2029";
    if (bodyEmpty && isDot) {
      nextBody = true;
    }
    if (body && isDot) {
      nextBody = true;
      if (char === "|") {
        nextTrailing = true;
      }
    }

    if (trailing && isCodePointWhitespace(char)) {
      nextTrailing = true;
    }

    leading = nextLeading;
    bodyEmpty = nextBodyEmpty;
    body = nextBody;
    trailing = nextTrailing;
    index += char?.length ?? 1;
  }

  return trailing;
}

function matchesPolicyPredicate(predicate: PolicyPredicate, content: string): boolean {
  return typeof predicate === "function" ? predicate(content) : predicate.test(content);
}

const EXACT_PATTERNS: Array<[string, PolicyPredicate]> = [
  ["secret", /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\s*[:=]/iu],
  ["secret", /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/iu],
  ["secret", /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u],
  ["secret", hasUriScheme],
  ["secret", /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
  ["code_or_path", /(?:^|\s)(?:[A-Za-z]:[\\/]|~\/|\.{1,2}\/|\/[A-Za-z0-9._-]+\/|\\\\)[^\s]*/u],
  ["code_or_path", hasDottedTokenShape],
  ["code_or_path", hasKnownFilename],
  ["code_or_path", /(?:^|\s)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?:\s|$|[).,;:])/u],
  ["code_or_path", /\b(?:error|exception|traceback|stack trace|diff --git|@@)\b/iu],
  ["code_or_path", /^[^\S\r\n\u2028\u2029]*(?:(?:sudo|doas)\s+)?(?:npm|node|git|pnpm|yarn|cargo|go|python|pytest|curl|echo|copy|cp|mv|rm|mkdir|cat|grep|rg|sed|awk|ssh|scp|docker|kubectl|make)\b/imu],
  ["code_or_path", /\b(?:run|execute|invoke)\s+[a-z][a-z0-9._-]*(?:\s+[A-Za-z0-9._+=:/-]+){0,5}/iu],
  ["code_syntax", /^[^\S\r\n\u2028\u2029]*(?:import|export|const|let|var|return|function|class|interface|type|if|for|while|try|catch)\b/mu],
  ["code_syntax", hasSqlKeywordSequence],
  ["code_syntax", hasDelimiterThenSyntaxTail],
  ["code_syntax", hasBangDeclaration],
  ["code_syntax", hasPhpBlock],
  ["code_syntax", hasHtmlComment],
  ["code_syntax", hasHtmlTag],
  ["identifier_or_hash", /\b(?:sha256|sha|hash|id)\s*[:=]\s*[A-Za-z0-9._-]{4,}\b/iu],
  ["identifier_or_hash", hasIdentifierIdValue],
  ["identifier_or_hash", hasTraceLikeValue],
  ["identifier_or_hash", /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/u],
  ["identifier_or_hash", /\b[A-Fa-f0-9]{32,}\b/u],
  ["identifier_or_hash", /\b[A-Z]{2,}[-_][A-Z0-9]{3,}\b/u],
  ["numeric_or_table", hasMultilinePipeTable],
  ["numeric_or_table", /\b\d+(?:\.\d+)?(?:ms|s|MB|GB|KiB|MiB|%|tokens?)?\b/iu],
];

export function classifyContext(content: string): ContextClassification {
  const reasons = new Set<string>();

  for (const [reason, pattern] of EXACT_PATTERNS) {
    if (matchesPolicyPredicate(pattern, content)) {
      reasons.add(reason);
    }
  }
  if (containsShellCommand(content)) {
    reasons.add("code_or_path");
  }
  if (containsTechnicalTokenShape(content)) {
    reasons.add("code_or_path");
  }

  if (reasons.size > 0) {
    return {
      mode: "exact",
      reasons: [...reasons],
      warnings: ["lossy_compression_not_allowed"],
    };
  }

  if (/\b(?:screenshot|diagram|chart|layout|image|visual)\b/iu.test(content)) {
    return {
      mode: "visual",
      reasons: ["visual_context"],
      warnings: ["lossy_summary_not_allowed_for_visual"],
    };
  }

  if (isPositiveSemanticText(content)) {
    return {
      mode: "semantic",
      reasons: ["natural_language"],
      warnings: [],
    };
  }

  return {
    mode: "unknown",
    reasons: ["insufficient_semantic_signal"],
    warnings: ["lossy_compression_not_allowed"],
  };
}

export function lossyCompressionAllowed(classification: ContextClassification): boolean {
  return classification.mode === "semantic";
}

function isPositiveSemanticText(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 24) {
    return false;
  }

  const lines = trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }

  return lines.every((line) => isPositiveSemanticLine(line));
}

function isPositiveSemanticLine(line: string): boolean {
  const chars = [...line];
  const letterCount = chars.filter((char) => /\p{L}/u.test(char)).length;
  const letterRatio = letterCount / Math.max(chars.length, 1);
  const wordCount = [...line.matchAll(/[\p{L}][\p{L}'-]*/gu)].length;

  return (
    letterRatio >= 0.6 &&
    wordCount >= 5 &&
    /[.!?]$/u.test(line) &&
    !/[`{}[\]|<>\\]/u.test(line) &&
    !/\b[A-Z_]{2,}\b/u.test(line) &&
    !hasTechnicalTokenShape(line)
  );
}

function hasTechnicalTokenShape(line: string): boolean {
  return [
    hasDottedTokenShape,
    /\b(?:run|execute|invoke)\s+[a-z][a-z0-9._-]*(?:\s+[A-Za-z0-9._+=:/-]+){0,5}/iu,
    /\b[a-z][a-z0-9._-]*\s+(?:[ugoa]*[+=-][rwxXstugo,]+|--?[A-Za-z0-9][A-Za-z0-9-]*|[A-Za-z_][A-Za-z0-9_]*=|\.{0,2}\/|~\/|[A-Za-z]:[\\/]|[a-z][a-z0-9._-]*\/|(?:apply|build|clone|deploy|install|merge|pull|push|release|restart|test|upgrade))\b/iu,
    hasTraceLikeValue,
    /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/u,
  ].some((pattern) => matchesPolicyPredicate(pattern, line));
}

function containsTechnicalTokenShape(content: string): boolean {
  return content.split(/\r?\n/u).some((line) => hasTechnicalTokenShape(line));
}

function containsShellCommand(content: string): boolean {
  return content.split(/\r?\n/u).some((line) => isShellCommandLine(line));
}

function isShellCommandLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }

  let index = 0;
  while (index < tokens.length) {
    const token = stripShellPunctuation(tokens[index]).toLowerCase();
    if (COMMANDS.has(token)) {
      return true;
    }

    if (token === "sudo" || token === "doas") {
      index += 1;
      while (index < tokens.length && stripShellPunctuation(tokens[index]).startsWith("-")) {
        index += 1;
        if (index < tokens.length && !looksLikeCommandOrAssignment(tokens[index])) {
          index += 1;
        }
      }
      continue;
    }

    if (token === "env") {
      index += 1;
      while (index < tokens.length) {
        const candidate = stripShellPunctuation(tokens[index]);
        if (candidate.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=.*/u.test(candidate)) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/u.test(token)) {
      index += 1;
      continue;
    }

    return false;
  }

  return false;
}

function looksLikeCommandOrAssignment(token: string): boolean {
  const stripped = stripShellPunctuation(token).toLowerCase();
  return COMMANDS.has(stripped) || /^[A-Za-z_][A-Za-z0-9_]*=.*/u.test(stripped);
}

function stripShellPunctuation(token: string): string {
  return token.replace(/^[("'`]+|[).,;"'`]+$/gu, "");
}
