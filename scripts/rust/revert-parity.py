#!/usr/bin/env python3
"""Compare complete Node and native `bit revert` commands on fresh workspace copies.

Example: revert-parity.py --source /path/to/workspace --entry /path/to/bin/bit.js \
  --node /path/to/node-wrapper --rust /path/to/native/bit \
  --component alpha --directory alpha --older 1.0.0 --current 1.0.1
"""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def files(directory):
    return {str(path.relative_to(directory)): path.read_bytes()
            for path in directory.rglob("*") if path.is_file()}


def run(binary, destination, args, environment, component_directory):
    result = subprocess.run([str(binary.resolve()), "revert", *args], cwd=destination,
                            env=environment, capture_output=True, text=True, timeout=120,
                            check=False)
    root_files = {name: (destination / name).read_bytes() if (destination / name).is_file() else None
                  for name in (".bitmap", "pnpm-lock.yaml", "package.json", "workspace.jsonc")}
    return result, root_files, files(destination / component_directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "entry", "node", "rust"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    for name in ("component", "directory", "older", "current"):
        parser.add_argument(f"--{name}", required=True)
    args = parser.parse_args()
    cases = [
        ("clean older", [args.component, args.older, "-x"], None),
        ("modified older", [args.component, args.older, "-x"], "modify"),
        ("same version", [args.component, args.current, "-x"], None),
        ("main", [args.component, "main", "-x"], None),
        ("all main", ["**", "main", "-x"], None),
        ("default install", [args.component, args.older], None),
    ]
    environment = os.environ.copy()
    environment.update(CI="1", BIT_DISABLE_SPINNER="true", BIT_NODE_CLI=str(args.entry.resolve()),
                       BIT_NATIVE_TRACE="1")
    with tempfile.TemporaryDirectory(prefix="bit-revert-parity-") as stage:
        for index, (name, command, mutation) in enumerate(cases):
            outputs = []
            for label, binary in (("node", args.node), ("rust", args.rust)):
                destination = Path(stage) / f"{index}-{label}"
                shutil.copytree(args.source, destination, symlinks=True)
                if mutation:
                    path = destination / args.directory / "index.js"
                    if not path.is_file():
                        raise AssertionError(f"modification fixture missing {path}")
                    path.write_bytes(b"modified by revert parity\n")
                outputs.append(run(binary, destination, command, environment, args.directory))
            (node, node_bitmap, node_files), (rust, rust_bitmap, rust_files) = outputs
            if (node.returncode, node_bitmap, node_files) != (rust.returncode, rust_bitmap, rust_files):
                raise AssertionError(f"{name}: state or exit differs")
            if name == "default install":
                # pnpm progress and completion durations are inherently variable.
                stable = "successfully reverted"
                if stable not in node.stdout or node.stdout[node.stdout.index(stable):] != rust.stdout[rust.stdout.index(stable):]:
                    raise AssertionError(f"{name}: final report differs")
            elif node.stdout != rust.stdout:
                raise AssertionError(f"{name}: output differs: {node.stdout!r} / {rust.stdout!r}")
            if "running `revert` natively" not in rust.stderr or "declined" in rust.stderr:
                raise AssertionError(f"{name}: native route missing: {rust.stderr}")
            print(f"{name}: equal")


if __name__ == "__main__":
    main()
