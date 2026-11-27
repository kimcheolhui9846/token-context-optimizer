"""Build the package-root reader copy of the frozen D03 Markdown manuscript."""
from __future__ import annotations

import posixpath
import re
from urllib.parse import quote, unquote

_NOTICE = "> 오프라인 독자용 사본입니다. 검증에는 패키지에 포함된 원본 원고를 사용합니다."
_SOURCE_DIR = "docs/research"
_NEWLINE = re.compile(r"\r\n|\n|\r")
_ABSOLUTE = re.compile(r"/|[a-zA-Z][a-zA-Z0-9+.-]*:")
# Find tokens in order. Earlier alternatives consume literal contexts before a
# bracket inside them can be considered a link. This covers D03 inline syntax,
# including angle destinations, titles and the optional image marker.
_MARKDOWN = re.compile(
    r"""
    (?<![^\r\n])[ ]{0,3}(?P<fence>(?P<marker>[`~])(?P=marker){2,})[^\r\n]*
        [\s\S]*?(?:(?<![^\r\n])[ ]{0,3}(?P=fence)(?P=marker)*[ \t]*(?=[\r\n]|\Z)|\Z)
    | (?:\A|(?<=\n\n)|(?<=\r\n\r\n)|(?<=\r\r))
        (?:(?:[ ]{4}|\t)[^\r\n]*(?:\r\n|\n|\r|\Z))+
    | <!--[\s\S]*?(?:-->|\Z)
    | \\[^\w\s]
    | <(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//)[^<>\s]*>
    | (?<!`)(?P<ticks>`+)(?!`)
        (?:[^\r\n]|(?>\r\n|[\r\n])(?![ \t]*(?:[\r\n]|`{3}|~{3}|\Z)))*?
        (?<!`)(?P=ticks)(?!`)
    | !?\[(?P<label>(?:\\[^\r\n]|\[[^\[\]\r\n]*\]|[^\\\[\]\r\n])*)\]\(
        [ \t]*(?:<(?P<angle>[^<>\r\n]*)>|(?P<bare>(?:\\[^\r\n]|\([^()\r\n]*\)|[^\\()<>\s])*))
        (?:[ \t]+(?:"[^"\r\n]*"|'[^'\r\n]*'|\([^)\r\n]*\)))?[ \t]*\)
    """,
    re.VERBOSE,
)


def make_reader_view(
    original: bytes, source_to_package: dict[str, str], source_files: set[str]
) -> bytes:
    """Return UTF-8 Markdown for a reader copy located at the package root.

    The two source collections use verified repository-relative paths. A mapped
    destination is relative to the package root. Reject malformed input or a
    relative Markdown destination absent from the verified source files.
    """
    if original.startswith(b"\xef\xbb\xbf"):
        raise ValueError("D03 reader manuscript has a UTF-8 BOM")
    text = original.decode("utf-8")
    first_newline = _NEWLINE.search(text)
    if first_newline is None:
        raise ValueError("D03 reader manuscript has no newline")

    def replace(match: re.Match[str]) -> str:
        if match["label"] is None:
            return match[0]
        destination = "bare" if match["angle"] is None else "angle"
        target = match[destination]
        path = re.split(r"[?#]", target, maxsplit=1)[0]
        if not path or _ABSOLUTE.match(path):
            return match[0]
        decoded = unquote(re.sub(r"\\([^\w\s])", r"\1", path), errors="strict")
        source = posixpath.normpath(posixpath.join(_SOURCE_DIR, decoded))
        if source not in source_files:
            raise ValueError("D03 reader manuscript contains an unknown relative source")
        package_path = source_to_package.get(source)
        if package_path is None:
            ticks = "`" * (1 + max((len(run) for run in re.findall(r"`+", source)), default=0))
            return f"{match['label']} ({ticks}{source}{ticks}, 패키지 미수록)"

        start = match.start(destination) - match.start()
        return match[0][:start] + quote(package_path, safe="/") + match[0][start + len(path):]

    return (_NOTICE + first_newline[0] + _MARKDOWN.sub(replace, text)).encode("utf-8")
