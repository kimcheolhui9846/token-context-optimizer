"""Clear string properties of an HWP 5 file's summary information on a copy, in place and size-preserving.

Usage: python clear_hwp_summary.py <in.hwp> <out.hwp> <report.json> [pid,pid,...]   (default pids 4,8: author, last saver)

- copies <in.hwp> to <out.hwp> and edits only the stream "\\x05HwpSummaryInformation" of the copy
- each listed VT_LPWSTR / VT_LPSTR property gets length 1 (terminator only); its old characters are zeroed, so the
  stream size, the property offsets and every other byte stay the same
- never prints or records property values: the report holds types, lengths and stream hashes only
- checks that every other stream (body, pictures, preview, doc info) is byte-identical to the input
Requires olefile.
"""
import hashlib
import json
import shutil
import struct
import sys

import olefile

SUMMARY = "\x05HwpSummaryInformation"


def props(b):
    off = struct.unpack_from("<I", b, 44)[0]
    _size, count = struct.unpack_from("<II", b, off)
    out = {}
    for i in range(count):
        pid, poff = struct.unpack_from("<II", b, off + 8 + 8 * i)
        t = struct.unpack_from("<I", b, off + poff)[0]
        n = struct.unpack_from("<I", b, off + poff + 4)[0] if t in (0x1E, 0x1F) else None
        out[pid] = (t, off + poff, n)
    return out


def streams(path):
    o = olefile.OleFileIO(path)
    res = {"/".join(e): hashlib.sha256(o.openstream(e).read()).hexdigest() for e in o.listdir()}
    o.close()
    return res


def main():
    src, dst, report = sys.argv[1:4]
    pids = [int(x) for x in (sys.argv[4] if len(sys.argv) > 4 else "4,8").split(",")]
    shutil.copyfile(src, dst)
    o = olefile.OleFileIO(dst, write_mode=True)
    b = bytearray(o.openstream(SUMMARY).read())
    before = props(bytes(b))
    rep = {"pids": pids, "stream_len": len(b), "before": {}, "after": {}}
    for pid in pids:
        t, at, n = before[pid]
        assert t in (0x1E, 0x1F), (pid, hex(t))
        unit = 2 if t == 0x1F else 1
        rep["before"][pid] = {"type": hex(t), "chars_incl_terminator": n}
        struct.pack_into("<I", b, at + 4, 1)
        for k in range(at + 8, at + 8 + n * unit):
            b[k] = 0
    o.write_stream(SUMMARY, bytes(b))
    o.close()
    after = props(bytes(b))
    for pid in pids:
        rep["after"][pid] = {"type": hex(after[pid][0]), "chars_incl_terminator": after[pid][2]}
    assert {k: v[:2] for k, v in before.items()} == {k: v[:2] for k, v in after.items()}, "layout changed"
    s_in, s_out = streams(src), streams(dst)
    rep["streams"] = len(s_in)
    rep["changed_streams"] = sorted(k for k in s_in if s_in[k] != s_out.get(k))
    assert set(s_in) == set(s_out) and rep["changed_streams"] == [SUMMARY], rep["changed_streams"]
    rep["sha256_in"] = hashlib.sha256(open(src, "rb").read()).hexdigest()
    rep["sha256_out"] = hashlib.sha256(open(dst, "rb").read()).hexdigest()
    json.dump(rep, open(report, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(rep, ensure_ascii=False))


if __name__ == "__main__":
    main()
