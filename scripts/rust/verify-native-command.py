#!/usr/bin/env python3
"""Check every pair produced by bench-native-command.py, optionally in a real TTY.

Only native trace lines and `(completed in ...s)` durations are normalized.
Workspace files, including .bitmap, are compared byte for byte; repository caches,
logs, node_modules and Git data are outside this workspace materialization check.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tempfile


def normalized(text):
    text = re.sub(r"(?m)^bit-native:[^\n]*(?:\r?\n|$)", "", text)
    return re.sub(r"\(completed in [0-9.]+(?:ns|μs|µs|ms|s)\)", "(completed in <duration>)", text)


def files(root):
    result = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if {".bit", ".git", "node_modules"}.intersection(relative.parts):
            continue
        if path.is_symlink():
            result[str(relative)] = ["symlink", os.readlink(path)]
        elif path.is_file():
            result[str(relative)] = ["file", hashlib.sha256(path.read_bytes()).hexdigest()]
    return result


def verify(stage, runs):
    checked = []
    for run in range(runs):
        for stream in ["stdout", "stderr"]:
            node = normalized((stage / f"{run}-node.{stream}").read_bytes().decode())
            rust = normalized((stage / f"{run}-rust.{stream}").read_bytes().decode())
            if node != rust:
                (stage / f"{run}-node.{stream}.normalized").write_text(node)
                (stage / f"{run}-rust.{stream}.normalized").write_text(rust)
                raise RuntimeError(f"run {run}: {stream} differs; see {stage}")
        node = files(stage / f"{run}-node")
        rust = files(stage / f"{run}-rust")
        if node != rust:
            differences = [name for name in sorted(node.keys() | rust.keys())
                           if node.get(name) != rust.get(name)]
            raise RuntimeError(f"run {run}: final workspace differs: {differences}; see {stage}")
        checked.append({"run": run, "workspace_files": len(node)})
    return checked


def tty_runs(report):
    stage = Path(tempfile.mkdtemp(prefix="bit-native-tty-"))
    environment = os.environ.copy()
    for key in ["CI", "NO_COLOR", "NODE_DISABLE_COLORS"]:
        environment.pop(key, None)
    environment.update(TERM="dumb", FORCE_COLOR="1", BIT_NATIVE_TRACE="1")
    for run in range(len(report["runs_ms"]["node"])):
        for label in (["node", "rust"] if run % 2 == 0 else ["rust", "node"]):
            workspace = stage / f"{run}-{label}"
            shutil.copytree(report["source"], workspace, symlinks=True)
            command = shlex.join([report[label], *report["command"]])
            result = subprocess.run(
                ["script", "-q", "-e", "-c", command, "/dev/null"],
                cwd=workspace, env=environment, capture_output=True, check=False,
            )
            for stream in ["stdout", "stderr"]:
                (stage / f"{run}-{label}.{stream}").write_bytes(getattr(result, stream))
            if result.returncode:
                raise RuntimeError(f"TTY {label} run {run}: exit {result.returncode}; see {stage}")
            if label == "rust" and (
                f"running `{report['command'][0]}` natively".encode() not in result.stdout
                or b"declined" in result.stdout
            ):
                raise RuntimeError(f"TTY Rust run {run} delegated; see {stage}")
    return stage


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", type=Path, required=True)
    parser.add_argument("--tty", action="store_true", help="also run fresh alternating TTY pairs")
    args = parser.parse_args()
    report = json.loads((args.stage / "results.json").read_text())
    result = {"stage": str(args.stage), "pairs": verify(args.stage, len(report["runs_ms"]["node"]))}
    if args.tty:
        stage = tty_runs(report)
        result["tty_stage"] = str(stage)
        result["tty_pairs"] = verify(stage, len(report["runs_ms"]["node"]))
    (args.stage / "verification.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
