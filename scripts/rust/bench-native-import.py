#!/usr/bin/env python3
"""Compare complete Node and Rust imports on copies of one workspace and remote."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
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
    parser.add_argument("--remote-name", help="name of --remote when several remotes are configured")
    parser.add_argument("--remote-url", help="running HTTP scope serving --remote; defaults to file:// copies")
    parser.add_argument("--additional-remote", action="append", default=[], metavar="NAME=PATH")
    parser.add_argument("--command-arg", action="append", default=[], help="bit import argument")
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
    configured = json.loads((source / ".bit/scope.json").read_text()).get("remotes", {})
    primary_name = args.remote_name or (next(iter(configured)) if len(configured) == 1 else None)
    if primary_name is None or primary_name not in configured:
        parser.error("--remote-name must identify the primary configured remote")
    remote_sources = {primary_name: remote_source}
    for additional in args.additional_remote:
        name, separator, path = additional.partition("=")
        if not separator or not name or name in remote_sources or "/" in name:
            parser.error("--additional-remote must be a distinct NAME=PATH")
        remote_sources[name] = Path(path).resolve()
    if set(remote_sources) != set(configured):
        parser.error("provide a source for every configured remote")
    rust = args.rust.resolve()
    node_cli = args.node_cli.resolve()
    stage = Path(tempfile.mkdtemp(prefix="bit-native-import-bench-"))
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
            remote_paths = {
                name: remote if name == primary_name else case / f"remote-{name}"
                for name in remote_sources
            }
            for name, remote_path in remote_paths.items():
                shutil.copytree(remote_sources[name], remote_path, symlinks=True)
            copy_optional(args.globals, globals_dir)
            copy_optional(args.home, home)
            scope_file = workspace / ".bit/scope.json"
            scope = json.loads(scope_file.read_text())
            remotes = scope.get("remotes", {})
            for name, remote_path in remote_paths.items():
                remotes[name] = args.remote_url if name == primary_name and args.remote_url else remote_path.as_uri()
            scope_file.write_text(json.dumps(scope, indent=4))
            for remote_path in remote_paths.values():
                remote_scope_file = remote_path / "scope.json"
                remote_scope = json.loads(remote_scope_file.read_text())
                for name in remote_scope.get("remotes") or {}:
                    if name in remote_paths:
                        remote_scope["remotes"][name] = remote_paths[name].as_uri()
                remote_scope_file.write_text(json.dumps(remote_scope, indent=4))

            environment = os.environ.copy()
            for key in ("BIT_NATIVE", "BIT_NATIVE_QUIET", "BIT_FEATURES", "CI"):
                environment.pop(key, None)
            environment.update({
                "BIT_NODE_CLI": str(node_cli),
                "BIT_GLOBALS_DIR": str(globals_dir),
                "HOME": str(home),
                "USERPROFILE": str(home),
                "BIT_NATIVE_TRACE": "1",
                "CI": "1",
            })
            if label == "node":
                environment["BIT_NATIVE"] = "off"
            started = time.perf_counter()
            result = subprocess.run(
                [str(rust), "import", *args.command_arg], cwd=workspace, env=environment,
                text=True, capture_output=True, check=False,
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
            (case / "stdout.txt").write_text(result.stdout)
            (case / "stderr.txt").write_text(result.stderr)
            if result.returncode != 0 or (
                label == "rust" and (
                    "running `import` natively" not in result.stderr
                    or "`import` declined" in result.stderr
                )
            ):
                raise RuntimeError(f"{label} run {run} failed; inspect {case}")
            samples[label].append(elapsed_ms)
            normalized = re.sub(r"completed in \d+ms", "completed in <time>", result.stdout)
            if label in outputs and outputs[label] != normalized:
                raise RuntimeError(f"{label} stdout changed in run {run}; inspect {case}")
            outputs[label] = normalized

    if outputs["node"] != outputs["rust"]:
        raise RuntimeError(f"Node and Rust stdout differs apart from timing; inspect {stage}")
    report = {
        "command": " ".join(["bit", "import", *args.command_arg]), "source_sha256": fingerprint(source),
        "remote_sha256": fingerprint(remote_source),
        "additional_remote_sha256": {
            name: fingerprint(path)
            for name, path in remote_sources.items() if name != primary_name
        },
        "node_cli": str(node_cli), "rust": str(rust),
        "remote_url": args.remote_url,
        "runs_ms": samples,
        "median_ms": {key: round(statistics.median(times), 3) for key, times in samples.items()},
        "stdout_sha256": hashlib.sha256(outputs["node"].encode()).hexdigest(),
        "stage": str(stage),
    }
    (stage / "results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
