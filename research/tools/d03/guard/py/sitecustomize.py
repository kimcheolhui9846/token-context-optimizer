"""D03 offline guard for Python processes.

Put this directory first on PYTHONPATH so Python imports it at start-up (child Python processes inherit PYTHONPATH).
It blocks socket connections, UDP sends and name resolution inside the process only; it does not change any system
firewall. Every blocked attempt is appended to D03_NET_LOG (JSON lines) and raises OSError.
"""
import json
import os
import socket

_LOG = os.environ.get("D03_NET_LOG", "")


def _note(event, kind=""):
    if not _LOG:
        return
    try:
        with open(_LOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"event": event, "kind": kind, "pid": os.getpid(), "ppid": os.getppid(), "lang": "python", "step": os.environ.get("D03_STEP", "")}) + "\n")
    except OSError:
        pass


def _blocked(kind):
    def deny(*_args, **_kwargs):
        _note("blocked", kind)
        raise OSError(f"D03 offline guard blocked {kind}")

    return deny


socket.socket.connect = _blocked("socket.connect")
socket.socket.connect_ex = _blocked("socket.connect_ex")
socket.socket.sendto = _blocked("socket.sendto")
socket.create_connection = _blocked("socket.create_connection")
socket.getaddrinfo = _blocked("socket.getaddrinfo")
socket.gethostbyname = _blocked("socket.gethostbyname")
socket.gethostbyname_ex = _blocked("socket.gethostbyname_ex")
os.environ["D03_PY_GUARD"] = "1"
_note("guard")
