#!/usr/bin/env python3
"""Explicitly assemble a validated scanner into a Bit distribution; never download."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import sys

spec = importlib.util.spec_from_file_location("artifact", Path(__file__).with_name("package-helper.py"))
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)
VERSION = "0.1.0"


def selection(manifest):
    if manifest.get("version") != VERSION or not re.fullmatch("[a-f0-9]{40}", manifest.get("gitRevision", "")):
        raise ValueError("unsupported scanner version or revision")
    return {"version": VERSION, "target": manifest["target"], "revision": manifest["gitRevision"]}


def write_json(path, value):
    descriptor, filename = tempfile.mkstemp(prefix=".selection-", dir=path.parent)
    temporary = Path(filename)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(json.dumps(value, indent=2) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def runtime_modules(directory):
    files = {file.name: file for file in sorted(directory.glob("*.js")) if file.is_file() and not file.is_symlink()}
    for name in ("../generate-tree-madge.js", "../precinct/index.js", "../dependency-tree/index.js", "../dependency-tree/Config.js"):
        file = directory / name
        if file.is_file() and not file.is_symlink():
            files[name] = file
    return {name: artifact.sha256(file.read_bytes()) for name, file in files.items()}


def trusted_release(manifest):
    provenance = manifest.get("provenance", {})
    return provenance.get("binaryInput") == "checkout release output" and provenance.get("buildCommand") == artifact.release_command(manifest["target"])


def install(module_directory, archive, run_smoke=True):
    module_directory = module_directory.resolve(strict=True)
    if any(not (module_directory / name).is_file() or (module_directory / name).is_symlink() for name in ("discovery.js", "session.js")):
        raise ValueError("installation requires the compiled scanner runtime directory")
    manifest, members = artifact.verified_members(archive)
    if not trusted_release(manifest):
        raise ValueError("installation requires the trusted exact-target checkout build")
    chosen = selection(manifest)
    expected_source = artifact.scanner_source_identity()
    if manifest.get("scannerSourceSha256") != expected_source:
        raise ValueError("artifact scanner source does not match this trusted build")
    if run_smoke:
        artifact.smoke(archive)
    root = module_directory / "packaged"
    if root.is_symlink():
        raise ValueError("packaged root must not be a symlink")
    root.mkdir(exist_ok=True)
    destination = root / chosen["version"] / chosen["target"] / chosen["revision"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.parent.resolve() != destination.parent:
        raise ValueError("version/target directory redirect")
    with tempfile.TemporaryDirectory(prefix=".stage-", dir=root) as staging:
        staging = Path(staging)
        for name, data in members.items():
            file = staging / name
            file.write_bytes(data)
            file.chmod(0o755 if name == manifest["binary"]["name"] else 0o644)
        if destination.exists():
            if destination.is_symlink() or any((destination / name).is_symlink() or (destination / name).read_bytes() != data for name, data in members.items()):
                raise ValueError("immutable installed artifact mismatch")
        else:
            os.replace(staging, destination)
    contract_path = module_directory / "packaged-build.json"
    known = []
    if contract_path.exists():
        contract = json.loads(contract_path.read_text())
        if contract.get("scannerSourceSha256") == expected_source:
            known = contract.get("artifacts", [])
    entry = {**chosen, "binarySha256": manifest["binary"]["sha256"], "manifestSha256": artifact.sha256(members["manifest.json"])}
    known = [candidate for candidate in known if candidate != entry] + [entry]
    known = known[-32:]
    write_json(contract_path, {"format": 1, "scannerSourceSha256": expected_source,
        "modules": runtime_modules(module_directory),
        "artifacts": known})
    current = root / "current.json"
    if current.exists():
        prior = json.loads(current.read_text())
        if prior != chosen:
            write_json(root / "previous.json", prior)
    write_json(current, chosen)
    return destination


def rollback(module_directory):
    module_directory = module_directory.resolve(strict=True)
    root = module_directory / "packaged"
    if root.is_symlink():
        raise ValueError("packaged root redirect")
    previous = json.loads((root / "previous.json").read_text())
    if previous.get("version") != VERSION or previous.get("target") not in artifact.TARGETS or not re.fullmatch("[a-f0-9]{40}", previous.get("revision", "")):
        raise ValueError("invalid rollback selection")
    directory = root / VERSION / previous["target"] / previous["revision"]
    if directory.resolve(strict=True) != directory or directory.is_symlink():
        raise ValueError("rollback directory redirect")
    manifest = json.loads((directory / "manifest.json").read_text())
    contract = json.loads((module_directory / "packaged-build.json").read_text())
    expected_entry = {**previous, "binarySha256": manifest["binary"]["sha256"], "manifestSha256": artifact.sha256((directory / "manifest.json").read_bytes())}
    if manifest.get("scannerSourceSha256") != contract.get("scannerSourceSha256") or expected_entry not in contract.get("artifacts", []):
        raise ValueError("rollback artifact is incompatible with assembled runtime")
    if selection(manifest) != previous:
        raise ValueError("rollback manifest mismatch")
    if not trusted_release(manifest):
        raise ValueError("rollback requires the trusted exact-target checkout build")
    if manifest.get("artifactFormat") != 2 or manifest.get("protocolVersion") != 1 or manifest.get("platform") != artifact.TARGETS[previous["target"]] or manifest.get("binary", {}).get("name") != artifact.binary_name(previous["target"]):
        raise ValueError("rollback contract mismatch")
    for field in ("license", "notices"):
        name = "LICENSE" if field == "license" else "THIRD-PARTY-NOTICES.txt"
        file = directory / name
        if file.is_symlink() or manifest.get(field) != {"name": name, "sha256": artifact.sha256(file.read_bytes())}:
            raise ValueError("rollback license/notices mismatch")
    binary = directory / manifest["binary"]["name"]
    if binary.is_symlink() or artifact.sha256(binary.read_bytes()) != manifest["binary"]["sha256"]:
        raise ValueError("rollback binary checksum mismatch")
    current = json.loads((root / "current.json").read_text())
    write_json(root / "current.json", previous)
    write_json(root / "previous.json", current)


def assemble(distribution, archive, target):
    distribution = distribution.resolve(strict=True)
    manifest, _ = artifact.verified_members(archive)
    if not trusted_release(manifest):
        raise ValueError("distribution assembly requires the trusted checkout release build")
    if manifest["target"] != target:
        raise ValueError("artifact does not match distribution target")
    modules = set()
    for folder, _, files in os.walk(distribution):
        if Path(folder).name == "rust-scanner" and "discovery.js" in files and "session.js" in files:
            directory = Path(folder).resolve(strict=True)
            if not directory.is_relative_to(distribution):
                raise ValueError("scanner module escapes distribution")
            modules.add(directory)
    if not modules:
        raise ValueError("compiled scanner runtime not found in distribution")
    for directory in sorted(modules):
        install(directory, archive, run_smoke=False)
    return modules


def main():
    # Windows redirected stdout defaults to a legacy code page; paths are Unicode.
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["install", "rollback", "assemble"])
    parser.add_argument("--module-directory", type=Path)
    parser.add_argument("--distribution", type=Path)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--target", choices=artifact.TARGETS)
    args = parser.parse_args()
    if args.operation == "assemble":
        if not args.distribution or not args.archive or not args.target:
            parser.error("assemble requires --distribution, --archive and --target")
        print("\n".join(map(str, assemble(args.distribution, args.archive, args.target))))
    else:
        if not args.module_directory or (args.operation == "install" and not args.archive):
            parser.error("install/rollback require --module-directory; install requires --archive")
        if args.operation == "install":
            print(install(args.module_directory, args.archive))
        else:
            rollback(args.module_directory)


if __name__ == "__main__":
    main()
