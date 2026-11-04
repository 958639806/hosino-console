#!/usr/bin/env python3
"""Build deterministic release archives from a committed Git tree."""

import argparse
import datetime
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tarfile
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9]{4}\.[0-9]{1,2}\.[0-9]+", args.version):
        parser.error("a stable YYYY.M.P version is required")
    repo = Path(__file__).resolve().parents[1]

    def git(*command):
        return subprocess.check_output(["git", *command], cwd=repo)

    commit = git("rev-parse", "--verify", args.ref + "^{commit}").decode().strip()
    package = json.loads(git("show", commit + ":package.json"))
    if package["version"] != args.version:
        parser.error("the committed package version does not match")
    epoch = int(git("show", "-s", "--format=%ct", commit))
    roots = {"package.json", "package-lock.json", "README.md", "API.md", "CHANGELOG.md", ".env.example", "LICENSE", "LICENSE.md"}
    documents = {
        "API.md", "releases.md", f"release-v{args.version}.md", "plugin-center.md",
        "new-auth-contract.md", "panels-completion-and-validation.md",
        "round2-fixes-and-validation.md", "validation-v2026.11.2.md",
    }
    paths = []
    for name in git("ls-tree", "-r", "--name-only", commit).decode().splitlines():
        path = PurePosixPath(name)
        if name in roots or len(path.parts) == 1 and name.endswith(".mjs") or name.startswith(("public/", "mock/", "tests/")) or path.parent.as_posix() == "docs" and path.name in documents or name in {"scripts/build-release.py", "staging/voice/test/console-voice.mjs", ".github/workflows/test.yml"}:
            paths.append(name)
    prefix = f"hosino-console-v{args.version}"
    archive = git("archive", "--format=tar", commit, "--", *paths)
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        for member in source:
            if member.isdir():
                continue
            if not member.isfile() or member.name not in paths:
                raise ValueError("release packages require regular tracked files")
            files[member.name] = (source.extractfile(member).read(), member.mode & 0o777)
    if set(files) != set(paths):
        raise ValueError("Git archive did not contain the complete allowlist")
    directories = {prefix + "/"}
    for name in files:
        for parent in PurePosixPath(name).parents:
            if str(parent) != ".":
                directories.add(prefix + "/" + str(parent) + "/")

    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w", format=tarfile.USTAR_FORMAT) as target:
        for name in sorted(directories):
            member = tarfile.TarInfo(name)
            member.type, member.mode, member.mtime = tarfile.DIRTYPE, 0o755, epoch
            target.addfile(member)
        for name, (data, mode) in sorted(files.items()):
            member = tarfile.TarInfo(prefix + "/" + name)
            member.mode, member.mtime, member.size = mode, epoch, len(data)
            target.addfile(member, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(filename="", fileobj=compressed, mode="wb", compresslevel=9, mtime=0) as target:
        target.write(tar_buffer.getvalue())

    zip_buffer = io.BytesIO()
    date = datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).timetuple()[:6]
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_STORED) as target:
        for name in sorted(directories):
            member = zipfile.ZipInfo(name, date_time=date)
            member.create_system, member.external_attr = 3, ((stat.S_IFDIR | 0o755) << 16) | 0x10
            target.writestr(member, b"")
        for name, (data, mode) in sorted(files.items()):
            member = zipfile.ZipInfo(prefix + "/" + name, date_time=date)
            member.create_system, member.external_attr = 3, (stat.S_IFREG | mode) << 16
            target.writestr(member, data)

    payloads = {prefix + ".tar.gz": compressed.getvalue(), prefix + ".zip": zip_buffer.getvalue()}
    checksums = {name: hashlib.sha256(data).hexdigest() for name, data in payloads.items()}
    payloads[prefix + "-SHA256SUMS.txt"] = "".join(f"{digest}  {name}\n" for name, digest in sorted(checksums.items())).encode()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if any((args.output_dir / name).exists() for name in payloads):
        raise FileExistsError("refusing to replace an existing release artifact")
    for name, data in payloads.items():
        with (args.output_dir / name).open("xb") as target:
            target.write(data)
    print(json.dumps({"commit": commit, "version": args.version, "files": len(files), "assets": [{"name": name, "size": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in payloads.items()]}, indent=2))


if __name__ == "__main__":
    main()
