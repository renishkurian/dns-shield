"""Thread-local progress callbacks for long-running AI jobs (e.g. AI Report)."""
from __future__ import annotations

import threading
from typing import Callable, Optional

_local = threading.local()
ProgressCallback = Callable[[str], None]


def set_progress_callback(callback: Optional[ProgressCallback]) -> None:
    _local.callback = callback


def clear_progress_callback() -> None:
    _local.callback = None


def report_progress(message: str) -> None:
    cb = getattr(_local, 'callback', None)
    if cb and message:
        try:
            cb(str(message))
        except Exception:
            pass
