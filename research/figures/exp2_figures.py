"""Experiment 2 (RQ2) figures in the IEIE format used by figures/make_figures.py (PR #36): exact canvas width (7 cm half
column), 7 pt text with a 6 pt minimum, Okabe-Ito colours plus marker shapes and fills for grayscale print.

Inputs are the graded rows written by summarize.mjs (one row per slot, arms A-E plus the exploratory Dp).
Error bars are descriptive: source-family bootstrap of each arm's family mean (10,000 resamples, seed 20261016).
The pre-registered paired tests are in each run's exp2-analysis.md.

Usage (from research/):
  python figures/exp2_figures.py --gpt4o results/exp2-cal-gpt4o-v2 --haiku results/exp2-cal-haiku-v2 --tag calibration-v2
"""
import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CM = 1 / 2.54
HALF = 7 * CM
C = {"gpt4o": "#0072B2", "haiku": "#D55E00", "grey": "#555555"}
PROVIDER = {"gpt4o": "GPT-4o", "haiku": "Claude Haiku 4.5"}
ARMS = ["A", "B", "C", "D", "E", "Dp"]
ARM_LABEL = {"A": "A", "B": "B", "C": "C", "D": "D", "E": "E", "Dp": "D′"}
MARKER = {"A": "o", "B": "v", "C": "s", "D": "D", "E": "^", "Dp": "P"}
CONDS = ["clean", "jpeg-only", "downscale-only", "combined"]
COND_TICK = ["clean", "JPEG", "1024", "1024+JPEG"]
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 7, "axes.titlesize": 7, "axes.labelsize": 7, "legend.fontsize": 6,
    "xtick.labelsize": 6.5, "ytick.labelsize": 6.5, "axes.linewidth": 0.6, "lines.linewidth": 1.0,
    "pdf.fonttype": 42, "svg.fonttype": "none", "axes.spines.top": False, "axes.spines.right": False,
})


def load(run_dir):
    rows = [json.loads(line) for line in (ROOT / run_dir / "graded.jsonl").read_text(encoding="utf-8").splitlines() if line]
    return [r for r in rows if r["outcome"] != "not_started"]


def family_scores(rows, arm):
    fams = sorted({r["family"] for r in rows})
    return np.array([np.mean([1.0 if r["contentCorrect"] else 0.0 for r in rows if r["family"] == f and r["arm"] == arm]) for f in fams])


def boot_ci(v, seed=20261016, n=10_000):
    rng = np.random.default_rng(seed)
    means = v[rng.integers(0, len(v), size=(n, len(v)))].mean(axis=1)
    return v.mean(), np.percentile(means, 2.5), np.percentile(means, 97.5)


def save(fig, out, name):
    out.mkdir(parents=True, exist_ok=True)
    fig.savefig(out / f"{name}.pdf")
    fig.savefig(out / f"{name}.png", dpi=600)
    plt.close(fig)


# Label offsets keep the six arm labels apart; tuned on the calibration run and reused for held-out.
# Per provider, because D and D' can sit at the same x a few points apart (calibration: Haiku D 72.9% below D' 75.0%).
OFFSET = {
    "gpt4o": {"A": (4, 2), "B": (4, -6), "C": (-9, -7), "D": (4, 2), "E": (4, 2), "Dp": (4, -6)},
    "haiku": {"A": (4, 2), "B": (4, -6), "C": (-9, -7), "D": (4, -7), "E": (4, 2), "Dp": (4, 3)},
}


# Pairs that share almost the same x (A/B: same input tokens; D/D': same or near tokens): the higher point gets the upper
# label so labels never swap when the order changes between runs.
PAIRS = [("A", "B"), ("D", "Dp")]


def fig5_accuracy_tokens(data, out):
    fig, ax = plt.subplots(figsize=(HALF, 5.6 * CM))
    for p, rows in data.items():
        means = {a: family_scores(rows, a).mean() for a in ARMS}
        offset = dict(OFFSET[p])
        for hi_lo in PAIRS:
            top, bottom = sorted(hi_lo, key=lambda a: -means[a])
            offset[top], offset[bottom] = (4, 2), (4, -7)
        for a in ARMS:
            m, lo, hi = boot_ci(family_scores(rows, a))
            x = np.mean([r["promptTokens"] for r in rows if r["arm"] == a and r.get("promptTokens") is not None])
            filled = a != "Dp"
            ax.errorbar(x, m * 100, yerr=[[(m - lo) * 100], [(hi - m) * 100]], fmt=MARKER[a], color=C[p], markersize=3.5,
                        elinewidth=0.6, capsize=1.5, mfc=C[p] if (p == "gpt4o" and filled) else "white")
            dx, dy = offset[a]
            ax.annotate(ARM_LABEL[a], (x, m * 100), xytext=(dx, dy), textcoords="offset points", fontsize=6, color=C[p])
    ax.set_xlabel("Mean input tokens per call")
    ax.set_ylabel("Accuracy (%, family mean)")
    ax.set_ylim(40, 100)
    ax.grid(linewidth=0.3, alpha=0.5)
    ax.legend(handles=[Line2D([], [], marker="o", color=C["gpt4o"], linestyle="", markersize=3.5, label=PROVIDER["gpt4o"]),
                       Line2D([], [], marker="o", color=C["haiku"], mfc="white", linestyle="", markersize=3.5, label=PROVIDER["haiku"])],
              frameon=False, loc="lower right")
    fig.tight_layout()
    save(fig, out, "fig5_exp2_accuracy_vs_tokens")


def fig6_by_condition(data, out):
    fig, axes = plt.subplots(1, 2, figsize=(HALF, 5.0 * CM), sharey=True)
    styles = {"A": ("-", "o"), "C": ("--", "s"), "D": ("-", "D"), "Dp": (":", "P")}
    for ax, (p, rows) in zip(axes, data.items()):
        for a, (ls, mk) in styles.items():
            ys = [100 * np.mean([1.0 if r["contentCorrect"] else 0.0 for r in rows if r["arm"] == a and r["condition"] == c]) for c in CONDS]
            ax.plot(range(4), ys, linestyle=ls, marker=mk, markersize=3, color=C[p] if a in ("D", "Dp") else C["grey"],
                    mfc="white" if a == "Dp" else None, label=ARM_LABEL[a])
        ax.set_xticks(range(4))
        ax.set_xticklabels(COND_TICK, rotation=30, ha="right")
        ax.set_title(PROVIDER[p])
        ax.grid(axis="y", linewidth=0.3, alpha=0.5)
    axes[0].set_ylabel("Accuracy (%)")
    axes[0].set_ylim(0, 105)
    handles = [Line2D([], [], linestyle=s[0], marker=s[1], markersize=3, color=C["grey"], mfc="white" if a == "Dp" else None, label=ARM_LABEL[a])
               for a, s in styles.items()]
    fig.legend(handles=handles, frameon=False, loc="upper center", ncol=4, bbox_to_anchor=(0.5, 1.0))
    fig.tight_layout(w_pad=0.6, rect=(0, 0, 1, 0.9))
    save(fig, out, "fig6_exp2_accuracy_by_condition")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--gpt4o", required=True)
    ap.add_argument("--haiku", required=True)
    ap.add_argument("--tag", required=True)
    args = ap.parse_args()
    data = {"gpt4o": load(args.gpt4o), "haiku": load(args.haiku)}
    out = ROOT / "figures" / "exp2" / args.tag
    fig5_accuracy_tokens(data, out)
    fig6_by_condition(data, out)
    print("wrote", sorted(p.name for p in out.glob("fig*")))
