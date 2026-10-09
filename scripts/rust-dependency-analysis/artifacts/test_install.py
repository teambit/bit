"""Exercise staging, immutable revisions, rollback and distribution assembly."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("installer", Path(__file__).with_name("install-helper.py"))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
artifact = installer.artifact


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="bit install tests ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.module = self.root / "distribution" / "node_modules" / "@teambit" / "dependencies" / "dist" / "files-dependency-builder" / "rust-scanner"
        self.module.mkdir(parents=True)
        (self.module / "discovery.js").write_text("compiled discovery fixture")
        (self.module / "session.js").write_text("compiled session fixture")

    def archive(self, revision, version="0.1.0", binary=b"\x7fELF\x02\x01" + b"\x00" * 12 + b"\x3e\x00fixture binary", target="x86_64-unknown-linux-gnu", source_identity=None):
        license_bytes, notices = b"repository license", b"third-party license notices"
        manifest = {"scannerSourceSha256": source_identity or artifact.scanner_source_identity(), "provenance": {"binaryInput": "checkout release output", "buildCommand": artifact.release_command(target)}, "minimumGlibc": "2.0", "artifactFormat": 2, "protocolVersion": 1, "name": "bit-dependency-scanner", "version": version, "gitRevision": revision,
                    "target": target, "platform": artifact.TARGETS[target],
                    "binary": {"name": artifact.binary_name(target), "sha256": artifact.sha256(binary), "bytes": len(binary)},
                    "license": {"name": "LICENSE", "sha256": artifact.sha256(license_bytes)},
                    "notices": {"name": "THIRD-PARTY-NOTICES.txt", "sha256": artifact.sha256(notices)}}
        file = self.root / (revision + ".tar.gz")
        contents = artifact.archive_bytes(binary, manifest, license_bytes, notices)
        file.write_bytes(contents)
        file.with_name(file.name + ".sha256").write_text(f"{artifact.sha256(contents)}  {file.name}\n")
        file.with_name(file.name + ".manifest.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode())
        return file

    def active(self):
        return json.loads((self.module / "packaged" / "current.json").read_text())

    def test_activate_two_revisions_and_rollback_both_directions(self):
        installer.install(self.module, self.archive("a" * 40), run_smoke=False)
        installer.install(self.module, self.archive("b" * 40), run_smoke=False)
        self.assertEqual(self.active()["revision"], "b" * 40)
        installer.rollback(self.module)
        self.assertEqual(self.active()["revision"], "a" * 40)
        installer.rollback(self.module)
        self.assertEqual(self.active()["revision"], "b" * 40)

    def test_bad_archive_never_changes_active_selection(self):
        installer.install(self.module, self.archive("a" * 40), run_smoke=False)
        original = self.active()
        bad = self.archive("b" * 40)
        bad.write_bytes(b"corrupt")
        with self.assertRaises(ValueError):
            installer.install(self.module, bad, run_smoke=False)
        self.assertEqual(self.active(), original)
        with self.assertRaises(ValueError):
            installer.install(self.module, self.archive("c" * 40, version="9.0.0"), run_smoke=False)
        self.assertEqual(self.active(), original)

    def test_older_same_version_source_identity_cannot_replace_new_runtime(self):
        installer.install(self.module, self.archive("a" * 40), run_smoke=False)
        before = self.active()
        with self.assertRaisesRegex(ValueError, "source"):
            installer.install(self.module, self.archive("b" * 40, source_identity="0" * 64), run_smoke=False)
        self.assertEqual(self.active(), before)

    def test_same_revision_is_immutable_and_idempotent(self):
        archive = self.archive("a" * 40)
        installer.install(self.module, archive, run_smoke=False)
        installer.install(self.module, archive, run_smoke=False)
        with self.assertRaises(ValueError):
            installer.install(self.module, self.archive("a" * 40, binary=b"\x7fELF\x02\x01" + b"\x00" * 12 + b"\x3e\x00different"), run_smoke=False)
        self.assertEqual(self.active()["revision"], "a" * 40)

    def test_rollback_rejects_corrupt_previous_binary(self):
        directory = installer.install(self.module, self.archive("a" * 40), run_smoke=False)
        installer.install(self.module, self.archive("b" * 40), run_smoke=False)
        (directory / "bit-dependency-scanner").write_bytes(b"changed")
        with self.assertRaises(ValueError):
            installer.rollback(self.module)
        self.assertEqual(self.active()["revision"], "b" * 40)

    def test_assembler_includes_only_compiled_runtime_and_rejects_wrong_target(self):
        archive = self.archive("a" * 40)
        distribution = self.root / "distribution"
        self.assertEqual(installer.assemble(distribution, archive, "x86_64-unknown-linux-gnu"), {self.module})
        self.assertTrue((self.module / "packaged" / "current.json").is_file())
        with self.assertRaises(ValueError):
            installer.assemble(distribution, archive, "aarch64-unknown-linux-gnu")
        self.assertEqual(self.active()["revision"], "a" * 40)

    def test_unattested_or_wrong_build_target_cannot_activate(self):
        archive = self.archive("a" * 40)
        manifest, members = artifact.verified_members(archive)
        for command in (None, artifact.release_command("aarch64-unknown-linux-gnu")):
            manifest["provenance"]["buildCommand"] = command
            contents = artifact.archive_bytes(members["bit-dependency-scanner"], manifest, members["LICENSE"], members["THIRD-PARTY-NOTICES.txt"])
            archive.write_bytes(contents)
            archive.with_name(archive.name + ".sha256").write_text(f"{artifact.sha256(contents)}  {archive.name}\n")
            archive.with_name(archive.name + ".manifest.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode())
            with self.assertRaisesRegex(ValueError, "exact-target checkout build"):
                installer.install(self.module, archive, run_smoke=False)
            self.assertFalse((self.module / "packaged").exists())


if __name__ == "__main__":
    unittest.main()
