"""Run an unchanged figure generator and record what each figure draws.

Usage: python d03_figprobe.py <capture.json> <generator.py> [generator args...]

Figure.savefig is wrapped: on the PNG save of each figure, the axes, lines, error bars, bars, texts and legends are
written to <capture.json> under the file stem. The generator's own code and output files are not changed.
"""
import json
import runpy
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
from matplotlib import colors  # noqa: E402
from matplotlib.container import BarContainer, ErrorbarContainer  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

CAPTURE = Path(sys.argv[1])
SCRIPT = Path(sys.argv[2])
captured = {}


def hexc(c):
    try:
        return colors.to_hex(c)
    except (TypeError, ValueError):
        return None


def lst(a):
    return [float(x) for x in a]


def legend(lg):
    if lg is None:
        return None
    return {"title": lg.get_title().get_text() or None, "texts": [t.get_text() for t in lg.get_texts()]}


def err_segments(eb):
    segs = []
    for col in eb.lines[2]:
        segs.extend([[lst(p) for p in s] for s in col.get_segments()])
    return segs


def axes_info(ax):
    errorbars, bars = [], []
    for cont in ax.containers:
        if isinstance(cont, ErrorbarContainer):
            data = cont.lines[0]
            errorbars.append({"data": [lst(p) for p in data.get_xydata()] if data is not None else None,
                              "segments": err_segments(cont), "color": hexc(data.get_color()) if data is not None else None,
                              "marker": data.get_marker() if data is not None else None})
        elif isinstance(cont, BarContainer):
            patches = [{"x": float(p.get_x()), "width": float(p.get_width()), "height": float(p.get_height()),
                        "face": hexc(p.get_facecolor()), "hatch": p.get_hatch()} for p in cont.patches]
            bars.append({"label": cont.get_label(), "patches": patches,
                         "edgecolor": hexc(cont.patches[0].get_edgecolor()) if cont.patches else None,
                         "segments": err_segments(cont.errorbar) if cont.errorbar is not None else []})
    in_containers = set()
    for cont in ax.containers:
        if isinstance(cont, ErrorbarContainer) and cont.lines[0] is not None:
            in_containers.add(id(cont.lines[0]))
    lines = [{"label": ln.get_label(), "x": lst(ln.get_xdata()), "y": lst(ln.get_ydata()), "marker": ln.get_marker(),
              "color": hexc(ln.get_color()), "linestyle": ln.get_linestyle()}
             for ln in ax.get_lines() if id(ln) not in in_containers]
    texts = [{"text": t.get_text(), "color": hexc(t.get_color())} for t in ax.texts]
    return {"title": ax.get_title(), "xlabel": ax.get_xlabel(), "ylabel": ax.get_ylabel(),
            "xlim": lst(ax.get_xlim()), "ylim": lst(ax.get_ylim()), "xscale": ax.get_xscale(), "yscale": ax.get_yscale(),
            "xticklabels": [t.get_text() for t in ax.get_xticklabels()], "lines": lines, "errorbars": errorbars,
            "bars": bars, "texts": texts, "legend": legend(ax.get_legend())}


_orig = Figure.savefig


def savefig(self, fname, *args, **kwargs):
    p = Path(str(fname))
    if p.suffix.lower() == ".png":
        captured[p.stem] = {"size_inches": lst(self.get_size_inches()), "dpi": kwargs.get("dpi"),
                            "axes": [axes_info(a) for a in self.axes], "figlegends": [legend(lg) for lg in self.legends]}
    return _orig(self, fname, *args, **kwargs)


Figure.savefig = savefig
sys.argv = [str(SCRIPT)] + sys.argv[3:]
runpy.run_path(str(SCRIPT), run_name="__main__")
CAPTURE.write_text(json.dumps(captured, ensure_ascii=False, indent=1), encoding="utf-8")
