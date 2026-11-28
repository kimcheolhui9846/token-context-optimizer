"""Exercise the public compare command with disposable local inputs."""
from contextlib import redirect_stdout
from datetime import datetime, timedelta
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from uuid import UUID

import d03_delivery
import d03_repro as repro


MATCH = {
    "items": [{"item": item, "verdict": "MATCH"} for item in ("T1", "T2", "T3", "F1", "F2", "F3", "F4")],
    "passed": 7,
    "total": 7,
    "scientificPass": True,
    "deliveryPass": True,
    "requiredPDFs": [
        {"item": f"F{i}", "path": f"generated/figures/f{i}.pdf", "pass": True, "reason": "match"}
        for i in range(1, 5)
    ],
    "secondaryBlobEqual": [
        {"path": "synthetic/changed.json", "bytesEqual": False},
        {"path": "synthetic/equal.json", "bytesEqual": True},
        {"path": "synthetic/missing.json", "bytesEqual": False},
    ],
    "secondaryEqualCount": 1,
}
MISMATCH = {
    **MATCH,
    "items": [{"item": "T1", "verdict": "MISMATCH"}, *MATCH["items"][1:]],
    "passed": 6,
    "scientificPass": False,
}


def write_json(path, data):
    path.write_text(json.dumps(data), encoding="utf-8")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


class CompareAttempt(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.pkg = root / "package"
        self.out = root / "out"
        self.pkg.mkdir()
        self.out.mkdir()
        write_json(self.pkg / "MANIFEST.json", {"files": [], "manuscriptBlob": "synthetic"})
        self.verify = self.enterContext(patch.object(repro, "verify_manifest", return_value={
            "ok": True, "files": 0, "missing": [], "corrupt": [], "extra": [],
        }))

    def cli_args(self):
        return ["compare", "--package", str(self.pkg), "--out", str(self.out)]

    def cli(self):
        args = ["d03_repro.py", *self.cli_args()]
        stdout = io.StringIO()
        with patch.object(repro.sys, "argv", args), redirect_stdout(stdout):
            code = repro.main()
        return code, stdout.getvalue()

    def runs(self, *, offline=True):
        write_json(self.out / "runs.json", {
            "ok": True,
            "runs": [{"step": "render-tables", "command": ["python", "synthetic.py"], "exit": 0, "pid": 10}],
            "offline": {"ok": offline, "steps": 1, "guardStarts": 1, "stepsWithoutGuard": [],
                        "blockedEvents": 0 if offline else 1, "blockedKinds": [], "blockedSteps": []},
        })

    def legacy_all(self):
        write_json(self.out / "report.json", {"command": "all", "pass": True, "compare": MATCH,
                                              "scientificPass": True, "deliveryPass": True})
        (self.out / "report.md").write_bytes(b"# Historical all report\r\n")
        return {name: (self.out / name).read_bytes() for name in ("report.json", "report.md")}

    def verify_attempt(self, outcome, *, code, status):
        exit_code, stdout = outcome
        self.assertEqual(exit_code, code)
        latest = self.out / "compare.json"
        self.assertTrue(latest.is_file(), "recognized directory must record the latest comparison")
        report = read_json(latest)
        self.assertEqual((report.get("command"), report.get("status")), ("compare", status))
        run_id = report.get("runId")
        self.assertIsInstance(run_id, str)
        self.assertEqual(str(UUID(run_id)), run_id)
        started, finished = (datetime.fromisoformat(report[field]) for field in ("startedAt", "finishedAt"))
        self.assertEqual(started.utcoffset(), timedelta(0))
        self.assertEqual(finished.utcoffset(), timedelta(0))
        self.assertLessEqual(started, finished)

        manifest = read_json(self.out / "outputs-manifest.json")
        self.assertEqual((manifest.get("runId"), manifest.get("command"), manifest.get("status")),
                         (run_id, "compare", status))
        self.assertIn(run_id, (self.out / "compare.md").read_text(encoding="utf-8"))
        public = json.loads(stdout)
        self.assertEqual((public.get("runId"), public.get("command"), public.get("status")),
                         (run_id, "compare", status))
        if status == "refused":
            for field in ("scientificPass", "deliveryPass", "passed", "total", "secondaryTotal",
                          "secondaryEqualCount"):
                self.assertIn(field, report)
                self.assertIsNone(report[field])
            for field in ("scientificPass", "deliveryPass", "secondaryTotal", "secondaryEqualCount"):
                self.assertIn(field, manifest)
                self.assertIsNone(manifest[field])
        return report

    def assert_last_success(self, report, run_id, command):
        previous = report.get("lastSuccess")
        self.assertIsInstance(previous, dict)
        self.assertIn("runId", previous)
        self.assertEqual((previous["runId"], previous.get("command")), (run_id, command))
        if run_id is None:
            self.assertIsNone(previous.get("startedAt"))
            self.assertIsNone(previous.get("finishedAt"))

    def test_empty_directory_is_refused_without_creating_evidence(self):
        code, _ = self.cli()
        self.assertEqual(code, 2)
        self.verify.assert_not_called()
        self.assertEqual(list(self.out.iterdir()), [])

    def synthetic_science_inputs(self):
        write_json(self.out / "probe-make_figures.json", {
            "fig1_rq1_billed_tokens": {}, "fig2_heldout_accuracy_vs_tokens": {}, "fig3_heldout_late_recall": {},
        })
        write_json(self.out / "probe-exp2_figures.json", {"fig5_exp2_accuracy_vs_tokens": {}})
        for provider in ("gpt4o", "haiku"):
            path = self.out / "generated/s3-heldout" / provider / "analysis.json"
            path.parent.mkdir(parents=True)
            write_json(path, {})

    def compare_with_stubs(self, *, real_checks=(), overrides=None):
        science = {f"check_t{i}": Mock(return_value={"item": f"T{i}", "verdict": "MATCH"})
                   for i in range(1, 4) if f"T{i}" not in real_checks}
        science.update({f"check_f{i}": Mock(return_value={})
                        for i in range(1, 5) if f"F{i}" not in real_checks})
        science.update(overrides or {})
        science.update(render_compare=Mock(return_value={}), figure_verdict=Mock(
            side_effect=lambda item, *_: {"item": item, "verdict": "MATCH"},
        ))
        with patch.multiple(repro.checks, **science), patch.object(
            d03_delivery, "check_figure_pdf", return_value={"pass": True, "reason": "match"},
        ):
            return self.cli()

    def test_runs_only_directory_passes_with_advisory_secondary_differences(self):
        self.runs()
        expected = self.pkg / "expected/results/synthetic"
        generated = self.out / "generated/synthetic"
        expected.mkdir(parents=True)
        generated.mkdir(parents=True)
        for name in ("equal.json", "changed.json", "missing.json"):
            write_json(expected / name, {"value": 1})
        write_json(generated / "equal.json", {"value": 1})
        write_json(generated / "changed.json", {"value": 2})
        self.synthetic_science_inputs()
        outcome = self.compare_with_stubs()
        report = self.verify_attempt(outcome, code=0, status="passed")
        self.assertTrue(report.get("pass"))
        self.assertIsNone(report["lastSuccess"])
        self.assertEqual((report.get("secondaryEqualCount"), report.get("secondaryTotal")), (1, 3))
        warnings = ["synthetic/changed.json", "synthetic/missing.json"]
        self.assertEqual(report.get("secondaryWarnings"), warnings)
        md = (self.out / "compare.md").read_text(encoding="utf-8")
        cli = json.loads(outcome[1])
        for path in warnings:
            self.assertIn(path, md)
        self.assertEqual(cli.get("secondaryWarnings"), warnings)

    def test_malformed_generated_s3_analysis_only_blocks_its_three_consumers(self):
        self.runs()
        self.synthetic_science_inputs()
        manuscript = self.pkg / repro.MANUSCRIPT_PATH
        manuscript.parent.mkdir(parents=True)
        manuscript.write_text("표 3. Synthetic tables\n| A |\n|---|\n\n| B |\n|---|\n", encoding="utf-8")
        relative = "generated/s3-heldout/gpt4o/analysis.json"
        (self.out / relative).write_bytes(b'{"broken":')

        outcome = self.compare_with_stubs(real_checks=("T3",))
        report = self.verify_attempt(outcome, code=1, status="failed")

        self.assert_unavailable(outcome, report, {"T3", "F3", "F4"}, path=relative)
        for row in json.loads(outcome[1])["unavailable"]:
            self.assertIn("invalid JSON", row["error"])

    def assert_unavailable(self, outcome, report, affected, *, path=None):
        self.assertEqual((report["scientificPass"], report["deliveryPass"]), (False, True))
        all_items = {"T1", "T2", "T3", "F1", "F2", "F3", "F4"}
        self.assertEqual((report["passed"], report["total"]), (len(all_items - affected), len(all_items)))
        items = {row["item"]: row for row in report["items"]}
        self.assertEqual(set(items), all_items)
        for item, row in items.items():
            with self.subTest(item=item):
                self.assertEqual(row["verdict"], "NOT-REPRODUCIBLE" if item in affected else "MATCH")
                if item in affected and path is not None:
                    self.assertEqual(row["path"], path)
        unavailable = json.loads(outcome[1])["unavailable"]
        self.assertEqual({row["item"] for row in unavailable}, affected)
        if path is not None:
            self.assertEqual({row["path"] for row in unavailable}, {path})

    def test_sessions_json_with_non_list_rows_only_blocks_f3_and_f4(self):
        self.runs()
        self.synthetic_science_inputs()
        relative = "generated/figures/data/heldout-sessions.json"
        sessions = self.out / relative
        sessions.parent.mkdir(parents=True)
        write_json(sessions, {"rows": "wrong-shape"})

        outcome = self.compare_with_stubs(real_checks=("F3", "F4"))
        report = self.verify_attempt(outcome, code=1, status="failed")
        self.assert_unavailable(outcome, report, {"F3", "F4"}, path=relative)

    def test_missing_file_with_no_filename_or_outside_path_stays_with_its_item(self):
        self.runs()
        self.synthetic_science_inputs()
        external = self.out.parent / "outside-owned-roots" / "synthetic.json"
        for kind, error in (
            ("no filename", FileNotFoundError("missing synthetic input")),
            ("outside roots", FileNotFoundError(2, "missing synthetic input", str(external))),
        ):
            with self.subTest(kind=kind):
                outcome = self.compare_with_stubs(overrides={"check_t2": Mock(side_effect=error)})
                report = self.verify_attempt(outcome, code=1, status="failed")
                self.assert_unavailable(outcome, report, {"T2"})
                published = [outcome[1]]
                for name in ("compare.json", "compare.md", "outputs-manifest.json"):
                    published.append((self.out / name).read_text(encoding="utf-8"))
                for text in published:
                    self.assertNotIn(self.out.parent.name, text)
                    self.assertNotIn("outside-owned-roots", text)


    def test_invalid_runs_json_replaces_previous_compare_with_refusal(self):
        self.legacy_all()
        previous_id = "da5db2e4-2a8d-4ed9-900c-69bc636d0c1c"
        write_json(self.out / "compare.json", {
            **MATCH, "command": "compare", "pass": True, "status": "passed", "runId": previous_id,
            "startedAt": "2026-01-01T00:00:00Z", "finishedAt": "2026-01-01T00:00:01Z",
        })
        (self.out / "runs.json").write_bytes(b'{"ok":')
        with patch.object(repro, "compare") as grade:
            refused = self.verify_attempt(self.cli(), code=2, status="refused")
        grade.assert_not_called()
        self.verify.assert_not_called()
        self.assertNotEqual(refused["runId"], previous_id)
        self.assert_last_success(refused, previous_id, "compare")

    def test_last_success_tracks_preceding_passes_without_rewriting_legacy_all(self):
        historical = self.legacy_all()
        self.runs()
        attempts = []
        for template, code, status in [
            (MISMATCH, 1, "failed"), (MATCH, 0, "passed"),
            (MISMATCH, 1, "failed"), (MISMATCH, 1, "failed"), (MATCH, 0, "passed"),
        ]:
            with patch.object(repro, "compare", return_value=dict(template)):
                attempts.append(self.verify_attempt(self.cli(), code=code, status=status))

        failed, first_pass, failed_again, consecutive_failure, recovered = attempts
        self.assertEqual(len({attempt["runId"] for attempt in attempts}), len(attempts))
        self.assert_last_success(failed, None, "all")
        self.assert_last_success(first_pass, None, "all")
        for report in (failed_again, consecutive_failure, recovered):
            self.assert_last_success(report, first_pass["runId"], "compare")

        self.runs(offline=False)
        self.verify.reset_mock()
        with patch.object(repro, "compare") as grade:
            refused = self.verify_attempt(self.cli(), code=4, status="refused")
        grade.assert_not_called()
        self.verify.assert_not_called()
        self.assertNotIn(refused["runId"], {attempt["runId"] for attempt in attempts})
        self.assert_last_success(refused, recovered["runId"], "compare")
        for name, original in historical.items():
            self.assertEqual((self.out / name).read_bytes(), original)

    def test_running_record_cannot_be_replaced_by_second_compare(self):
        self.runs()
        active = {}

        def grade(_pkg, _out):
            latest = self.out / "compare.json"
            self.assertTrue(latest.is_file(), "publish running attempt before starting comparison")
            before = latest.read_bytes()
            active.update(json.loads(before))
            self.assertEqual((active.get("command"), active.get("status")), ("compare", "running"))
            self.assertIsNotNone(active.get("startedAt"))
            self.assertIsNone(active.get("finishedAt"))
            markdown = self.out / "compare.md"
            running_markdown = markdown.read_bytes()
            self.assertIn(active["runId"].encode("ascii"), running_markdown)
            competitor = subprocess.run(
                [sys.executable, "-B", repro.__file__, *self.cli_args()],
                capture_output=True, timeout=15,
            )
            self.assertNotEqual(competitor.returncode, 0)
            self.assertEqual(competitor.stderr, b"")
            self.assertEqual(latest.read_bytes(), before)
            self.assertEqual(markdown.read_bytes(), running_markdown)
            return dict(MATCH)

        with patch.object(repro, "compare", side_effect=grade):
            passed = self.verify_attempt(self.cli(), code=0, status="passed")
        self.assertEqual(passed["runId"], active["runId"])
        self.assertEqual(passed["startedAt"], active["startedAt"])
