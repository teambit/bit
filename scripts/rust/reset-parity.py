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
import zlib


def state(root, semantic_objects=False):
    files = [root / ".bitmap", root / ".bit/index.json", root / ".bit/staged-snaps"]
    objects = root / ".bit/objects"
    files.extend(path for path in objects.rglob("*") if path.is_file())
    return {str(path.relative_to(root)): (zlib.decompress(path.read_bytes())
            if semantic_objects and objects in path.parents else path.read_bytes()) for path in files}


def run(binary, directory, command, environment, semantic_objects=False):
    result = subprocess.run([str(binary.resolve()), "reset", *command], cwd=directory,
                            env=environment, capture_output=True, text=True, timeout=120,
                            check=False)
    return result, state(directory, semantic_objects)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "entry", "node", "rust"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--plain", required=True, help="component with a linear local tag history")
    parser.add_argument("--detached", required=True, help="component with a detached local head")
    parser.add_argument("--soft-source", type=Path, help="workspace with a pending nextVersion")
    parser.add_argument("--soft-id", help="full scope/name of that soft-tagged component")
    parser.add_argument("--lane-source", type=Path, help="unexported lane with two local snaps")
    parser.add_argument("--lane-id", help="component with the two local lane snaps")
    args = parser.parse_args()
    cases = [
        ("all local tags", args.source, [args.plain], False),
        ("latest local tag", args.source, [args.plain, "--head"], False),
        ("detached head", args.source, [args.detached, "--head", "--force"], False),
        ("all tags with detached head", args.source, [args.detached, "--force"], False),
        ("all components", args.source, ["--silent"], False),
        ("all latest heads", args.source, ["--head", "--silent"], False),
        ("never exported", args.source, ["--never-exported"], False),
    ]
    if bool(args.soft_source) != bool(args.soft_id):
        parser.error("--soft-source and --soft-id must be given together")
    if args.soft_source:
        cases.extend([
            ("one soft tag", args.soft_source, [args.soft_id, "--soft"], False),
            ("all soft tags", args.soft_source, ["--soft", "--silent"], False),
        ])
    if bool(args.lane_source) != bool(args.lane_id):
        parser.error("--lane-source and --lane-id must be given together")
    if args.lane_source:
        cases.extend([
            ("lane latest snap", args.lane_source, [args.lane_id, "--head", "--force"], True),
            ("lane all snaps", args.lane_source, [args.lane_id, "--force"], True),
        ])
    environment = os.environ.copy()
    environment.update(CI="1", BIT_DISABLE_SPINNER="true", BIT_NODE_CLI=str(args.entry.resolve()),
                       BIT_NATIVE_TRACE="1")
    with tempfile.TemporaryDirectory(prefix="bit-reset-parity-") as stage:
        for index, (name, source, command, semantic_objects) in enumerate(cases):
            outputs = []
            for label, binary in (("node", args.node), ("rust", args.rust)):
                directory = Path(stage) / f"{index}-{label}"
                shutil.copytree(source, directory, symlinks=True)
                outputs.append(run(binary, directory, command, environment, semantic_objects))
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
