"""
Async-safe DNS query logger using a background write queue.
DNS proxy threads enqueue log entries; a dedicated thread drains the queue
and writes to SQLite in batches, keeping DNS resolution <2ms latency.
"""
import threading
import queue
import logging
from datetime import datetime, timezone

logger = logging.getLogger('dns_proxy')

_queue: queue.Queue = queue.Queue(maxsize=50000)
_worker_thread: threading.Thread | None = None
_stop_event = threading.Event()

BATCH_SIZE = 100
FLUSH_INTERVAL = 2.0  # seconds


def _worker():
    """Background thread — drain queue and batch-write to DB."""
    import django
    django.setup()
    from dns.models import QueryLog

    batch = []
    while not _stop_event.is_set():
        try:
            entry = _queue.get(timeout=FLUSH_INTERVAL)
            batch.append(entry)
            if len(batch) >= BATCH_SIZE:
                _flush(QueryLog, batch)
                batch = []
        except queue.Empty:
            if batch:
                _flush(QueryLog, batch)
                batch = []

    # Final flush on shutdown
    while not _queue.empty():
        try:
            batch.append(_queue.get_nowait())
        except queue.Empty:
            break
    if batch:
        _flush(QueryLog, batch)


def _flush(QueryLog, batch):
    try:
        QueryLog.objects.bulk_create(batch, batch_size=500, ignore_conflicts=True)
    except Exception as exc:
        logger.error(f"QueryLog flush error: {exc}")


def start():
    global _worker_thread
    _stop_event.clear()
    _worker_thread = threading.Thread(target=_worker, name='dns-logger', daemon=True)
    _worker_thread.start()
    logger.info("DNS logger worker started")


def stop():
    _stop_event.set()
    if _worker_thread:
        _worker_thread.join(timeout=5)


def log_query(domain: str, client_ip: str, status: str, query_type: str,
              matched_rule: str = '', response_time_ms: float = 0,
              resolved_ip: str | None = None):
    """Enqueue a query log entry (non-blocking)."""
    try:
        from dns.models import QueryLog
        entry = QueryLog(
            domain=domain,
            client_ip=client_ip,
            status=status,
            query_type=query_type,
            matched_rule=matched_rule,
            response_time_ms=response_time_ms,
            resolved_ip=resolved_ip,
        )
        _queue.put_nowait(entry)
    except queue.Full:
        logger.warning("QueryLog queue full — dropping entry")
    except Exception as exc:
        logger.error(f"log_query error: {exc}")
