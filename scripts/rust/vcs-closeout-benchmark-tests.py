#!/usr/bin/env python3
"""Negative controls for closeout output and tooling object evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zlib

sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CLOSEOUT = load('closeout_negative_subject', 'bench-vcs-closeout.py')
TOOLING = load('tooling_negative_subject', 'bench-vcs-tooling.py')


class OutputTests(unittest.TestCase):
    def output(self, identities):
        return ('prefix\n✔ successfully removed components from the remote scope\n'
                + ''.join(f'   › closeout-benchmark/{identity}\n' for identity in identities)).encode()

    def test_only_success_item_order_is_unspecified(self):
        first = CLOSEOUT.command_output(self.output(['comp1', 'comp2']), 'hard-delete-wildcard')
        second = CLOSEOUT.command_output(self.output(['comp2', 'comp1']), 'hard-delete-wildcard')
        self.assertEqual(first, second)
        self.assertNotEqual(first, CLOSEOUT.command_output(
            self.output(['comp2', 'comp1']).replace(b'prefix', b'changed'), 'hard-delete-wildcard'))

    def test_missing_duplicate_or_unexpected_success_items_are_rejected(self):
        for identities in [['comp1'], ['comp1', 'comp1'], ['comp1', 'comp3']]:
            with self.subTest(identities=identities), self.assertRaises(RuntimeError):
                CLOSEOUT.command_output(self.output(identities), 'hard-delete-wildcard')

    def test_other_commands_keep_item_order(self):
        self.assertNotEqual(
            CLOSEOUT.command_output(self.output(['comp1', 'comp2']), 'hard-delete-exported'),
            CLOSEOUT.command_output(self.output(['comp2', 'comp1']), 'hard-delete-exported'))


class ObjectFixture:
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='vcs-tooling-negative-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / 'objects').mkdir()

    def object(self, value, reference=None, kind='Component', length=None):
        reference = reference or hashlib.sha1(b'fixture/component').hexdigest()
        body = json.dumps(value, ensure_ascii=False).encode()
        length = length if length is not None else len(body.decode().encode('utf-16-le')) // 2
        path = self.root / 'objects' / reference[:2] / reference[2:]
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(zlib.compress(f'{kind} {reference} {length}'.encode() + b'\0' + body))
        return path

    def component(self, date='150'):
        return {'scope': 'fixture', 'name': 'component', 'remotes': [{'date': date}]}


class ObjectTests(ObjectFixture, unittest.TestCase):
    def test_only_validated_live_export_clock_is_projected(self):
        self.object(self.component())
        first, _ = TOOLING.object_inventory(self.root, (100, 200), True)
        self.object(self.component('160'))
        second, _ = TOOLING.object_inventory(self.root, (100, 200), True)
        self.assertEqual(first, second)
        self.object(self.component('50'))
        historical, _ = TOOLING.object_inventory(self.root, (100, 200), True)
        self.assertNotEqual(first, historical)

    def test_changed_component_metadata_and_permissions_survive_projection(self):
        path = self.object(self.component())
        first, _ = TOOLING.object_inventory(self.root, (100, 200), True)
        value = self.component()
        value['unrelated'] = True
        self.object(value)
        changed, _ = TOOLING.object_inventory(self.root, (100, 200), True)
        self.assertNotEqual(first, changed)
        self.object(self.component())
        path.chmod(0o600)
        changed_mode, _ = TOOLING.object_inventory(self.root, (100, 200), True)
        self.assertNotEqual(first, changed_mode)

    def test_wrong_identity_and_serializer_length_are_rejected(self):
        for reference, length in [('1' * 40, None), (None, 1)]:
            with self.subTest(reference=reference, length=length):
                path = self.object(self.component(), reference=reference, length=length)
                with self.assertRaises(RuntimeError):
                    TOOLING.object_inventory(self.root, (100, 200), True)
                path.unlink()

    def test_source_bytes_and_compressed_evidence_remain_distinct(self):
        self.object({'source': 'first'}, kind='Source')
        first, raw_first = TOOLING.object_inventory(self.root, (100, 200), True)
        self.object({'source': 'changed'}, kind='Source')
        changed, raw_changed = TOOLING.object_inventory(self.root, (100, 200), True)
        self.assertNotEqual(first, changed)
        self.assertNotEqual(raw_first, raw_changed)

    def test_corrupt_compression_is_rejected(self):
        path = self.object(self.component())
        path.write_bytes(b'corrupt')
        with self.assertRaises(zlib.error):
            TOOLING.object_inventory(self.root, (100, 200), True)

    def test_object_directory_permissions_are_preserved(self):
        directory = self.root / 'objects'
        before = TOOLING.directory_metadata(directory)
        directory.chmod(0o700)
        self.assertNotEqual(before, TOOLING.directory_metadata(directory))

    def test_export_metadata_clock_must_be_in_command_window(self):
        self.object({'exportDate': '50'}, kind='ExportMetadata')
        with self.assertRaisesRegex(RuntimeError, 'outside measured command'):
            TOOLING.object_inventory(self.root, (100, 200), True)


class WorkspaceTests(ObjectFixture, unittest.TestCase):
    def state(self, baseline, remote):
        with patch.object(CLOSEOUT.STATE, 'scope', return_value=self.root):
            return CLOSEOUT.workspace_state(self.root, baseline, {}, remote, {})

    def test_imported_immutable_requires_exact_frozen_remote_bytes(self):
        path = self.object({'source': 'remote'}, kind='Source')
        remote = CLOSEOUT.strict_objects(self.root)
        self.state({}, remote)
        with self.assertRaisesRegex(RuntimeError, 'lacks exact remote proof'):
            self.state({}, {})
        self.object({'source': 'different'}, kind='Source')
        with self.assertRaisesRegex(RuntimeError, 'lacks exact remote proof'):
            self.state({}, remote)
        path.unlink()

    def test_existing_immutable_changes_or_removal_are_rejected(self):
        path = self.object({'source': 'original'}, kind='Version')
        baseline = CLOSEOUT.strict_objects(self.root)
        self.object({'source': 'changed'}, kind='Version')
        with self.assertRaisesRegex(RuntimeError, 'immutable repository object changed'):
            self.state(baseline, {})
        path.unlink()
        with self.assertRaisesRegex(RuntimeError, 'objects removed'):
            self.state(baseline, {})

    def test_mutable_payload_and_modes_remain_observable(self):
        path = self.object(self.component())
        baseline = CLOSEOUT.strict_objects(self.root)
        original = self.state(baseline, {})
        self.object(dict(self.component(), unrelated=True))
        changed = self.state(baseline, {})
        self.assertNotEqual(original, changed)
        path.chmod(0o600)
        self.assertNotEqual(changed, self.state(baseline, {}))


class ExportIndexTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='vcs-index-negative-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.rows = [{'id': {'scope': TOOLING.PREPARE.SCOPE, 'name': f'comp{i:02d}'},
                      'hash': str(i), 'isSymlink': False} for i in range(12)]

    def project(self, rows=None, *, canonical=True):
        data = {'components': self.rows if rows is None else rows, 'lanes': []}
        raw = (json.dumps(data, indent=2 if canonical else None) + '\n').encode()
        path = self.root / 'index.json'
        path.write_bytes(raw)
        tree = {'index.json': ['file', path.stat().st_mode & 0o7777, TOOLING.hash_bytes(raw)]}
        return TOOLING.project_export_index(self.root, tree)

    def test_only_index_row_order_is_projected(self):
        original = self.project()
        self.assertEqual(original, self.project(list(reversed(self.rows))))
        self.rows[0]['hash'] = 'changed'
        self.assertNotEqual(original, self.project())

    def test_missing_duplicate_and_noncanonical_index_are_rejected(self):
        for rows in [self.rows[:-1], self.rows[:-1] + [self.rows[0]]]:
            with self.assertRaises(RuntimeError):
                self.project(rows)
        with self.assertRaisesRegex(RuntimeError, 'serialization'):
            self.project(canonical=False)


class DetailsClockTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='vcs-details-negative-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / 'globals'
        (self.root / 'last-command-details').mkdir(parents=True)
        self.path = self.root / 'last-command-details/meta.json'

    def project(self, date, **extra):
        value = {'command': 'switch', 'timestamp': date, **extra}
        self.path.write_text(json.dumps(value, separators=(',', ':')))
        tree = TOOLING.STATE.tree(self.root)
        return TOOLING.details_clock(self.root, tree, self.root.parent / 'receipt',
                                     1_000_000_000, 2_000_000_000)

    def test_only_verified_command_timestamp_is_projected(self):
        first = self.project('1970-01-01T00:00:01.100Z')
        second = self.project('1970-01-01T00:00:01.200Z')
        self.assertEqual(first, second)
        self.path.chmod(0o600)
        self.assertNotEqual(first, self.project('1970-01-01T00:00:01.200Z'))

    def test_outside_window_noncanonical_and_extra_fields_are_rejected(self):
        for date in ['1970-01-01T00:00:00.900Z', '1970-01-01T00:00:01Z',
                     '1970-01-01T00:00:01.100', 'invalid']:
            with self.subTest(date=date), self.assertRaises((RuntimeError, ValueError)):
                self.project(date)
        with self.assertRaisesRegex(RuntimeError, 'schema'):
            self.project('1970-01-01T00:00:01.100Z', unexpected=True)


if __name__ == '__main__':
    unittest.main()
