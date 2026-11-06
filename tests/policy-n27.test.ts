import { describe, expect, it } from "vitest";
import { classifyContext } from "../src/core/policy.js";
import { classifyContext as baseline } from "./helpers/policy-baseline-n27.js";
import { evaluatePolicyPredicate, loadPolicyInternals } from "./helpers/policy-test-loader.js";

const current = loadPolicyInternals("src/core/policy.ts");
const oldInternals = loadPolicyInternals("tests/helpers/policy-baseline-n27.ts");
// Literal full-output dictionary: baseline observed at 0bc7959 before product edits.
const outputs = [
  {
    "mode": "exact",
    "reasons": [
      "secret"
    ],
    "warnings": [
      "lossy_compression_not_allowed"
    ]
  },
  {
    "mode": "unknown",
    "reasons": [
      "insufficient_semantic_signal"
    ],
    "warnings": [
      "lossy_compression_not_allowed"
    ]
  },
  {
    "mode": "semantic",
    "reasons": [
      "natural_language"
    ],
    "warnings": []
  },
  {
    "mode": "exact",
    "reasons": [
      "identifier_or_hash",
      "code_or_path"
    ],
    "warnings": [
      "lossy_compression_not_allowed"
    ]
  },
  {
    "mode": "exact",
    "reasons": [
      "secret",
      "identifier_or_hash",
      "code_or_path"
    ],
    "warnings": [
      "lossy_compression_not_allowed"
    ]
  }
] as const;
const forms = [
  ["plain-colon", (l: string) => `${l}:`], ["fullwidth-colon", (l: string) => `${l}：`], ["space-fullwidth", (l: string) => `${l} ：`],
  ["bold-out", (l: string) => `**${l}**:`], ["bold-in", (l: string) => `**${l}:**`], ["bold-out-fw", (l: string) => `**${l}**：`],
  ["italic-star", (l: string) => `*${l}*:`], ["bold-italic", (l: string) => `***${l}***:`], ["bold-space", (l: string) => `**${l}** :`],
  ["bold-us", (l: string) => `__${l}__:`], ["italic-us", (l: string) => `_${l}_:`], ["strike", (l: string) => `~~${l}~~:`],
  ["code-span", (l: string) => `\`${l}\`:`], ["dquote", (l: string) => `"${l}":`], ["squote", (l: string) => `'${l}':`], ["paren", (l: string) => `(${l}):`],
  ["bracket", (l: string) => `[${l}]:`], ["equals-bold", (l: string) => `**${l}**=`],
];

// Each pair is standalone/sentence; 18 pairs follow forms above. New expected
// values are frozen from the approved contract, never computed by a classifier or regex.
const matrix = [
  ["en", "password", "00 12 12 12 00 12 12 12 12 12 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00"],
  ["en", "Password", "00 12 12 12 00 12 12 12 12 12 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00"],
  ["en", "api key", "00 12 12 12 00 12 12 12 12 33 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 33 12 12 11 12 12 12 11 00"],
  ["en", "API_KEY", "44 33 33 33 44 33 33 33 33 11 11 33 33 33 33 33 33 33", "44 44 44 44 44 44 44 44 44 11 11 33 33 33 33 33 33 44"],
  ["en", "token", "00 12 12 12 00 12 12 12 12 12 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00"],
  ["en", "secret", "00 12 12 12 00 12 12 12 12 12 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00"],
  ["en", "passphrase", "00 12 12 12 00 12 12 12 12 12 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00"],
  ["en", "pass", "00 12 12 12 00 12 12 12 12 12 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 12 12 12 11 12 12 12 11 00"],
  ["en", "recovery codes", "00 12 12 12 00 12 12 12 12 33 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 33 12 12 11 12 12 12 11 00"],
  ["en", "client secret", "00 12 12 12 00 12 12 12 12 33 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 33 12 12 11 12 12 12 11 00"],
  ["ko", "비밀번호", "00 00 00 12 00 12 12 12 12 11 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 11 12 12 11 12 12 12 11 00"],
  ["ko", "암호", "00 00 00 12 00 12 12 12 12 11 12 12 11 12 12 12 11 12", "00 00 00 00 00 00 00 00 00 11 12 12 11 12 12 12 11 00"],
  ["ko", "API 키", "00 00 00 11 00 11 11 11 11 11 11 11 11 11 11 11 11 11", "00 00 00 00 00 00 00 00 00 11 11 11 11 11 11 11 11 00"],
] as const;
const sentence = (lang: string, token: string) => lang === "en"
  ? `Guest wifi ${token} hunter2 is taped under the desk for visitors.`
  : `회의실 ${token} hunter2 이니까 접속할 때 참고해 주세요.`;
const cases = matrix.flatMap(([lang, label, oldCodes, newCodes]) => forms.flatMap(([name, make], i) => {
  const token = (make as (label: string) => string)(label);
  return [token + " hunter2", sentence(lang, token)].map((content, placement) => ({
    name: `${lang}/${label}/${name}/${placement === 0 ? "standalone" : "sentence"}`, content,
    before: outputs[Number(oldCodes.split(" ")[i][placement])],
    after: outputs[Number(newCodes.split(" ")[i][placement])],
  }));
}));
const oldRegexes = [
  /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\s*[:=]/iu,
  /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\s*[:=]/i,
  /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\s*[:=：]/i,
  /(?<![A-Za-z0-9])api[ \t]?키\s*[:=：]/i,
];
const approvedRegexes = [
  /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b\*{0,3}\s*[:=：]/iu,
  /\b(?:passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?)\b\*{0,3}\s*[:=：]/i,
  /(?:비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드)\*{0,3}\s*[:=：]/i,
  /(?<![A-Za-z0-9])api[ \t]?키\*{0,3}\s*[:=：]/i,
];

describe("N27/N30 frozen literal contract", () => {
  it.each(cases)("matrix $name", ({content, before, after}) => {
    expect(baseline(content)).toEqual(before);
    expect(classifyContext(content)).toEqual(after);
    expect(evaluatePolicyPredicate(current.EXACT_PATTERNS[0][1], content)).toBe(after.reasons.some(reason => reason === "secret"));
  });
  it("keeps 468 placements and all nonzero tuples unchanged", () => {
    expect(cases).toHaveLength(468);
    expect(current.EXACT_PATTERNS.map(([reason]) => reason)).toEqual(oldInternals.EXACT_PATTERNS.map(([reason]) => reason));
    expect(current.EXACT_PATTERNS.slice(1).map(([,p])=>p.toString())).toEqual(oldInternals.EXACT_PATTERNS.slice(1).map(([,p])=>p.toString()));
  });
  it("preserves every frozen old positive in the matrix and generated boundary corpus", () => {
    const inputs = [...cases.map(r=>r.content)];
    for (const label of ["password","api_key","passwd","pwd","passphrase","pass","passcode","pass phrase","credentials","private key","recovery codes","secret answer","backup codes","비밀번호","비번","인증키","토큰","API 키"]) {
      for(const prefix of ["", "Guest wifi ", "_", "a", "카카오"])
        for(const gap of ["", " ", "\t", "\n", "\u00a0", "\u3000"])
          for(const sep of [":", "=", "："]) inputs.push(prefix+label+gap+sep+" hunter2");
    }
    const hits=[0,0,0,0];
    for(const content of inputs) for(const [i,old] of oldRegexes.entries()) if(old.test(content)) {
      hits[i]++; expect(approvedRegexes[i].test(content), content).toBe(true);
      expect(evaluatePolicyPredicate(current.EXACT_PATTERNS[0][1], content), content).toBe(true);
    }
    expect(hits.every(n=>n>0)).toBe(true);
  });
});

// Nine verbatim predesign negatives, approved boundary cases, and four underscore limits.
const boundaryCases = [
  {
    "content": "The **password manager** keeps every login safe across your devices.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "Use a **token-based** approach: it scales better for many clients.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "We stored it in my__password__: wait, that name was never used here.",
    "before": {
      "mode": "exact",
      "reasons": [
        "identifier_or_hash",
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "identifier_or_hash",
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "The password_hash: value is computed on the server and never shown.",
    "before": {
      "mode": "exact",
      "reasons": [
        "identifier_or_hash",
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "identifier_or_hash",
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "Remember this **secret** of the trade: always test with real data.",
    "before": {
      "mode": "exact",
      "reasons": [
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "The **token-based** flow: every client refreshes its session hourly.",
    "before": {
      "mode": "exact",
      "reasons": [
        "identifier_or_hash",
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "identifier_or_hash",
        "code_or_path"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "A **passport**: issued by the state department for travel abroad.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "Our **passwords**: rotate them every ninety days according to policy.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "**Secret Santa**: draw names at the party and keep them to yourself.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "**password**： hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **password**： hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**password** ： hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **password** ： hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "*비밀번호*： hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 *비밀번호*： hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "****password****: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "회의실 ****password****: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "**password*: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **password*: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "password*: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 password*: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**password** : hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **password** : hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**비밀번호**　: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **비밀번호**　: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**PaSsWoRd**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **PaSsWoRd**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**PASSWD**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **PASSWD**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**aPi키**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **aPi키**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**ſecret**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 **ſecret**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "**paſſwd**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "회의실 **paſſwd**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "xapi키**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "회의실 xapi키**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "1api키**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "회의실 1api키**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "카카오api키**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "회의실 카카오api키**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "exact",
      "reasons": [
        "secret"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": true
  },
  {
    "content": "password**＝ hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "회의실 password**＝ hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "**passwords**: hunter2",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  },
  {
    "content": "회의실 **passwords**: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "Guest wifi __password__: hunter2 is taped under the desk for visitors.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "Guest wifi _password_: hunter2 is taped under the desk for visitors.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "회의실 _비밀번호_: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "after": {
      "mode": "semantic",
      "reasons": [
        "natural_language"
      ],
      "warnings": []
    },
    "tuple0": false
  },
  {
    "content": "회의실 __비밀번호__: hunter2 이니까 접속할 때 참고해 주세요.",
    "before": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "after": {
      "mode": "unknown",
      "reasons": [
        "insufficient_semantic_signal"
      ],
      "warnings": [
        "lossy_compression_not_allowed"
      ]
    },
    "tuple0": false
  }
];
it.each(boundaryCases)("frozen boundary $content", ({content,before,after,tuple0}) => {
  expect(baseline(content)).toEqual(before);
  expect(classifyContext(content)).toEqual(after);
  expect(evaluatePolicyPredicate(current.EXACT_PATTERNS[0][1],content)).toBe(tuple0);
});

it.each(["passwd", "비밀번호", "api키"])("rejects four closing stars on the %s regex path", label => {
  for (const content of [`****${label}****: hunter2`, `회의실 ****${label}****: hunter2 이니까 접속할 때 참고해 주세요.`]) {
    expect(evaluatePolicyPredicate(current.EXACT_PATTERNS[0][1], content)).toBe(false);
    expect(classifyContext(content).reasons).not.toContain("secret");
    expect(classifyContext(content)).toEqual(baseline(content));
  }
});
