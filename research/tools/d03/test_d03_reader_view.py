"""Byte-preserving reader copy tests for D03's two revised manuscripts."""
import re
import subprocess
import unittest
from pathlib import Path

from d03_reader_view import make_reader_view

ROOT = Path(__file__).resolve().parents[3]
PAPER = "docs/research/image-first-paper-draft.ko.md"
# The revised editions also exercised by test_d03_edition_update.py.
REVISIONS = ("5270a65a0eaa8263aaa1e041d5f3a1ec7b7fbe78",
             "a768783cd894f9ab2b715de7d28707b59da279bf")
NOTICE = "> 오프라인 독자용 사본입니다. 검증에는 패키지에 포함된 원본 원고를 사용합니다."
STATUS = "패키지 미수록"
# Ordered inventory of inline destinations, independent of the implementation.
FROZEN_LINKS = (
    ("../image-artifacts.md", "docs/image-artifacts.md", None),
    ("./image-first-evaluation-protocol.md", "docs/research/image-first-evaluation-protocol.md", None),
    ("./image-token-cost-models.md", "docs/research/image-token-cost-models.md", None),
    ("../../research/figures/fig1_rq1_billed_tokens.png",
     "research/figures/fig1_rq1_billed_tokens.png", "expected/figures/fig1_rq1_billed_tokens.png"),
    ("./image-first-evaluation-protocol.md", "docs/research/image-first-evaluation-protocol.md", None),
    ("./2026-10-16-experiment2-results.md", "docs/research/2026-10-16-experiment2-results.md", None),
    ("../../research/figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.png",
     "research/figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.png",
     "expected/figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.png"),
    ("../../research/results/exp2-heldout/gpt4o/exp2-analysis.md",
     "research/results/exp2-heldout/gpt4o/exp2-analysis.md",
     "expected/results/exp2-heldout/gpt4o/exp2-analysis.md"),
    ("../../research/results/exp2-heldout/haiku/exp2-analysis.md",
     "research/results/exp2-heldout/haiku/exp2-analysis.md",
     "expected/results/exp2-heldout/haiku/exp2-analysis.md"),
    ("./2026-10-15-experiment3-protocol.md", "docs/research/2026-10-15-experiment3-protocol.md", None),
    ("./2026-10-15-experiment3-results.md", "docs/research/2026-10-15-experiment3-results.md", None),
    ("./2026-10-15-experiment3-results.md", "docs/research/2026-10-15-experiment3-results.md", None),
    ("../../research/figures/fig2_heldout_accuracy_vs_tokens.png",
     "research/figures/fig2_heldout_accuracy_vs_tokens.png", "expected/figures/fig2_heldout_accuracy_vs_tokens.png"),
    ("../../research/figures/fig3_heldout_late_recall.png",
     "research/figures/fig3_heldout_late_recall.png", "expected/figures/fig3_heldout_late_recall.png"),
)


class ReaderView(unittest.TestCase):
    def test_rewrites_relative_tokens_in_document_order(self):
        original = (
            "제목\r\n앞![그림](../../research/a.png)과 [표](./a.md \"제목\")"
            " 뒤 [누락](../old.md)!\n[표](a.md#part) [표](<a.md?view=1>)\r끝"
        ).encode()
        mapping = {"docs/research/a.md": "elsewhere/table.md", "research/a.png": "images/real.png"}
        expected = (
            NOTICE + "\r\n제목\r\n앞![그림](images/real.png)과 [표](elsewhere/table.md \"제목\")"
            " 뒤 누락 (" + "`docs/old.md`, " + STATUS + ")!\n[표](elsewhere/table.md#part)"
            " [표](<elsewhere/table.md?view=1>)\r끝"
        ).encode()
        self.assertEqual(make_reader_view(original, mapping, set(mapping) | {"docs/old.md"}), expected)

    def test_preserves_nonlink_syntax_code_external_and_anchor_bytes(self):
        original = (
            "header\n[anchor](#chapter) [web](https://example.invalid/a.md) [mail](mailto:local@example.invalid)\r\n"
            "[network](//example.invalid/a.md) [root](/a.md) <https://example.invalid/a.md>\n"
            "`` [x](unknown.md) ` still code ``\n"
            "    ```\n"
            "\\[escaped](unknown.md) [reference][q]\n"
            "\n    [indented code](unknown.md)\r\n"
            "~~~md\n[code](unknown.md)\r\n~~~\n"
            "````md\r\n[block](unknown.md)\n```\n[still block](unknown.md)\n`````\n"
            "<!-- [comment](unknown.md) -->\n"
            "Text [real](a.md)"
        )
        expected = original.removesuffix("(a.md)") + "(local/a.md)"
        self.assertEqual(make_reader_view(original.encode(), {"docs/research/a.md": "local/a.md"},
                                              {"docs/research/a.md"}),
                         (NOTICE + "\n" + expected).encode())

    def test_keeps_inline_autolinks_and_multiline_code_literal(self):
        original = b"heading\n<https://example.invalid/[literal](unknown.md)>\n`code\r\n[x](unknown.md)`"
        self.assertEqual(make_reader_view(original, {}, set()), NOTICE.encode() + b"\n" + original)

    def test_preserves_relative_labels_and_uses_verified_source_set(self):
        raw = ("heading\r[`label` [part]](a.md) ![alt](b.png)"
               " [label](./a.md#note)").encode()
        expected = (NOTICE + "\rheading\r[`label` [part]](local.md) alt (`docs/research/b.png`, " +
                    STATUS + ") [label](local.md#note)").encode()
        self.assertEqual(make_reader_view(raw, {"docs/research/a.md": "local.md"},
                                              {"docs/research/a.md", "docs/research/b.png"}), expected)
        with self.assertRaisesRegex(ValueError, "unknown relative source"):
            make_reader_view(raw, {"docs/research/a.md": "local.md"}, {"docs/research/b.png"})

    def test_rejects_invalid_originals_and_unknown_relative_sources(self):
        for original in (b"\xef\xbb\xbfheading\n", b"no newline", b"\xff\n",
                         b"heading\n[unknown](unknown.md)", b"heading\n[escape](../../../x.md)"):
            with self.subTest(original=original), self.assertRaises(ValueError):
                make_reader_view(original, {}, set())

    def test_frozen_manuscripts_rewrite_exactly_four_images_two_links_and_eight_omissions(self):
        for revision in REVISIONS:
            with self.subTest(revision=revision):
                original = subprocess.check_output(["git", "show", f"{revision}:{PAPER}"], cwd=ROOT)
                sources = set(subprocess.check_output(
                    ["git", "ls-tree", "-r", "--name-only", "-z", revision], cwd=ROOT
                ).decode("utf-8").split("\0"))
                mapping = {source: dest for _, source, dest in reversed(FROZEN_LINKS) if dest}
                matches = list(re.finditer(rb"(!?)\[([^]\r\n]*)\]\(([^)\r\n]*)\)", original))
                self.assertEqual(len(matches), 14)
                self.assertEqual(len({match[3] for match in matches}), 12)
                first_eol = re.search(rb"\r\n|\n|\r", original)[0]
                chunks = [NOTICE.encode(), first_eol]
                offset = 0
                images = links = omitted = 0
                for match, (spelling, source, dest) in zip(matches, FROZEN_LINKS):
                    self.assertTrue(match[3] == spelling.encode(), "frozen token inventory changed")
                    self.assertIn(source, sources)
                    chunks.append(original[offset:match.start()])
                    if dest:
                        chunks.append(original[match.start():match.start(3)] + dest.encode() + b")")
                        images += bool(match[1])
                        links += not match[1]
                    else:
                        chunks.append(match[2] + f" (`{source}`, {STATUS})".encode())
                        omitted += 1
                    offset = match.end()
                chunks.append(original[offset:])
                self.assertEqual((images, links, omitted), (4, 2, 8))
                actual = make_reader_view(original, mapping, sources)
                self.assertTrue(actual == b"".join(chunks), "frozen reader copy byte mismatch")
