"""Determinism and rejection tests for the private scanner artifact format."""
import gzip
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("artifact", Path(__file__).with_name("package-helper.py"))
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="bit artifact tests ")
        self.addCleanup(self.directory.cleanup)
        self.binary = b"\x7fELF\x02\x01" + b"\x00" * 12 + b"\x3e\x00" + b"deterministic binary contents"
        self.license = b"repository license"
        self.manifest = {
            "scannerSourceSha256": artifact.scanner_source_identity(), "minimumGlibc": "2.0", "artifactFormat": 2, "protocolVersion": 1, "name": "bit-dependency-scanner",
            "target": "x86_64-unknown-linux-gnu", "platform": artifact.TARGETS["x86_64-unknown-linux-gnu"],
            "binary": {"name": "bit-dependency-scanner", "sha256": artifact.sha256(self.binary), "bytes": len(self.binary)},
            "notices": {"name": "THIRD-PARTY-NOTICES.txt", "sha256": artifact.sha256(b"")},
            "license": {"name": "LICENSE", "sha256": artifact.sha256(self.license)},
        }
        self.path = Path(self.directory.name) / "test.tar.gz"

    def write(self, data):
        self.path.write_bytes(data)
        self.path.with_name(self.path.name + ".sha256").write_bytes(f"{artifact.sha256(data)}  {self.path.name}\n".encode("ascii"))
        self.path.with_name(self.path.name + ".manifest.json").write_bytes((json.dumps(self.manifest, indent=2) + "\n").encode("utf-8"))

    def test_same_inputs_produce_identical_archive_bytes(self):
        first = artifact.archive_bytes(self.binary, self.manifest, self.license)
        self.assertEqual(first, artifact.archive_bytes(self.binary, self.manifest, self.license))
        self.assertEqual(first[4:8], b"\0\0\0\0")
        self.write(first)
        manifest, members = artifact.verified_members(self.path)
        self.assertEqual(manifest, self.manifest)
        self.assertEqual(members["bit-dependency-scanner"], self.binary)
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(first)), mode="r:") as archive:
            self.assertEqual(archive.getnames(), sorted(archive.getnames()))
            for member in archive.getmembers():
                self.assertEqual((member.uid, member.gid, member.mtime), (0, 0, 0))
                self.assertEqual(member.mode, 0o755 if member.name == "bit-dependency-scanner" else 0o644)

    def test_default_packaging_rebuilds_exact_target_instead_of_attesting_stale_output(self):
        for target_override in (None, "aarch64-unknown-linux-gnu"):
            with self.subTest(target=target_override):
                root = Path(self.directory.name) / (target_override or "host")
                (root / "native" / "dependency-scanner").mkdir(parents=True)
                (root / "native" / "dependency-scanner" / "Cargo.toml").write_text('[package]\nversion = "0.1.0"\n')
                (root / "native" / "Cargo.lock").write_text("fixture lockfile")
                (root / "LICENSE").write_bytes(self.license)
                target = target_override or "x86_64-unknown-linux-gnu"
                binary = root / "native" / "target" / target / "release" / "bit-dependency-scanner"
                binary.parent.mkdir(parents=True)
                binary.write_bytes(self.binary + b"stale")
                fresh = self.binary if target_override is None else self.binary[:18] + b"\xb7\x00" + self.binary[20:]
                def build(args, cwd, env, stdout):
                    self.assertEqual(args, artifact.release_command(target))
                    self.assertEqual(cwd, root / "native")
                    self.assertEqual(env["CARGO_TARGET_DIR"], str(root / "native" / "target"))
                    binary.write_bytes(fresh)
                def command(*args):
                    if args[0] == "rustc":
                        return "host: x86_64-unknown-linux-gnu"
                    if args[1] == "rev-parse":
                        return "a" * 40
                    return "tree " + "b" * 40
                with patch.object(artifact, "ROOT", root), patch.object(artifact, "command", command), patch.object(artifact, "notices", return_value=b"notices"), patch.object(artifact, "scanner_source_identity", return_value="f" * 64), patch.object(artifact.subprocess, "check_call", side_effect=build), patch.object(artifact.subprocess, "check_output", return_value="GLIBC_2.0"):
                    archive = artifact.package(root / "dist", target_override=target_override)
                manifest, members = artifact.verified_members(archive)
                self.assertEqual(members["bit-dependency-scanner"], fresh)
                self.assertEqual(manifest["provenance"]["buildCommand"], artifact.release_command(target))
                self.assertEqual(manifest["target"], target)

    def test_changed_archive_fails_external_checksum(self):
        self.write(artifact.archive_bytes(self.binary, self.manifest, self.license))
        self.path.write_bytes(self.path.read_bytes() + b"tampering")
        with self.assertRaisesRegex(ValueError, "archive checksum"):
            artifact.verified_members(self.path)

    def test_binary_content_mismatch_is_rejected(self):
        self.write(artifact.archive_bytes(b"different binary", self.manifest, self.license))
        with self.assertRaisesRegex(ValueError, "binary checksum"):
            artifact.verified_members(self.path)

    def test_detached_manifest_mismatch_is_rejected(self):
        self.write(artifact.archive_bytes(self.binary, self.manifest, self.license))
        self.path.with_name(self.path.name + ".manifest.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "detached manifest"):
            artifact.verified_members(self.path)

    def test_traversal_links_and_duplicate_names_are_rejected(self):
        for name, member_type in [("../escape", tarfile.REGTYPE), ("bit-dependency-scanner", tarfile.SYMTYPE), ("manifest.json", tarfile.REGTYPE)]:
            with self.subTest(name=name, type=member_type):
                raw = io.BytesIO()
                with tarfile.open(fileobj=raw, mode="w") as archive:
                    for fixed in ["manifest.json", "LICENSE", name]:
                        member = tarfile.TarInfo(fixed)
                        member.type = member_type if fixed == name else tarfile.REGTYPE
                        member.linkname = "../../escape" if member.type == tarfile.SYMTYPE else ""
                        content = (json.dumps(self.manifest, indent=2) + "\n").encode() if fixed == "manifest.json" else self.license if fixed == "LICENSE" else self.binary
                        member.size = len(content) if member.type == tarfile.REGTYPE else 0
                        archive.addfile(member, io.BytesIO(content))
                self.write(gzip.compress(raw.getvalue(), mtime=0))
                with self.assertRaises(ValueError):
                    artifact.verified_members(self.path)

    def test_compressed_and_expanded_limits_are_checked(self):
        self.write(artifact.archive_bytes(self.binary, self.manifest, self.license))
        with patch.object(artifact, "MAX_ARCHIVE_BYTES", 1):
            with self.assertRaisesRegex(ValueError, "compressed artifact"):
                artifact.verified_members(self.path)
        with patch.object(artifact, "MAX_EXPANDED_BYTES", 1):
            with self.assertRaisesRegex(ValueError, "expanded artifact"):
                artifact.verified_members(self.path)

    def test_unsupported_protocol_version_is_rejected(self):
        self.manifest["protocolVersion"] = 2
        self.write(artifact.archive_bytes(self.binary, self.manifest, self.license))
        with self.assertRaisesRegex(ValueError, "unsupported artifact manifest"):
            artifact.verified_members(self.path)


if __name__ == "__main__":
    unittest.main()
