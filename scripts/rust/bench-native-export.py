#!/usr/bin/env python3
"""Compare complete Node and Rust exports on copies of one workspace and file remote."""

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


def copy_optional(source: Path | None, target: Path) -> None:
    if source is None:
        target.mkdir()
    else:
        shutil.copytree(source, target, symlinks=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--remote", type=Path, required=True)
    parser.add_argument("--node-cli", type=Path, required=True)
    parser.add_argument("--rust", type=Path, required=True)
    parser.add_argument("--home", type=Path)
    parser.add_argument("--globals", type=Path)
    parser.add_argument("--runs", type=int, default=5)
    args = parser.parse_args()
    if args.runs < 1 or not (args.source / ".bitmap").is_file():
        parser.error("a positive run count and workspace source are required")

    source = args.source.resolve()
    remote_source = args.remote.resolve()
    rust = args.rust.resolve()
    node_cli = args.node_cli.resolve()
    stage = Path(tempfile.mkdtemp(prefix="bit-native-export-bench-"))
    samples: dict[str, list[float]] = {"node": [], "rust": []}
    outputs: dict[str, str] = {}
    for run in range(args.runs):
        for label in (["node", "rust"] if run % 2 == 0 else ["rust", "node"]):
            case = stage / f"{run}-{label}"
            workspace = case / "workspace"
            remote = case / "remote"
            globals_dir = case / "globals"
            home = case / "home"
            shutil.copytree(source, workspace, symlinks=True)
            shutil.copytree(remote_source, remote, symlinks=True)
            copy_optional(args.globals, globals_dir)
            copy_optional(args.home, home)
            scope_file = workspace / ".bit/scope.json"
            scope = json.loads(scope_file.read_text())
            remotes = scope.get("remotes", {})
            if len(remotes) != 1:
                parser.error("the workspace must configure exactly one file remote")
            remote_name = next(iter(remotes))
            remotes[remote_name] = remote.as_uri()
            scope_file.write_text(json.dumps(scope, indent=4))

            environment = os.environ.copy()
            for key in ("BIT_NATIVE", "BIT_NATIVE_QUIET", "BIT_FEATURES", "CI"):
                environment.pop(key, None)
            environment.update({
                "BIT_NODE_CLI": str(node_cli),
                "BIT_GLOBALS_DIR": str(globals_dir),
                "HOME": str(home),
                "USERPROFILE": str(home),
                "BIT_NATIVE_TRACE": "1",
            })
            if label == "node":
                environment["BIT_NATIVE"] = "off"
            started = time.perf_counter()
            result = subprocess.run(
                [str(rust), "export"], cwd=workspace, env=environment,
                text=True, capture_output=True, check=False,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
            (case / "stdout.txt").write_text(result.stdout)
            (case / "stderr.txt").write_text(result.stderr)
            if result.returncode != 0 or (
                label == "rust" and (
                    "running `export` natively" not in result.stderr
                    or "`export` declined" in result.stderr
                )
            ):
                raise RuntimeError(f"{label} run {run} failed; inspect {case}")
            samples[label].append(elapsed_ms)
            if run == 0:
                outputs[label] = result.stdout

    if outputs["node"] != outputs["rust"]:
        raise RuntimeError(f"Node and Rust stdout differ; inspect {stage}")
    report = {
        "command": "bit export", "source_sha256": fingerprint(source),
        "remote_sha256": fingerprint(remote_source),
        "node_cli": str(node_cli), "rust": str(rust),
        "runs_ms": samples,
        "median_ms": {key: round(statistics.median(times), 3) for key, times in samples.items()},
        "stdout_sha256": hashlib.sha256(outputs["node"].encode()).hexdigest(),
        "stage": str(stage),
    }
    (stage / "results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
