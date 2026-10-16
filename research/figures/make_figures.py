"""Paper figures for the IEIE journal draft (half column 7 cm, full width 14 cm; 7 pt text; vector PDF + 600 dpi PNG).

Inputs are committed results only:
  results/rq1-sweep-001/rows.jsonl          (RQ1 accounting sweep)
  figures/data/heldout-sessions.json        (node src/figure-data.mjs; frozen scoring)
Confidence intervals on the held-out figures are descriptive (session bootstrap of each condition mean, 10,000 resamples,
seed 20261015); the pre-registered paired tests are in results/s3-heldout/*/analysis.md.
Usage (from research/): python figures/make_figures.py
"""
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "figures"
CM = 1 / 2.54
HALF, FULL = 7 * CM, 14 * CM
# Okabe-Ito palette (colour-blind safe); markers and hatches keep the figures readable in grayscale print.
C = {"gpt4o": "#0072B2", "haiku": "#D55E00", "grey": "#555555"}
PROVIDER = {"gpt4o": "GPT-4o", "haiku": "Claude Haiku 4.5"}
CONDS = ["S0", "S1", "S2", "S3", "S4"]
COND_LABEL = {"S0": "S0 keep all", "S1": "S1 compact", "S2": "S2 plugin", "S3": "S3 plugin+compact", "S4": "S4 1536 resize"}
plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 7, "axes.titlesize": 7, "axes.labelsize": 7, "legend.fontsize": 6,
    "xtick.labelsize": 6.5, "ytick.labelsize": 6.5, "axes.linewidth": 0.6, "lines.linewidth": 1.0,
    "pdf.fonttype": 42, "svg.fonttype": "none", "axes.spines.top": False, "axes.spines.right": False,
})


def save(fig, name):
    # No bbox trimming: the saved file is exactly the canvas width (7 cm half column, 14 cm full width), so it can be placed
    # at 100% and the stated point sizes hold (PR #36 review M-1).
    fig.savefig(OUT / f"{name}.pdf")
    fig.savefig(OUT / f"{name}.png", dpi=600)
    plt.close(fig)


def boot_ci(values, seed=20261015, n=10_000):
    v = np.asarray(values, dtype=float)
    rng = np.random.default_rng(seed)
    means = v[rng.integers(0, len(v), size=(n, len(v)))].mean(axis=1)
    return v.mean(), np.percentile(means, 2.5), np.percentile(means, 97.5)


def fig1_rq1():
    rows = [json.loads(l) for l in (ROOT / "results/rq1-sweep-001/rows.jsonl").read_text(encoding="utf-8").splitlines() if l]
    rows = [r for r in rows if r["format"] == "png" and r["group"].startswith("grid")]
    ratios = [("grid 1:1", "1:1", "o"), ("grid 4:3", "4:3", "s"), ("grid 16:9", "16:9", "^"), ("grid 3:1", "3:1", "D")]
    shades = ["#000000", "#0072B2", "#009E73", "#D55E00"]
    fig, axes = plt.subplots(1, 2, figsize=(FULL, 5.2 * CM), sharex=True)
    for ax, (key, title) in zip(axes, [("openaiHigh", "GPT-4o (detail high)"), ("anthropic", "Claude Haiku 4.5")]):
        longs = [256, 512, 768, 1024, 1536, 2048, 3072]
        for (group, label, marker), colour in zip(ratios, shades):
            pts = dict((max(r["width"], r["height"]), r[key]["measured"]) for r in rows if r["group"] == group)
            ys = [pts[L] for L in longs]
            wide = group == "grid 1:1"
            ax.plot(range(len(longs)), ys, marker=marker, markersize=4.5 if wide else 3, color=colour, label=label,
                    linewidth=2.2 if wide else 1.0, linestyle="--" if wide else "-", zorder=1 if wide else 2,
                    mfc="white" if wide else colour)
        ax.set_xticks(range(len(longs)))
        ax.set_xticklabels([str(L) for L in longs])
        ax.set_title(title)
        ax.set_xlabel("Long side (px)")
        ax.grid(axis="y", linewidth=0.3, alpha=0.5)
    axes[0].set_ylabel("Billed image tokens")
    axes[1].axhline(1568, color=C["grey"], linewidth=0.6, linestyle=":")
    axes[1].text(0, 1600, "1,568 visual-patch cap", fontsize=6, color=C["grey"], va="bottom")
    axes[0].text(4.6, 730, "1:1 = 4:3", fontsize=6, color=C["grey"], va="top")
    axes[0].legend(title="Aspect ratio", title_fontsize=6, frameon=False, loc="upper left")
    fig.tight_layout(w_pad=1.2)
    save(fig, "fig1_rq1_billed_tokens")


def load_sessions():
    return json.loads((ROOT / "figures/data/heldout-sessions.json").read_text(encoding="utf-8"))["rows"]


LABEL_OFFSET = {("gpt4o", "S0"): (5, 2), ("gpt4o", "S4"): (5, -6), ("gpt4o", "S2"): (5, 1), ("gpt4o", "S3"): (-13, -7),
                ("haiku", "S0"): (5, 2), ("haiku", "S4"): (5, -6), ("haiku", "S2"): (5, 0), ("haiku", "S3"): (5, -4)}


def fig2_accuracy_tokens(rows):
    fig, ax = plt.subplots(figsize=(HALF, 5.6 * CM))
    markers = {"S0": "o", "S1": "v", "S2": "s", "S3": "D", "S4": "^"}
    for p in ["gpt4o", "haiku"]:
        for c in CONDS:
            rs = [r for r in rows if r["provider"] == p and r["condition"] == c]
            m, lo, hi = boot_ci([r["accuracy"] for r in rs])
            x = np.mean([r["promptTokens"] for r in rs]) / 1000
            ax.errorbar(x, m * 100, yerr=[[m * 100 - lo * 100], [hi * 100 - m * 100]], fmt=markers[c], color=C[p],
                        markersize=3.5, elinewidth=0.6, capsize=1.5, mfc=C[p] if p == "gpt4o" else "white")
            dx, dy = LABEL_OFFSET.get((p, c), (4, -2))
            ax.annotate(c, (x, m * 100), xytext=(dx, dy), textcoords="offset points", fontsize=6, color=C[p])
    ax.set_xlabel("Mean input tokens per session (×1,000)")
    ax.set_ylabel("Session accuracy (%)")
    ax.set_ylim(30, 100)
    ax.grid(linewidth=0.3, alpha=0.5)
    from matplotlib.lines import Line2D
    ax.legend(handles=[Line2D([], [], marker="o", color=C["gpt4o"], linestyle="", markersize=3.5, label=PROVIDER["gpt4o"]),
                       Line2D([], [], marker="o", color=C["haiku"], mfc="white", linestyle="", markersize=3.5, label=PROVIDER["haiku"])],
              frameon=False, loc="lower right")
    fig.tight_layout()
    save(fig, "fig2_heldout_accuracy_vs_tokens")


def grouped_bars(ax, rows, metric, scale=100.0, conds=CONDS):
    width = 0.38
    x = np.arange(len(conds))
    for i, p in enumerate(["gpt4o", "haiku"]):
        stats = [boot_ci([r[metric] for r in rows if r["provider"] == p and r["condition"] == c]) for c in conds]
        m = np.array([s[0] for s in stats]) * scale
        err = np.array([[s[0] - s[1] for s in stats], [s[2] - s[0] for s in stats]]) * scale
        ax.bar(x + (i - 0.5) * width, m, width, color=C[p] if i == 0 else "white", edgecolor=C[p], linewidth=0.7,
               hatch=None if i == 0 else "////", label=PROVIDER[p], yerr=err, error_kw={"elinewidth": 0.6, "capsize": 1.5})
    ax.set_xticks(x)
    ax.set_xticklabels(conds)


def fig3_late_recall(rows):
    fig, ax = plt.subplots(figsize=(HALF, 4.6 * CM))
    grouped_bars(ax, rows, "lateRecall")
    ax.set_ylabel("Late-recall accuracy (%)")
    ax.set_ylim(0, 105)
    ax.grid(axis="y", linewidth=0.3, alpha=0.5)
    fig.legend(*ax.get_legend_handles_labels(), frameon=False, loc="upper center", ncol=2, bbox_to_anchor=(0.5, 1.0))
    fig.tight_layout(rect=(0, 0, 1, 0.9))
    save(fig, "fig3_heldout_late_recall")


def fig4_cost(rows):
    conds = ["S0", "S1", "S2", "S3"]
    fig, axes = plt.subplots(1, 2, figsize=(HALF, 4.8 * CM), sharey=True)
    for ax, p in zip(axes, ["gpt4o", "haiku"]):
        x = np.arange(len(conds))
        for j, (metric, label, hatch) in enumerate([("listCostUsd", "list price", None), ("cacheCostUsd", "with prompt cache", "////")]):
            vals = [np.mean([r[metric] for r in rows if r["provider"] == p and r["condition"] == c]) * 100 for c in conds]
            ax.bar(x + (j - 0.5) * 0.38, vals, 0.38, color=C[p] if j == 0 else "white", edgecolor=C[p], linewidth=0.7, hatch=hatch, label=label)
        ax.set_xticks(x)
        ax.set_xticklabels(conds)
        ax.set_title(PROVIDER[p])
        ax.grid(axis="y", linewidth=0.3, alpha=0.5)
    axes[0].set_ylabel("Cost per session (US cents)")
    handles = [plt.Rectangle((0, 0), 1, 1, facecolor=C["grey"], edgecolor=C["grey"]),
               plt.Rectangle((0, 0), 1, 1, facecolor="white", edgecolor=C["grey"], hatch="////")]
    fig.legend(handles, ["list price", "with prompt cache"], frameon=False, loc="upper center", ncol=2, bbox_to_anchor=(0.5, 1.0))
    fig.tight_layout(w_pad=0.8, rect=(0, 0, 1, 0.9))
    save(fig, "fig4_heldout_cost_list_vs_cache")


if __name__ == "__main__":
    fig1_rq1()
    s = load_sessions()
    fig2_accuracy_tokens(s)
    fig3_late_recall(s)
    fig4_cost(s)
    print("wrote", sorted(p.name for p in OUT.glob("fig*")))
