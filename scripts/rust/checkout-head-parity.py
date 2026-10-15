#!/usr/bin/env python3
"""Compare current-lane `checkout head` on fresh Node and Rust workspace copies.

The primary source has a lane component absent from the workspace bitmap.
For example, switch to a lane with `--workspace-only` before taking the copy.
The optional removed source has a snapped deleted component absent from bitmap.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


SKIP_DIRS = {".git", "node_modules", "bitmap-history", "cache"}
SKIP_TOP_LEVEL = {"globals", "remotes"}
SKIP_FILES = {"command-history", "bitmap-history-metadata.txt"}


def state(root, install=False):
    result = {}
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if (SKIP_DIRS.intersection(relative.parts)
                or relative.parts[0] in SKIP_TOP_LEVEL
                or path.name in SKIP_FILES):
            continue
        if path.is_dir() and not path.is_symlink():
            continue
        if path.is_symlink():
            result[str(relative)] = ("link", os.readlink(path).encode())
        else:
            content = path.read_bytes()
            if install and str(relative) == ".eslintrc.json":
                # Node itself hashes the fresh-copy workspace path into this
                # generated cache reference, even on two Node runs.
                content = re.sub(rb"\.eslintrc\.bit\.[0-9a-f]{40}\.json",
                                 b".eslintrc.bit.<workspace>.json", content)
            result[str(relative)] = ("file", content)
    return result


def fingerprint(root):
    digest = hashlib.sha256()
    for name, (kind, content) in sorted(state(root).items()):
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(kind.encode())
        digest.update(b"\0")
        digest.update(content)
        digest.update(b"\0")
    return digest.hexdigest()


def run(binary, workspace, args, entry, globals_dir):
    environment = os.environ.copy()
    environment.update(CI="1", BIT_DISABLE_SPINNER="true",
                       BIT_NATIVE_TRACE="1", BIT_NODE_CLI=str(entry.resolve()),
                       BIT_GLOBALS_DIR=str(globals_dir))
    return subprocess.run([str(binary.resolve()), "checkout", *args], cwd=workspace,
                          env=environment, capture_output=True, text=True,
                          timeout=120, check=False)


def bitmap_has(root, component):
    content = (root / ".bitmap").read_text()
    return component in json.loads(content[content.index("{"):])


def stable_report(stdout):
    marker = '(run "bit details" to see full list of '
    if marker not in stdout:
        raise AssertionError(f"checkout installation report marker missing: {stdout[-1000:]!r}")
    return stdout[stdout.rindex(marker):]


def compare(name, source, args, node, rust, entry, stage, added, expect_added,
            expect_native, install=False):
    observed = {}
    for label, binary in (("node", node), ("rust", rust)):
        workspace = stage / f"{name}-{label}"
        shutil.copytree(source, workspace, symlinks=True)
        output = run(binary, workspace, args, entry, stage / f"{name}-{label}-globals")
        if added is not None and bitmap_has(workspace, added) != expect_added:
            raise AssertionError(f"{name}: unexpected bitmap visibility for {added} "
                                 f"in {label}; stage {stage}")
        observed[label] = (output, state(workspace, install))
    (node_output, node_state), (rust_output, rust_state) = observed.values()
    if node_output.returncode != rust_output.returncode:
        raise AssertionError(f"{name}: exits differ: {node_output.returncode} / "
                             f"{rust_output.returncode}; stage {stage}")
    node_stdout = stable_report(node_output.stdout) if install else node_output.stdout
    rust_stdout = stable_report(rust_output.stdout) if install else rust_output.stdout
    if node_stdout != rust_stdout:
        raise AssertionError(f"{name}: stdout differs:\nnode: {node_output.stdout!r}\n"
                             f"rust: {rust_output.stdout!r}; stage {stage}")
    if install:
        for label, output in (("node", node_output), ("rust", rust_output)):
            for marker in ("done running package installation",
                           "running post install subscribers", "compiling components"):
                if marker not in output.stdout:
                    raise AssertionError(f"{name}: {label} missing {marker}; stage {stage}")
    if node_state != rust_state:
        changed = sorted(name for name in node_state.keys() | rust_state.keys()
                         if node_state.get(name) != rust_state.get(name))
        raise AssertionError(f"{name}: workspace files differ: {changed}; stage {stage}")
    if expect_native:
        if "running `checkout` natively" not in rust_output.stderr or "declined" in rust_output.stderr:
            raise AssertionError(f"{name}: Rust delegated: {rust_output.stderr}; stage {stage}")
    elif "`checkout` declined" not in rust_output.stderr:
        raise AssertionError(f"{name}: Rust should delegate: {rust_output.stderr}; stage {stage}")
    route = "native" if expect_native else "delegated"
    print(f"{name}: equal exit, stdout, workspace files, bitmap and object index ({route})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "entry", "node", "rust"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--component", required=True,
                        help="present component whose head is already current")
    parser.add_argument("--added", required=True,
                        help="lane component absent from the source bitmap")
    parser.add_argument("--removed-source", type=Path,
                        help="current-lane source with a snapped removed component")
    parser.add_argument("--selected-source", type=Path,
                        help="lane with multiple tracked components for an exact-ID checkout")
    parser.add_argument("--selected-component",
                        help="one tracked component in --selected-source")
    args = parser.parse_args()
    for source in (args.source, args.removed_source, args.selected_source):
        if source and not (source / ".bitmap").is_file():
            parser.error(f"missing source bitmap: {source}")
    if bool(args.selected_source) != bool(args.selected_component):
        parser.error("--selected-source and --selected-component are required together")
    if bitmap_has(args.source, args.added):
        parser.error(f"--added component is already in source bitmap: {args.added}")
    print(f"source sha256: {fingerprint(args.source)}")
    if args.removed_source:
        print(f"removed source sha256: {fingerprint(args.removed_source)}")
    if args.selected_source:
        print(f"selected source sha256: {fingerprint(args.selected_source)}")
    with tempfile.TemporaryDirectory(prefix="bit-checkout-head-parity-") as temporary:
        stage = Path(temporary)
        cases = [
            ("add-absent", args.source, ["head", "-x"], args.added, True, True),
            ("workspace-only", args.source, ["head", "-x", "--workspace-only"],
             args.added, False, True),
            ("present-noop-add-absent", args.source, ["head", args.component, "-x"],
             args.added, True, True),
            ("add-absent-install", args.source, ["head"], args.added, True, True),
        ]
        if args.removed_source:
            cases += [
                ("removed-default", args.removed_source, ["head", "-x"], None, False, True),
                ("removed-workspace-only", args.removed_source,
                 ["head", "-x", "--workspace-only"], None, False, True),
            ]
        if args.selected_source:
            cases.append(("selected-id-other-tracked-lane-components", args.selected_source,
                          ["head", args.selected_component, "-x"], None, False, False))
        for name, source, command, added, expect_added, expect_native in cases:
            compare(name, source, command, args.node, args.rust, args.entry, stage,
                    added, expect_added, expect_native, name == "add-absent-install")


if __name__ == "__main__":
    main()
