#!/usr/bin/env python3
"""Compare `checkout head` and `checkout reset` on fresh Node and Rust workspace copies.

The primary source has a lane component absent from the workspace bitmap.
For example, switch to a lane with `--workspace-only` before taking the copy.
The optional removed source has a snapped deleted component absent from bitmap.
Reset sources have tracked components on the active lane or main. Each reset
case removes the configured directory or main file from both fresh copies.
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
            expect_native, install=False, dirty_file=None, missing_dirs=(), missing_files=()):
    observed = {}
    for label, binary in (("node", node), ("rust", rust)):
        workspace = stage / f"{name}-{label}"
        shutil.copytree(source, workspace, symlinks=True)
        for directory in missing_dirs:
            missing_path = workspace / directory
            if (not missing_path.is_dir() or missing_path.is_symlink()
                    or not missing_path.resolve().is_relative_to(workspace.resolve())):
                raise AssertionError(f"{name}: invalid missing directory {directory}; stage {stage}")
            shutil.rmtree(missing_path)
        for file in missing_files:
            missing_path = workspace / file
            if (not missing_path.is_file() or missing_path.is_symlink()
                    or not missing_path.resolve().is_relative_to(workspace.resolve())):
                raise AssertionError(f"{name}: invalid missing file {file}; stage {stage}")
            missing_path.unlink()
        if dirty_file:
            dirty_path = workspace / dirty_file
            if not dirty_path.is_file() or not dirty_path.resolve().is_relative_to(workspace.resolve()):
                raise AssertionError(f"{name}: invalid dirty file {dirty_file}; stage {stage}")
            dirty_path.write_bytes(dirty_path.read_bytes() + b"\n// dirty workspace edit\n")
        output = run(binary, workspace, args, entry, stage / f"{name}-{label}-globals")
        if dirty_file and (workspace / dirty_file).read_bytes().endswith(b"// dirty workspace edit\n"):
            raise AssertionError(f"{name}: {label} did not reset {dirty_file}; stage {stage}")
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
    parser.add_argument("--selected-old-source", type=Path,
                        help="selected-source variant with another tracked row at an older version")
    parser.add_argument("--selected-inactive-source", type=Path,
                        help="selected-source variant with an unavailable tracked row")
    parser.add_argument("--selected-inactive-missing-source", type=Path,
                        help="selected-inactive-source variant with the unavailable directory missing")
    parser.add_argument("--selected-component",
                        help="one tracked component in --selected-source")
    parser.add_argument("--selected-dirty-file", type=Path,
                        help="tracked file in --selected-source outside --selected-component")
    parser.add_argument("--reset-lane-source", type=Path,
                        help="lane workspace with tracked components for checkout reset")
    parser.add_argument("--reset-main-source", type=Path,
                        help="main workspace with tracked components for checkout reset")
    parser.add_argument("--reset-component",
                        help="tracked component selected for checkout reset")
    parser.add_argument("--reset-missing-dir", type=Path,
                        help="directory of --reset-component to remove in each copied workspace")
    parser.add_argument("--reset-second-missing-dir", type=Path,
                        help="another tracked lane directory to remove for all-component reset")
    parser.add_argument("--reset-dirty-file", type=Path,
                        help="tracked file in another component to edit during reset --all")
    parser.add_argument("--reset-main-file", type=Path,
                        help="main file to remove from copied reset workspaces")
    args = parser.parse_args()
    for source in (args.source, args.removed_source, args.selected_source,
                   args.selected_old_source, args.selected_inactive_source,
                   args.selected_inactive_missing_source, args.reset_lane_source,
                   args.reset_main_source):
        if source and not (source / ".bitmap").is_file():
            parser.error(f"missing source bitmap: {source}")
    if bool(args.selected_source) != bool(args.selected_component):
        parser.error("--selected-source and --selected-component are required together")
    if args.selected_dirty_file and not args.selected_source:
        parser.error("--selected-dirty-file requires --selected-source")
    if (args.selected_old_source or args.selected_inactive_source
            or args.selected_inactive_missing_source) and not args.selected_component:
        parser.error("selected variants require --selected-component")
    if (args.reset_lane_source or args.reset_main_source) and not (
            args.reset_component and args.reset_missing_dir):
        parser.error("reset sources require --reset-component and --reset-missing-dir")
    if args.reset_second_missing_dir and not args.reset_lane_source:
        parser.error("--reset-second-missing-dir requires --reset-lane-source")
    if args.reset_dirty_file and not args.reset_missing_dir:
        parser.error("--reset-dirty-file requires --reset-missing-dir")
    if args.reset_main_file and not (args.reset_lane_source or args.reset_main_source):
        parser.error("--reset-main-file requires a reset source")
    if bitmap_has(args.source, args.added):
        parser.error(f"--added component is already in source bitmap: {args.added}")
    print(f"source sha256: {fingerprint(args.source)}")
    if args.removed_source:
        print(f"removed source sha256: {fingerprint(args.removed_source)}")
    if args.selected_source:
        print(f"selected source sha256: {fingerprint(args.selected_source)}")
    if args.selected_old_source:
        print(f"selected old source sha256: {fingerprint(args.selected_old_source)}")
    if args.selected_inactive_source:
        print(f"selected inactive source sha256: {fingerprint(args.selected_inactive_source)}")
    if args.selected_inactive_missing_source:
        print("selected inactive missing source sha256: "
              f"{fingerprint(args.selected_inactive_missing_source)}")
    if args.reset_lane_source:
        print(f"reset lane source sha256: {fingerprint(args.reset_lane_source)}")
    if args.reset_main_source:
        print(f"reset main source sha256: {fingerprint(args.reset_main_source)}")
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
                          ["head", args.selected_component, "-x"], None, False, True))
        if args.selected_old_source:
            cases.append(("selected-id-older-tracked-lane-component", args.selected_old_source,
                          ["head", args.selected_component, "-x"], None, False, True))
        if args.selected_inactive_source:
            cases.append(("selected-id-inactive-tracked-lane-component",
                          args.selected_inactive_source,
                          ["head", args.selected_component, "-x"], None, False, True))
        if args.selected_inactive_missing_source:
            cases.append(("selected-id-inactive-missing-lane-component",
                          args.selected_inactive_missing_source,
                          ["head", args.selected_component, "-x"], None, False, True))
        for name, source, command, added, expect_added, expect_native in cases:
            compare(name, source, command, args.node, args.rust, args.entry, stage,
                    added, expect_added, expect_native, name == "add-absent-install")
        if args.selected_dirty_file:
            compare("selected-id-dirty-other-tracked-component", args.selected_source,
                    ["head", args.selected_component, "-x"], args.node, args.rust,
                    args.entry, stage, None, False, True,
                    dirty_file=args.selected_dirty_file)
        for label, source in (("lane", args.reset_lane_source),
                              ("main", args.reset_main_source)):
            if not source:
                continue
            compare(f"reset-{label}-present", source,
                    ["reset", args.reset_component, "-x"], args.node, args.rust,
                    args.entry, stage, None, False, True)
            for suffix, command in (("selected", ["reset", args.reset_component, "-x"]),
                                    ("all", ["reset", "-a", "-x"])):
                compare(f"reset-{label}-missing-{suffix}", source, command,
                        args.node, args.rust, args.entry, stage, None, False, True,
                        missing_dirs=(args.reset_missing_dir,))
            compare(f"reset-{label}-missing-default", source,
                    ["reset", args.reset_component], args.node, args.rust,
                    args.entry, stage, None, False, True,
                    missing_dirs=(args.reset_missing_dir,))
            if args.reset_main_file:
                for suffix, command in (("selected", ["reset", args.reset_component, "-x"]),
                                        ("all", ["reset", "-a", "-x"]),
                                        ("default", ["reset", args.reset_component])):
                    compare(f"reset-{label}-missing-main-{suffix}", source, command,
                            args.node, args.rust, args.entry, stage, None, False, True,
                            missing_files=(args.reset_main_file,))
        if args.reset_lane_source:
            compare("explicit-main-missing-delegates", args.reset_lane_source,
                    ["main", args.reset_component, "-x"], args.node, args.rust,
                    args.entry, stage, None, False, False,
                    missing_dirs=(args.reset_missing_dir,))
        if args.reset_second_missing_dir:
            compare("reset-lane-two-missing-all", args.reset_lane_source,
                    ["reset", "-a", "-x"], args.node, args.rust, args.entry,
                    stage, None, False, True,
                    missing_dirs=(args.reset_missing_dir, args.reset_second_missing_dir))
        if args.reset_dirty_file:
            for label, source in (("lane", args.reset_lane_source),
                                  ("main", args.reset_main_source)):
                if source:
                    compare(f"reset-{label}-mixed-install", source,
                            ["reset", "-a"], args.node, args.rust, args.entry,
                            stage, None, False, True, install=True,
                            dirty_file=args.reset_dirty_file,
                            missing_dirs=(args.reset_missing_dir,))
        if args.selected_old_source and args.reset_component and args.reset_missing_dir:
            compare("reset-older-bitmap-missing-selected", args.selected_old_source,
                    ["reset", args.reset_component, "-x"], args.node, args.rust,
                    args.entry, stage, None, False, True,
                    missing_dirs=(args.reset_missing_dir,))


if __name__ == "__main__":
    main()
