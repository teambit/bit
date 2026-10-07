#!/usr/bin/env python3
"""Create and validate standalone experimental scanner artifacts; never publish them."""

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import platform
import subprocess
import tarfile
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parents[3]
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_EXPANDED_BYTES = 256 * 1024 * 1024
TARGETS = {
    "x86_64-unknown-linux-gnu": {"os": "linux", "arch": "x64", "abi": "gnu"},
    "x86_64-apple-darwin": {"os": "darwin", "arch": "x64", "abi": "darwin"},
    "aarch64-apple-darwin": {"os": "darwin", "arch": "arm64", "abi": "darwin"},
    "x86_64-pc-windows-msvc": {"os": "win32", "arch": "x64", "abi": "msvc"},
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def command(*args):
    return subprocess.check_output(args, cwd=ROOT / "native", text=True).strip()


def binary_name(target):
    return "bit-dependency-scanner.exe" if TARGETS[target]["os"] == "win32" else "bit-dependency-scanner"


def archive_bytes(binary, manifest, license_bytes):
    stream = io.BytesIO()
    members = {"LICENSE": license_bytes, binary_name(manifest["target"]): binary, "manifest.json": (json.dumps(manifest, indent=2) + "\n").encode()}
    with tarfile.open(fileobj=stream, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(members.items()):
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.mode = 0o755 if name == binary_name(manifest["target"]) else 0o644
            member.uid = member.gid = member.mtime = 0
            member.uname = member.gname = ""
            archive.addfile(member, io.BytesIO(data))
    compressed = io.BytesIO()
    with gzip.GzipFile(fileobj=compressed, mode="wb", filename="", mtime=0, compresslevel=9) as output:
        output.write(stream.getvalue())
    return compressed.getvalue()


def package(output_directory, binary_path=None):
    compiler = command("rustc", "-vV")
    target = next(line.removeprefix("host: ") for line in compiler.splitlines() if line.startswith("host: "))
    if target not in TARGETS:
        raise ValueError(f"target is outside the artifact validation matrix: {target}")
    supplied_binary = binary_path is not None
    binary_path = binary_path or ROOT / "native" / "target" / "release" / binary_name(target)
    if binary_path.stat().st_size > MAX_EXPANDED_BYTES:
        raise ValueError("binary exceeds artifact size limit")
    binary = binary_path.read_bytes()
    cargo = tomllib.loads((ROOT / "native" / "dependency-scanner" / "Cargo.toml").read_text())
    revision = command("git", "rev-parse", "HEAD")
    # Pull-request CI builds GitHub's transient merge commit; its parents name the base and PR head.
    # Read the raw commit object: a shallow checkout's history reports no parents.
    commit = command("git", "cat-file", "commit", "HEAD").split("\n\n", 1)[0]
    parents = [line.removeprefix("parent ") for line in commit.splitlines() if line.startswith("parent ")]
    license_bytes = (ROOT / "LICENSE").read_bytes()
    manifest = {
        "artifactFormat": 1,
        "protocolVersion": 1,
        "name": "bit-dependency-scanner",
        "version": cargo["package"]["version"],
        "gitRevision": revision,
        "gitParents": parents,
        "provenance": {
            "revisionScope": "source checkout HEAD",
            "rustcScope": "packaging environment",
            "binaryInput": "explicit --binary" if supplied_binary else "checkout release output",
        },
        "target": target,
        "platform": TARGETS[target],
        "rustc": compiler,
        "cargoLockSha256": sha256((ROOT / "native" / "Cargo.lock").read_bytes()),
        "buildPlatform": {"system": platform.system(), "machine": platform.machine(), "osVersion": platform.release(), "libc": list(platform.libc_ver())},
        "license": {"name": "LICENSE", "sha256": sha256(license_bytes)},
        "binary": {"name": binary_name(target), "sha256": sha256(binary), "bytes": len(binary)},
    }
    filename = f"bit-dependency-scanner-{manifest['version']}-{target}-{revision[:12]}.tar.gz"
    output_directory.mkdir(parents=True, exist_ok=True)
    archive = archive_bytes(binary, manifest, license_bytes)
    if len(archive) > MAX_ARCHIVE_BYTES:
        raise ValueError("compressed artifact exceeds size limit")
    artifact = output_directory / filename
    artifact.write_bytes(archive)
    artifact.with_name(filename + ".sha256").write_bytes(f"{sha256(archive)}  {filename}\n".encode("ascii"))
    artifact.with_name(filename + ".manifest.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf-8"))
    return artifact


def verified_members(artifact):
    if artifact.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("compressed artifact exceeds size limit")
    compressed = artifact.read_bytes()
    expected = artifact.with_name(artifact.name + ".sha256").read_text(encoding="ascii")
    if expected != f"{sha256(compressed)}  {artifact.name}\n":
        raise ValueError("archive checksum mismatch")
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        expanded = stream.read(MAX_EXPANDED_BYTES + 1)
    if len(expanded) > MAX_EXPANDED_BYTES:
        raise ValueError("expanded artifact exceeds size limit")
    with tarfile.open(fileobj=io.BytesIO(expanded), mode="r:") as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != 3 or len(set(names)) != 3 or "manifest.json" not in names:
            raise ValueError("unexpected artifact members")
        if any(not member.isfile() for member in members):
            raise ValueError("artifact members must be regular files")
        data = {member.name: archive.extractfile(member).read() for member in members}
        manifest = json.loads(data["manifest.json"])
        target = manifest.get("target")
        if target not in TARGETS or manifest.get("artifactFormat") != 1 or manifest.get("protocolVersion") != 1:
            raise ValueError("unsupported artifact manifest")
        if manifest.get("platform") != TARGETS[target] or set(names) != {"manifest.json", "LICENSE", binary_name(target)}:
            raise ValueError("artifact platform or member mismatch")
        if manifest.get("name") != "bit-dependency-scanner":
            raise ValueError("unexpected artifact name")
        if manifest.get("license") != {"name": "LICENSE", "sha256": sha256(data["LICENSE"])}:
            raise ValueError("license checksum mismatch")
        binary = data[binary_name(target)]
        if manifest.get("binary") != {"name": binary_name(target), "sha256": sha256(binary), "bytes": len(binary)}:
            raise ValueError("binary checksum or metadata mismatch")
        detached = artifact.with_name(artifact.name + ".manifest.json").read_bytes()
        if detached != data["manifest.json"]:
            raise ValueError("detached manifest mismatch")
        return manifest, data


def smoke(artifact):
    manifest, members = verified_members(artifact)
    system = {"Linux": "linux", "Darwin": "darwin", "Windows": "win32"}.get(platform.system())
    arch = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine().lower())
    if manifest["platform"]["os"] != system or manifest["platform"]["arch"] != arch:
        raise ValueError("artifact target does not match smoke-test host")
    with tempfile.TemporaryDirectory(prefix="bit scanner артефакт ") as directory:
        directory = Path(directory)
        for name, data in members.items():
            destination = directory / name
            destination.write_bytes(data)
            destination.chmod(0o755 if name == manifest["binary"]["name"] else 0o644)
        binary = directory / manifest["binary"]["name"]
        source = "import type { Thing } from './unicode-λ';"
        requests = [
            {"version": 1, "id": "artifact-source", "files": [{"path": "space λ.ts", "source": source}], "options": {}},
            {"version": 1, "id": "artifact-error", "files": [{"path": "bad.ts", "source": "const value: = 1;"}], "options": {}},
        ]
        output = subprocess.run([str(binary), "--threads", "1"], cwd=directory, input="".join(json.dumps(request) + "\n" for request in requests), text=True, encoding="utf-8", capture_output=True, timeout=30, check=True)
        responses = [json.loads(line) for line in output.stdout.splitlines()]
        if len(responses) != 2 or [response.get("id") for response in responses] != [request["id"] for request in requests]:
            raise ValueError("smoke response identity mismatch")
        for response, request in zip(responses, requests):
            if response.get("version") != 1 or len(response.get("files", [])) != 1:
                raise ValueError("smoke protocol version or file count mismatch")
            if response["files"][0].get("path") != request["files"][0]["path"]:
                raise ValueError("smoke file identity mismatch")
        first = responses[0]["files"][0]
        if first["status"] != "ok" or first["dependencies"].get("./unicode-λ", {}).get("isTypeImport") is not True:
            raise ValueError("smoke dependency extraction failed")
        if responses[1]["files"][0]["status"] != "parse_error":
            raise ValueError("smoke parse-error behavior failed")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["package", "smoke"])
    parser.add_argument("--directory", type=Path, default=ROOT / "native" / "dist")
    parser.add_argument("--binary", type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    if args.operation == "package":
        print(package(args.directory, args.binary))
    else:
        artifacts = [args.archive] if args.archive else list(args.directory.glob("*.tar.gz"))
        if len(artifacts) != 1:
            parser.error("smoke requires exactly one archive, or explicit --archive")
        print(json.dumps(smoke(artifacts[0]), indent=2))


if __name__ == "__main__":
    main()
