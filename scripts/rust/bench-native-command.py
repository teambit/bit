#!/usr/bin/env python3
"""Compare complete Node and Rust commands on fresh copies of one workspace.

Example: bench-native-command.py --source /tmp/fixture --node /path/to/bit \
  --rust /path/to/native/bit --runs 5 -- checkout head
The source must already be prepared at the same starting state for both CLIs.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import tempfile
import time


SKIP_DIRS = {".git", "node_modules", "cache", "bitmap-history"}
SKIP_FILES = {"command-history", "bitmap-history-metadata.txt"}


def fingerprint(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if SKIP_DIRS.intersection(relative.parts) or path.name in SKIP_FILES:
            continue
        if path.is_dir() and not path.is_symlink():
            continue
        digest.update(str(relative).encode())
        digest.update(b"\0")
        if path.is_symlink():
            digest.update(os.readlink(path).encode())
        else:
            digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--rust", type=Path, required=True)
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command or args.runs < 1 or not (args.source / ".bitmap").is_file():
        parser.error("a command, positive run count, and workspace source are required")

    source = args.source.resolve()
    stage = Path(tempfile.mkdtemp(prefix="bit-native-bench-"))
    samples = {"node": [], "rust": []}
    binaries = {"node": args.node.resolve(), "rust": args.rust.resolve()}
    for run in range(args.runs):
        for label in (["node", "rust"] if run % 2 == 0 else ["rust", "node"]):
            workspace = stage / f"{run}-{label}"
            shutil.copytree(source, workspace, symlinks=True)
            environment = os.environ.copy()
            environment["BIT_NATIVE_TRACE"] = "1"
            started = time.perf_counter()
            result = subprocess.run(
                [str(binaries[label]), *command],
                cwd=workspace,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )
            elapsed_ms = (time.perf_counter() - started) * 1000
            (stage / f"{run}-{label}.stdout").write_text(result.stdout)
            (stage / f"{run}-{label}.stderr").write_text(result.stderr)
            if result.returncode != 0:
                raise RuntimeError(f"{label} run {run} exited {result.returncode}; see {stage}")
            if label == "rust" and (
                f"running `{command[0]}` natively" not in result.stderr
                or f"`{command[0]}` declined" in result.stderr
            ):
                raise RuntimeError(f"Rust run {run} delegated to Node; see {stage}")
            samples[label].append(round(elapsed_ms, 3))

    report = {
        "command": command,
        "source": str(source),
        "source_sha256": fingerprint(source),
        "node": str(binaries["node"]),
        "rust": str(binaries["rust"]),
        "runs_ms": samples,
        "median_ms": {key: round(statistics.median(times), 3) for key, times in samples.items()},
        "stage": str(stage),
    }
    (stage / "results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
