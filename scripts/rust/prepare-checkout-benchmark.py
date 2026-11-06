#!/usr/bin/env python3
"""Prepare immutable two-version checkout fixtures using the published Node CLI.

The input fixtures are copied with symlinks preserved. No command runs in an input
directory. The destination must not exist. Logs and fingerprints describe exactly
which inputs and commands generated each benchmark workspace.
"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess


def fingerprint(root):
    spec = importlib.util.spec_from_file_location(
        "benchmark", Path(__file__).with_name("bench-native-command.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.fingerprint(root)


def prepare(source, destination, node, component, filename, initial):
    before = fingerprint(source)
    shutil.copytree(source, destination, symlinks=True)
    environment = os.environ.copy()
    environment.update(BIT_NATIVE="off", CI="1")
    commands = []

    def tag(message):
        command = [str(node), "tag", component, "--message", message]
        result = subprocess.run(command, cwd=destination, env=environment,
                                text=True, capture_output=True, check=False)
        logfile = destination.parent / f"{destination.name}-{len(commands)}.log"
        logfile.write_text(result.stdout + result.stderr)
        commands.append(command)
        if result.returncode:
            raise RuntimeError(f"fixture tag failed: {logfile}")

    if initial:
        tag("checkout benchmark initial")
    path = destination / filename
    with path.open("a") as output:
        output.write("\n// checkout benchmark second version\n")
    tag("checkout benchmark second")
    with path.open("a") as output:
        output.write("\n// checkout benchmark local modification\n")
    if before != fingerprint(source):
        raise RuntimeError(f"input fixture changed: {source}")
    return {"source": str(source), "source_sha256": before, "commands": commands,
            "fixture": str(destination), "fixture_sha256": fingerprint(destination)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ordinary", type=Path, required=True)
    parser.add_argument("--callbacks", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=False)
    report = {}
    for label, source, component, filename, initial in [
        ("ordinary", args.ordinary, "comp2", "comp2/index.js", False),
        ("callbacks", args.callbacks, "bar/foo", "bar/foo.js", True),
    ]:
        report[label] = prepare(source.resolve(), args.destination / label,
                                args.node.resolve(), component, filename, initial)
    (args.destination / "fixtures.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
