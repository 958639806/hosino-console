#!/usr/bin/env python3
"""Run one admitted script in this process and receipt its atomic publication.

The Gateway's existing ProcessSupervisor owns this process. This module does not
fork, detach, schedule or send messages.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import time


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=".job-receipt-", dir=path.parent)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=False, separators=(",", ":"))
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        if os.name == "posix":
            directory = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("controlled_job_requires_one_job_file")
    job_file = Path(sys.argv[1]).resolve(strict=True)
    job = json.loads(job_file.read_text(encoding="utf-8"))
    nonce = os.environ.get("OPENCLAW_CONTROLLED_JOB_NONCE", "")
    if not nonce or not hmac.compare_digest(hashlib.sha256(nonce.encode()).hexdigest(), job["capHash"]):
        raise SystemExit("controlled_job_capability_mismatch")
    script = Path(job["recipe"]["script"]).resolve(strict=True)
    if hashlib.sha256(script.read_bytes()).hexdigest() != job["recipe"]["scriptSha"]:
        raise SystemExit("controlled_job_script_changed")
    expected_output = Path(job["recipe"]["output"]).resolve()
    result_file = job_file.parent.parent / "results" / (job["id"] + ".json")
    for dependency in job["recipe"].get("dependencies", []):
        dependency_path = Path(dependency["path"]).resolve(strict=True)
        if hashlib.sha256(dependency_path.read_bytes()).hexdigest() != dependency["sha256"]:
            raise SystemExit("controlled_job_dependency_changed")
    sys.path.insert(0, str(script.parent))
    original_replace = os.replace

    def receipt(output):
        output = Path(output).resolve(strict=True)
        if output != expected_output:
            return
        size = output.stat().st_size
        if size <= 0 or size > 32 * 1024 * 1024:
            raise RuntimeError("controlled_media_artifact_size_invalid")
        with output.open("r+b") as published:
            os.fsync(published.fileno())
        if os.name == "posix":
            directory = os.open(output.parent, os.O_RDONLY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        file_hash = hashlib.sha256(output.read_bytes()).hexdigest()
        fields = [job["id"], job["recipe"]["scriptSha"], str(output), size, file_hash]
        canonical = json.dumps(fields, ensure_ascii=False, separators=(",", ":")).encode()
        signature = hmac.new(nonce.encode(), canonical, hashlib.sha256).hexdigest()
        atomic_json(result_file, {
            "v": 1, "jobId": job["id"], "scriptSha": job["recipe"]["scriptSha"],
            "path": str(output), "bytes": size, "sha256": file_hash,
            "signature": signature, "publishedAt": int(time.time() * 1000),
        })

    # These three pinned wrappers publish with os.replace, including TTS's
    # existing encoder path. Only the Gateway-assigned output may earn a receipt.
    def replace_with_receipt(source, destination, *args, **kwargs):
        result = original_replace(source, destination, *args, **kwargs)
        if Path(destination).resolve() == expected_output:
            receipt(destination)
        return result

    os.replace = replace_with_receipt
    sys.argv = [str(script), *job["recipe"]["args"]]
    runpy.run_path(str(script), run_name="__main__")


if __name__ == "__main__":
    main()
