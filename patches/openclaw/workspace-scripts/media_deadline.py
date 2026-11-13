#!/usr/bin/env python3
"""Shared Linux CLI phase budgets and atomic publication; no jobs or send API."""
import contextlib
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request


def positive_seconds(value, upper=None):
    value = float(value)
    if not math.isfinite(value) or value <= 0 or (upper is not None and value > upper):
        raise ValueError("media_budget_must_be_positive_finite_within_limit")
    return value


class MediaCancelled(BaseException):
    pass


@contextlib.contextmanager
def cancellation_handlers():
    if threading.current_thread() is not threading.main_thread():
        raise RuntimeError("media_strict_deadline_requires_main_thread")
    previous = {}
    def cancelled(signum, frame):
        raise MediaCancelled("media_cancelled")
    try:
        for name in ("SIGTERM", "SIGINT", "SIGHUP"):
            value = getattr(signal, name, None)
            if value is not None:
                previous[value] = signal.getsignal(value)
                signal.signal(value, cancelled)
        yield
    finally:
        for number, handler in previous.items():
            signal.signal(number, handler)


def _proc_start(pid):
    try:
        text = Path("/proc") .joinpath(str(pid), "stat").read_text()
        return text[text.rfind(")") + 1:].split()[19]
    except (OSError, IndexError):
        return None


def kill_owned_tree(process):
    """Stop for stable enumeration then kill this Popen's descendants only.

    No new process group / fork supervisor is created. Existing exec ownership
    remains intact. On Linux, /proc identities prevent PID reuse during cleanup.
    """
    if process.returncode is not None:
        return
    if os.name != "posix" or not Path("/proc").is_dir():
        process.kill()
        process.wait(timeout=3)
        return
    if not hasattr(os, "pidfd_open") or not hasattr(signal, "pidfd_send_signal"):
        process.kill()
        process.wait(timeout=3)
        raise RuntimeError("media_child_cleanup_unverified_no_pidfd")
    owned, pending, seen = [], [(process.pid, None)], set()
    try:
        while pending:
            pid, expected_parent = pending.pop()
            if pid in seen or pid == os.getpid():
                continue
            seen.add(pid)
            if len(seen) > 4096:
                raise RuntimeError("media_child_tree_bound_exceeded")
            try:
                descriptor = os.pidfd_open(pid, 0)
            except ProcessLookupError:
                continue
            try:
                text = Path("/proc").joinpath(str(pid), "stat").read_text()
                fields = text[text.rfind(")") + 1:].split()
                if expected_parent is not None and int(fields[1]) != expected_parent:
                    os.close(descriptor)
                    continue
                # pidfd identifies the exact process across PID reuse. Signal
                # only after its parent relationship has been checked.
                signal.pidfd_send_signal(descriptor, signal.SIGSTOP, None, 0)
            except (OSError, ValueError, IndexError):
                os.close(descriptor)
                continue
            owned.append(descriptor)
            try:
                task_dirs = list(Path("/proc").joinpath(str(pid), "task").iterdir())
            except OSError:
                task_dirs = []
            for task in task_dirs:
                try:
                    pending.extend((int(value), pid) for value in (task / "children").read_text().split())
                except (OSError, ValueError):
                    pass
    finally:
        # Also execute after a scan error / bound failure so stopped descendants
        # cannot be left frozen. Only descriptors proven above are signalled.
        for descriptor in reversed(owned):
            try:
                signal.pidfd_send_signal(descriptor, signal.SIGKILL, None, 0)
            except ProcessLookupError:
                pass
            finally:
                os.close(descriptor)
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            process.wait(timeout=3)


class Deadline:
    def __init__(self, seconds, absolute=None):
        self.ends = time.monotonic() + positive_seconds(seconds) if absolute is None else float(absolute)

    def remaining(self, cap=None):
        value = self.ends - time.monotonic()
        if value <= 0:
            raise TimeoutError("media_total_deadline_exceeded")
        return min(value, positive_seconds(cap)) if cap is not None else value

    @contextlib.contextmanager
    def network(self, cap):
        # A socket per-read timeout does not bound DNS or a slow byte trickle.
        if not hasattr(signal, "setitimer") or threading.current_thread() is not threading.main_thread():
            raise RuntimeError("media_strict_deadline_requires_linux_main_thread")
        duration = self.remaining(cap)
        old_timer = signal.getitimer(signal.ITIMER_REAL)
        if old_timer[0] > 0 or old_timer[1] > 0:
            raise RuntimeError("media_existing_alarm_preserved")
        old_handler = signal.getsignal(signal.SIGALRM)
        def expired(signum, frame):
            raise TimeoutError("media_http_deadline_exceeded")
        signal.signal(signal.SIGALRM, expired)
        signal.setitimer(signal.ITIMER_REAL, duration)
        try:
            with cancellation_handlers():
                yield
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, old_handler)

    def read_bytes(self, request, cap, max_bytes=64 * 1024 * 1024):
        with self.network(cap):
            try:
                with urllib.request.urlopen(request, timeout=self.remaining(cap)) as response:
                    data = response.read(max_bytes + 1)
                    if len(data) > max_bytes:
                        raise ValueError("media_response_size_limit")
                    if not data:
                        raise ValueError("media_response_empty")
                    self.remaining()
                    return data
            except urllib.error.HTTPError as error:
                error.close()  # Never perform an unbounded read of an error body.
                raise RuntimeError("media_http_status_" + str(error.code)) from None

    def read_json(self, request, cap, max_bytes=64 * 1024 * 1024):
        raw = self.read_bytes(request, cap, max_bytes)
        self.remaining()
        value = json.loads(raw.decode("utf-8"))
        self.remaining()
        return value

    def download(self, request, output, cap, max_bytes=512 * 1024 * 1024):
        output = Path(output).absolute()
        output.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".media-download-", dir=output.parent)
        total = 0
        try:
            with os.fdopen(fd, "wb") as file:
                with self.network(cap):
                    try:
                        with urllib.request.urlopen(request, timeout=self.remaining(cap)) as response:
                            while True:
                                block = response.read(65536)
                                if not block:
                                    break
                                total += len(block)
                                if total > max_bytes:
                                    raise ValueError("media_download_size_limit")
                                file.write(block)
                            self.remaining()
                    except urllib.error.HTTPError as error:
                        error.close()
                        raise RuntimeError("media_http_status_" + str(error.code)) from None
                file.flush()
                os.fsync(file.fileno())
            if total <= 0:
                raise ValueError("media_download_empty")
            self.remaining()
            os.replace(temporary, output)
            return total
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def run(self, args, cap, *, capture_output=True, text=False, check=False, **kwargs):
        duration = self.remaining(cap)
        if capture_output:
            if "stdout" in kwargs or "stderr" in kwargs:
                raise ValueError("capture_output_conflict")
            kwargs.update(stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # No detached process group is introduced: outer exec cancellation keeps
        # its existing descendant ownership. Internal timeout kills owned tree.
        with cancellation_handlers():
            process = subprocess.Popen(args, text=text, **kwargs)
            try:
                stdout, stderr = process.communicate(timeout=duration)
            except BaseException:
                kill_owned_tree(process)
                process.communicate(timeout=3)
                raise
        result = subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
        if check:
            result.check_returncode()
        self.remaining()
        return result

    def sleep(self, seconds):
        duration = self.remaining(seconds)
        with cancellation_handlers():
            time.sleep(duration)
        self.remaining()


def atomic_bytes(output, data, deadline):
    output = Path(output).absolute()
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".media-write-", dir=output.parent)
    try:
        with os.fdopen(descriptor, "wb") as file:
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        deadline.remaining()
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextlib.contextmanager
def atomic_path(output, deadline):
    output = Path(output).absolute()
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".media-stage-", suffix=output.suffix, dir=output.parent)
    os.close(descriptor)
    try:
        yield Path(temporary)
        if not os.path.isfile(temporary) or os.path.getsize(temporary) <= 0:
            raise ValueError("media_staged_output_empty")
        with open(temporary, "rb+") as file:
            os.fsync(file.fileno())
        deadline.remaining()
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
