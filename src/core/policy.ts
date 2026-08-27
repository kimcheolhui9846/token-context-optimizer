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

const EXACT_PATTERNS: Array<[string, RegExp]> = [
  ["secret", /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\s*[:=]/iu],
  ["secret", /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/iu],
  ["secret", /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/u],
  ["secret", /\b[A-Za-z][A-Za-z0-9+.-]*:[^\s]*/u],
  ["secret", /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
  ["code_or_path", /(?:^|\s)(?:[A-Za-z]:[\\/]|~\/|\.{1,2}\/|\/[A-Za-z0-9._-]+\/|\\\\)[^\s]*/u],
  ["code_or_path", /\b[\p{L}\p{N}][\p{L}\p{N}_-]+(?:\.[A-Za-z0-9]{1,12})+\b/u],
  ["code_or_path", /\b[\w.-]+\.(?:ts|tsx|js|jsx|json|py|go|rs|java|cs|md|ya?ml|toml|ini|conf|cfg|env|html|css|sql|db|sh)(?::\d+(?::\d+)?)?\b/u],
  ["code_or_path", /(?:^|\s)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?:\s|$|[).,;:])/u],
  ["code_or_path", /\b(?:error|exception|traceback|stack trace|diff --git|@@)\b/iu],
  ["code_or_path", /^\s*(?:(?:sudo|doas)\s+)?(?:npm|node|git|pnpm|yarn|cargo|go|python|pytest|curl|echo|copy|cp|mv|rm|mkdir|cat|grep|rg|sed|awk|ssh|scp|docker|kubectl|make)\b/imu],
  ["code_or_path", /\b(?:run|execute|invoke)\s+[a-z][a-z0-9._-]*(?:\s+[A-Za-z0-9._+=:/-]+){0,5}/iu],
  ["code_syntax", /^\s*(?:import|export|const|let|var|return|function|class|interface|type|if|for|while|try|catch)\b/mu],
  ["code_syntax", /\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|CREATE|ALTER|DROP)\b[\s\S]*\b(?:FROM|WHERE|SET|VALUES|TABLE)\b/u],
  ["code_syntax", /[{};][\s\S]*(?:=>|=|\(|\)|\.)/u],
  ["code_syntax", /<![A-Za-z][^>]*>/u],
  ["code_syntax", /<\?[A-Za-z][\s\S]*?\?>/u],
  ["code_syntax", /<!--[\s\S]*?-->/u],
  ["code_syntax", /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*)?>/u],
  ["identifier_or_hash", /\b(?:sha256|sha|hash|id)\s*[:=]\s*[A-Za-z0-9._-]{4,}\b/iu],
  ["identifier_or_hash", /\b[A-Za-z][A-Za-z0-9_-]*[-_]id\s*[:=]?\s*[A-Za-z0-9._-]{6,}\b/iu],
  ["identifier_or_hash", /\b(?:trace|span|correlation|request|session|event)\s*[:=]?\s*[A-Za-z0-9._-]{6,}\b/iu],
  ["identifier_or_hash", /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/u],
  ["identifier_or_hash", /\b[A-Fa-f0-9]{32,}\b/u],
  ["identifier_or_hash", /\b[A-Z]{2,}[-_][A-Z0-9]{3,}\b/u],
  ["numeric_or_table", /(?:^|\n)\s*\|.+\|\s*(?:\n|$)/u],
  ["numeric_or_table", /\b\d+(?:\.\d+)?(?:ms|s|MB|GB|KiB|MiB|%|tokens?)?\b/iu],
];

export function classifyContext(content: string): ContextClassification {
  const reasons = new Set<string>();

  for (const [reason, pattern] of EXACT_PATTERNS) {
    if (pattern.test(content)) {
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
    /\b[\p{L}\p{N}][\p{L}\p{N}_-]+(?:\.[A-Za-z0-9]{1,12})+\b/u,
    /\b(?:run|execute|invoke)\s+[a-z][a-z0-9._-]*(?:\s+[A-Za-z0-9._+=:/-]+){0,5}/iu,
    /\b[a-z][a-z0-9._-]*\s+(?:[ugoa]*[+=-][rwxXstugo,]+|--?[A-Za-z0-9][A-Za-z0-9-]*|[A-Za-z_][A-Za-z0-9_]*=|\.{0,2}\/|~\/|[A-Za-z]:[\\/]|[a-z][a-z0-9._-]*\/|(?:apply|build|clone|deploy|install|merge|pull|push|release|restart|test|upgrade))\b/iu,
    /\b(?:trace|span|correlation|request|session|event)\s*[:=]?\s*[A-Za-z0-9._-]{6,}\b/iu,
    /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/u,
  ].some((pattern) => pattern.test(line));
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
