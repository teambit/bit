#!/usr/bin/env python3
"""Compare complete Node and native main-lane `bit reset` commands.

Example: reset-parity.py --source /path/to/workspace --entry /path/to/bin/bit.js \
  --node /path/to/node-wrapper --rust /path/to/native/bit --plain alpha --detached beta
"""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def state(root):
    files = [root / ".bitmap", root / ".bit/index.json", root / ".bit/staged-snaps"]
    objects = root / ".bit/objects"
    files.extend(path for path in objects.rglob("*") if path.is_file())
    return {str(path.relative_to(root)): path.read_bytes() for path in files}


def run(binary, directory, command, environment):
    result = subprocess.run([str(binary.resolve()), "reset", *command], cwd=directory,
                            env=environment, capture_output=True, text=True, timeout=120,
                            check=False)
    return result, state(directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "entry", "node", "rust"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--plain", required=True, help="component with a linear local tag history")
    parser.add_argument("--detached", required=True, help="component with a detached local head")
    args = parser.parse_args()
    cases = [
        ("all local tags", [args.plain]),
        ("latest local tag", [args.plain, "--head"]),
        ("detached head", [args.detached, "--head", "--force"]),
    ]
    environment = os.environ.copy()
    environment.update(CI="1", BIT_DISABLE_SPINNER="true", BIT_NODE_CLI=str(args.entry.resolve()),
                       BIT_NATIVE_TRACE="1")
    with tempfile.TemporaryDirectory(prefix="bit-reset-parity-") as stage:
        for index, (name, command) in enumerate(cases):
            outputs = []
            for label, binary in (("node", args.node), ("rust", args.rust)):
                directory = Path(stage) / f"{index}-{label}"
                shutil.copytree(args.source, directory, symlinks=True)
                outputs.append(run(binary, directory, command, environment))
            (node, node_state), (rust, rust_state) = outputs
            if node.returncode != rust.returncode or node.stdout != rust.stdout or node_state != rust_state:
                different = sorted(set(node_state) ^ set(rust_state))
                changed = sorted(path for path in node_state.keys() & rust_state.keys()
                                 if node_state[path] != rust_state[path])
                raise AssertionError(f"{name}: exit/output/state differs; missing={different}, changed={changed}; "
                                     f"stdout={node.stdout!r}/{rust.stdout!r}")
            if "running `reset` natively" not in rust.stderr or "declined" in rust.stderr:
                raise AssertionError(f"{name}: native route missing: {rust.stderr}")
            print(f"{name}: equal")


if __name__ == "__main__":
    main()
