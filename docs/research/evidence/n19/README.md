# N-19 evidence

The eight JSON files dated `2026-10-28T01-*` were generated while developing the
measurement script. All have `method.prepareOnly: true`, contain no elapsed
samples, and are **not performance measurements**. They include five successful
preparations, two setup errors (ESM layout and exclusive file creation), and one
setup failure (`require is not defined`). They are preserved without alteration.

Later preparation reports are written only to the ignored
`.artifacts/n19/measurement/` directory. Preparation calls real APIs without
collecting timings. Strict performance evidence is identified by
`method.prepareOnly: false` and its recorded raw samples and `strictGate` result.

The strict gate uses nine fixed A → A′ → B samples per operation. Invalid A/A′
or failing B/A stops the run; thresholds and samples are not adjusted or retried.
Tolerant diagnostics are recorded separately and do not determine that gate.
The one-child-per-input iCCP RSS comparison is diagnostic only; the real decoder
input spy in the unit tests provides the deterministic core-only input check.

Raw source hashes retain their git-blob/worktree provenance. LF-normalized source
hashes provide a common comparison basis, and compiled hashes identify the code
actually loaded. Local paths identify generated inputs and isolated modules.
