"""Offline visual delivery check for the four single-page Matplotlib PDFs."""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def _comparison_pixels(image, size):
    sampled = image.resize(size, Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(1))
    return np.asarray(sampled, dtype=np.float32)


def check_figure_pdf(pdf: Path, reference: Path) -> dict:
    """Open the PDF and compare the rendered page with the manifest-verified PNG."""
    if not pdf.is_file():
        return {"pass": False, "reason": "missing-pdf"}
    try:
        import pypdfium2 as pdfium
    except (ImportError, OSError):
        return {"pass": False, "reason": "renderer-unavailable"}

    try:
        with pdf.open("rb") as stream:
            if stream.read(5) != b"%PDF-":
                return {"pass": False, "reason": "invalid-pdf"}
            stream.seek(max(0, pdf.stat().st_size - 1024))
            if not stream.read().rstrip().endswith(b"%%EOF"):
                return {"pass": False, "reason": "incomplete-pdf"}
        with pdfium.PdfDocument(pdf) as document:
            if len(document) != 1:
                return {"pass": False, "reason": "page-count", "pages": len(document)}
            page = document[0]
            width, height = page.get_size()
            if (not all(math.isfinite(x) and 0 < x <= 4096 for x in (width, height))
                    or math.ceil(width) * math.ceil(height) > 8_000_000):
                return {"pass": False, "reason": "page-size"}
            with Image.open(reference) as original:
                if abs((width / height) / (original.width / original.height) - 1) > 0.02:
                    return {"pass": False, "reason": "aspect-ratio"}
                rgba = original.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                size = (256, max(1, round(256 * original.height / original.width)))
                expected = _comparison_pixels(background, size)
            bitmap = page.render(scale=1)
            try:
                actual = _comparison_pixels(bitmap.to_pil().convert("RGB"), size)
            finally:
                bitmap.close()
    except (OSError, ValueError, RuntimeError, pdfium.PdfiumError) as exc:
        return {"pass": False, "reason": "unreadable-figure", "errorType": type(exc).__name__}

    ink_ref = expected.min(axis=2) < 223
    ink_pdf = actual.min(axis=2) < 223
    union = np.count_nonzero(ink_ref | ink_pdf)
    overlap = np.count_nonzero(ink_ref & ink_pdf) / union if union else 0.0
    error = float(np.abs(expected - actual).mean() / 255)
    ok = bool(error <= 0.04 and min(ink_ref.mean(), ink_pdf.mean()) >= 0.005 and overlap >= 0.70)
    return {"pass": ok, "reason": "match" if ok else "content-mismatch", "pages": 1,
            "meanAbsoluteError": round(error, 6), "inkIoU": round(float(overlap), 6)}
