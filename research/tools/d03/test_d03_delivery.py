"""The four scientific figure verdicts do not imply that the PDFs can be delivered."""
import shutil
import tempfile
import unittest
from pathlib import Path

import pypdfium2 as pdfium

from d03_delivery import check_figure_pdf


FIGURES = Path(__file__).resolve().parents[2] / "figures"
STEM = "fig1_rq1_billed_tokens"


class FigureDelivery(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.pdf = Path(temp.name) / "F1.pdf"
        self.png = FIGURES / (STEM + ".png")

    def result(self):
        return check_figure_pdf(self.pdf, self.png)

    def test_published_vector_figure_matches_its_reference(self):
        shutil.copyfile(FIGURES / (STEM + ".pdf"), self.pdf)
        result = self.result()
        self.assertTrue(result["pass"], result)
        self.assertGreaterEqual(result["inkIoU"], 0.70)

    def test_missing_invalid_and_truncated(self):
        self.assertEqual(self.result()["reason"], "missing-pdf")
        self.pdf.write_bytes(b"not-a-pdf!!")
        self.assertFalse(self.result()["pass"])
        self.pdf.write_bytes(b"%PDF-1.4\nno objects\n%%EOF\n")
        self.assertEqual(self.result()["reason"], "unreadable-figure")
        data = (FIGURES / (STEM + ".pdf")).read_bytes()
        self.pdf.write_bytes(data[:len(data) // 2])
        self.assertEqual(self.result()["reason"], "incomplete-pdf")

    def test_blank_wrong_and_extra_pages(self):
        with pdfium.PdfDocument(FIGURES / (STEM + ".pdf")) as original:
            page = original[0]
            width, height = page.get_size()
            page.close()
        with pdfium.PdfDocument.new() as doc:
            doc.new_page(width, height).close()
            doc.save(self.pdf)
            self.assertEqual(self.result()["reason"], "content-mismatch")
            doc.new_page(width, height).close()
            doc.save(self.pdf)
            self.assertEqual(self.result()["reason"], "page-count")
        shutil.copyfile(FIGURES / "fig3_heldout_late_recall.pdf", self.pdf)
        self.assertFalse(self.result()["pass"])

    def test_different_figure_with_the_same_page_size(self):
        figure_two = FIGURES / "exp2/heldout/fig5_exp2_accuracy_vs_tokens.png"
        figure_three = FIGURES / "fig2_heldout_accuracy_vs_tokens.pdf"
        result = check_figure_pdf(figure_three, figure_two)
        self.assertFalse(result["pass"])
        self.assertEqual(result["reason"], "content-mismatch")

    def test_oversize_is_rejected_before_rendering(self):
        for width, height in [(4097, 10), (3000, 3000)]:
            with self.subTest(width=width, height=height), pdfium.PdfDocument.new() as doc:
                doc.new_page(width, height).close()
                doc.save(self.pdf)
                self.assertEqual(self.result()["reason"], "page-size")
