"""Launch the registered study, specializing only the upstream 18-entry input guard."""
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]/"experiments/ko-header-window-safety"))
import run_study

phase = run_study.phase


def study_phase(label, args, output, env):
    if label in {"ocr", "predict", "build"}:
        args = [args[0], "--import", (HERE/"input-count.mjs").as_uri(), *args[1:]]
    return phase(label, args, output, env)


if __name__ == "__main__":
    run_study.phase = study_phase
    run_study.main()
