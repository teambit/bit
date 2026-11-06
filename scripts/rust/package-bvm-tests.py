#!/usr/bin/env python3
"""Exercise relocation and extraction of native bvm archives."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('package_bvm', Path(__file__).with_name('package-bvm.py'))
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.base = self.root / 'base.tar.gz'
        self.binary = self.root / 'native'
        self.binary.write_bytes(b'native executable fixture')
        self.output = self.root / 'result.tar.gz'

    def archive(self, extra=None):
        with tarfile.open(self.base, 'w:gz') as archive:
            for name, contents in [('bin/bit', b'node entry'), ('package.json', b'{"version":"1.0.0"}')]:
                entry = tarfile.TarInfo('bit-1.0.0/node_modules/@teambit/bit/' + name)
                entry.size = len(contents)
                archive.addfile(entry, io.BytesIO(contents))
            if extra:
                archive.addfile(extra)

    def test_relocates_without_changing_node_and_preserves_executable_mode(self):
        self.archive()
        for platform, executable in [('linux', 'bit'), ('darwin', 'bit'), ('win', 'bit.exe')]:
            with self.subTest(platform=platform):
                output = self.root / f'{platform}.tar.gz'
                packager.package(self.base, self.binary, output, '1.0.0-native.1', platform)
                with tarfile.open(output) as archive:
                    archive.extractall(self.root / platform, filter='data')
                root = self.root / platform / 'bit-1.0.0-native.1'
                self.assertEqual((root / 'bin' / executable).read_bytes(), self.binary.read_bytes())
                self.assertEqual((root / 'bin' / executable).stat().st_mode & 0o777, 0o755)
                self.assertEqual((root / 'node_modules/@teambit/bit/bin/bit').read_bytes(), b'node entry')
                manifest = json.loads((root / 'native-release.json').read_text())
                self.assertEqual(manifest['binarySha256'], packager.sha256(self.binary))
                self.assertEqual(manifest['baseArchiveSha256'], packager.sha256(self.base))

    def test_rejects_escaping_links_without_publishing_partial_output(self):
        link = tarfile.TarInfo('bit-1.0.0/node_modules/escape')
        link.type = tarfile.SYMTYPE
        link.linkname = '../../../outside'
        self.archive(link)
        with self.assertRaisesRegex(ValueError, 'symlink leaves'):
            packager.package(self.base, self.binary, self.output, '1.0.0-native.1', 'linux')
        self.assertFalse(self.output.exists())
        self.assertFalse(self.output.with_suffix('.gz.tmp').exists())

    def test_rejects_windows_paths_and_empty_hardlinks(self):
        for name, link in [('bit-1.0.0/escape', 'C:/outside'),
                           ('bit-1.0.0/escape', '..\\..\\outside'),
                           ('bit-1.0.0/escape', ''),
                           ('bit-1.0.0/C:/outside', 'bit-1.0.0/target')]:
            with self.subTest(name=name, link=link):
                entry = tarfile.TarInfo(name)
                entry.type = tarfile.LNKTYPE
                entry.linkname = link
                self.archive(entry)
                with self.assertRaises(ValueError):
                    packager.package(self.base, self.binary, self.output, '1.0.0-native.1', 'win')
                self.assertFalse(self.output.exists())

    def test_refuses_to_replace_existing_release(self):
        self.archive()
        self.output.write_bytes(b'existing release')
        with self.assertRaisesRegex(ValueError, 'already exists'):
            packager.package(self.base, self.binary, self.output, '1.0.0-native.1', 'linux')
        self.assertEqual(self.output.read_bytes(), b'existing release')


if __name__ == '__main__':
    unittest.main()
