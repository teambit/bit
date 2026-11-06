#!/usr/bin/env python3
"""Negative controls for the actual graph-reset benchmark evidence validators."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import unittest
import zlib

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location(
    'graph_reset_benchmark_tests_subject', Path(__file__).with_name('bench-lane-graph-reset.py'))
BENCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BENCH)


def workspace(parent, name):
    root = parent / name
    (root / '.bit/objects').mkdir(parents=True)
    (root / '.bitmap').write_bytes(b'{}\n')
    return root


def object_file(root, reference, kind, body, *, level=6, header=None):
    path = root / '.bit/objects' / reference[:2] / reference[2:]
    path.parent.mkdir(exist_ok=True)
    length = len(body.decode('utf-8', errors='replace').encode('utf-16-le')) // 2
    raw = (header if header is not None else f'{kind} {reference} {length}'.encode()) + b'\0' + body
    path.write_bytes(zlib.compress(raw, level=level))
    return path


class ObjectEvidenceTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='graph-reset-object-unit-')
        self.addCleanup(directory.cleanup)
        self.parent = Path(directory.name)
        self.root = workspace(self.parent, 'workspace')
        self.remote = self.parent / 'remote'
        (self.remote / 'objects').mkdir(parents=True)

    def state(self, baseline):
        return BENCH.workspace_state(self.root, baseline, {}, {}, self.remote)

    def test_valid_header_uses_javascript_utf16_units_for_astral_characters(self):
        body = json.dumps({'name': 'name😀'}, ensure_ascii=False).encode()
        reference = '1' * 40
        object_file(self.root, reference, 'Component', body)
        self.assertEqual(BENCH.strict_objects(self.root)[reference][1], body)

    def test_wrong_header_identity_or_utf8_length_is_rejected(self):
        body = json.dumps({'name': 'name😀'}, ensure_ascii=False).encode()
        reference = '1' * 40
        utf16_length = len(body.decode().encode('utf-16-le')) // 2
        for header in [f'Component {"2" * 40} {utf16_length}'.encode(),
                       f'Component {reference} {len(body)}'.encode()]:
            with self.subTest(header=header):
                object_file(self.root, reference, 'Component', body, header=header)
                with self.assertRaisesRegex(RuntimeError, 'identity/length'):
                    BENCH.strict_objects(self.root)

    def test_invalid_prefix_and_corrupt_compressed_body_are_rejected(self):
        invalid = self.root / '.bit/objects/zz'
        invalid.mkdir()
        with self.assertRaisesRegex(RuntimeError, 'invalid object prefix'):
            BENCH.strict_objects(self.root)
        invalid.rmdir()
        path = object_file(self.root, '1' * 40, 'Component', b'{}')
        path.write_bytes(b'not a compressed object')
        with self.assertRaises(zlib.error):
            BENCH.strict_objects(self.root)

    def test_version_and_source_body_changes_are_not_projected_away(self):
        for kind in ['Version', 'Source']:
            with self.subTest(kind=kind):
                reference = hashlib.sha1(kind.encode()).hexdigest()
                path = object_file(self.root, reference, kind, b'original')
                baseline = BENCH.strict_objects(self.root)
                object_file(self.root, reference, kind, b'changed')
                with self.assertRaisesRegex(RuntimeError, 'existing repository object changed'):
                    self.state(baseline)
                path.unlink()

    def test_immutable_compressed_bytes_reject_same_payload_different_encoding(self):
        for kind in ['Version', 'Source']:
            with self.subTest(kind=kind):
                reference = hashlib.sha1(kind.encode()).hexdigest()
                body = b'preserved body ' * 20
                path = object_file(self.root, reference, kind, body, level=0)
                before = path.read_bytes()
                object_file(self.root, reference, kind, body, level=6)
                self.assertNotEqual(path.read_bytes(), before)
                with self.assertRaisesRegex(RuntimeError, 'immutable compressed'):
                    BENCH.validate_immutable_bytes(self.root, {reference: before})
                path.unlink()

    def test_version_and_source_mode_changes_and_deletions_are_rejected(self):
        for kind in ['Version', 'Source']:
            with self.subTest(kind=kind):
                reference = hashlib.sha1(kind.encode()).hexdigest()
                path = object_file(self.root, reference, kind, b'original')
                baseline = BENCH.strict_objects(self.root)
                path.chmod(stat.S_IREAD)
                self.assertNotEqual(stat.S_IMODE(path.stat().st_mode), baseline[reference][2])
                with self.assertRaisesRegex(RuntimeError, 'existing repository object changed'):
                    self.state(baseline)
                path.chmod(stat.S_IREAD | stat.S_IWRITE)
                path.unlink()
                with self.assertRaisesRegex(RuntimeError, 'removed a non-Component'):
                    self.state(baseline)
                with self.assertRaises(FileNotFoundError):
                    BENCH.validate_immutable_bytes(self.root, {reference: b'original'})

    def test_mutable_model_changes_still_require_exact_node_pair_state(self):
        for kind in sorted(BENCH.MUTABLE_OBJECTS):
            with self.subTest(kind=kind):
                reference = hashlib.sha1(kind.encode()).hexdigest()
                path = object_file(self.root, reference, kind, b'{"before":true}')
                baseline = BENCH.strict_objects(self.root)
                object_file(self.root, reference, kind, b'{"after":"native"}')
                native = self.state(baseline)
                object_file(self.root, reference, kind, b'{"after":"node"}')
                self.assertNotEqual(self.state(baseline), native)
                object_file(self.root, reference, kind, b'{"after":"native"}')
                self.assertEqual(self.state(baseline), native)
                path.unlink()

    def test_component_deletion_is_visible_and_other_mutable_deletion_is_rejected(self):
        reference = '1' * 40
        path = object_file(self.root, reference, 'Component', b'{}')
        baseline = BENCH.strict_objects(self.root)
        original = self.state(baseline)
        path.unlink()
        self.assertNotEqual(self.state(baseline), original)
        path = object_file(self.root, reference, 'LaneHistory', b'{}')
        baseline = BENCH.strict_objects(self.root)
        path.unlink()
        with self.assertRaisesRegex(RuntimeError, 'removed a non-Component'):
            self.state(baseline)

    def test_new_immutable_object_must_equal_the_actual_remote_wire_bytes(self):
        reference = '1' * 40
        path = object_file(self.root, reference, 'Source', b'new source')
        with self.assertRaisesRegex(RuntimeError, 'actual remote'):
            self.state({})
        remote = self.remote / 'objects' / reference[:2] / reference[2:]
        remote.parent.mkdir()
        remote.write_bytes(path.read_bytes())
        self.state({})
        remote.write_bytes(b'different remote bytes')
        with self.assertRaisesRegex(RuntimeError, 'actual remote'):
            self.state({})


class ZeroWriteHistoryTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='graph-reset-history-unit-')
        self.addCleanup(directory.cleanup)
        self.parent = Path(directory.name)
        self.root = workspace(self.parent, 'workspace')
        self.baseline = self.parent / 'baseline'

    def freeze(self):
        shutil.copytree(self.root, self.baseline)
        self.raw = BENCH.raw_history(self.root)
        self.oracle = {'baseline_raw_history': BENCH.ORACLE.raw_history(self.root)}

    def validate(self):
        BENCH.validate_error_history(self.root, self.baseline, self.raw, self.oracle)

    def test_absent_history_is_preserved_and_empty_metadata_creation_is_rejected(self):
        self.freeze()
        self.validate()
        (self.root / '.bit/bitmap-history-metadata.txt').write_bytes(b'')
        with self.assertRaisesRegex(RuntimeError, 'wrote bitmap/history'):
            self.validate()

    def test_creating_only_an_empty_history_directory_is_rejected(self):
        self.freeze()
        (self.root / '.bit/bitmap-history').mkdir()
        with self.assertRaisesRegex(RuntimeError, 'wrote bitmap/history'):
            self.validate()

    def test_existing_backup_bytes_and_mode_are_preserved(self):
        directory = self.root / '.bit/bitmap-history'
        directory.mkdir()
        backup = directory / '.bitmap-2026-10-19-1-2-3'
        backup.write_bytes(b'original bitmap')
        self.freeze()
        self.validate()
        backup.write_bytes(b'changed bitmap')
        with self.assertRaisesRegex(RuntimeError, 'wrote bitmap/history'):
            self.validate()
        backup.write_bytes(b'original bitmap')
        backup.chmod(stat.S_IREAD)
        with self.assertRaisesRegex(RuntimeError, 'wrote bitmap/history'):
            self.validate()

    def test_unchanged_history_does_not_hide_a_bitmap_write(self):
        self.freeze()
        (self.root / '.bitmap').write_bytes(b'{"changed":true}\n')
        with self.assertRaisesRegex(RuntimeError, 'wrote bitmap/history'):
            self.validate()

    def test_frozen_zero_write_oracle_is_checked_independently_of_replay_baseline(self):
        self.freeze()
        self.oracle['baseline_raw_history']['directory_mode'] = 0o700
        with self.assertRaisesRegex(RuntimeError, 'frozen zero-write oracle'):
            self.validate()


class OwnershipAndInputTests(unittest.TestCase):
    def test_only_two_declared_ci_errors_delegate(self):
        expected = {'head-only-merge', 'unknown-inherited'}
        self.assertEqual(set(BENCH.PREPARE.ERRORS), expected)
        for mode in ['timed', 'ci', 'tty']:
            declined = {name for name in BENCH.PREPARE.WORKLOADS if not BENCH.ownership(name, mode)}
            self.assertEqual(declined, expected if mode == 'ci' else set())

    def test_success_cannot_claim_delegated_ownership(self):
        trace = b'bit-native: running `reset` natively\n'
        BENCH.validate_ownership(trace, 'merged-all', 'ci')
        for invalid in [b'', b'delegating: other', trace + b'delegating: other']:
            with self.assertRaises(RuntimeError):
                BENCH.validate_ownership(invalid, 'merged-all', 'ci')

    def test_ci_errors_require_the_exact_decline_receipt_and_delegation(self):
        dispatch = b'bit-native: running `reset` natively\n'
        decline = b'bit-native: `reset` declined: ' + BENCH.CI_REASON + b'\n'
        delegation = b'bit-native: delegating: released CLI\n'
        trace = dispatch + decline + delegation
        BENCH.validate_ownership(trace, 'head-only-merge', 'ci')
        for invalid in [dispatch + delegation, dispatch + decline,
                        trace.replace(BENCH.CI_REASON, b'unrelated error')]:
            with self.assertRaises(RuntimeError):
                BENCH.validate_ownership(invalid, 'head-only-merge', 'ci')

    def test_replay_and_oracle_both_require_workload_specific_environment(self):
        fixtures = {'workloads': {'a': '/baseline/a', 'b': '/baseline/b'},
                    'remotes': {'a': '/remote/a', 'b': '/remote/b'},
                    'home': '/wrong/shared-home', 'globals': '/wrong/shared-globals',
                    'workload_environment': {'a': {'home': '/home/a', 'globals': '/globals/a'},
                                             'b': {'home': '/home/b', 'globals': '/globals/b'}}}
        for name in ['a', 'b']:
            actual = BENCH.replay_inputs(fixtures, name)
            self.assertEqual(actual, BENCH.ORACLE.sources(fixtures, name))
            self.assertEqual(actual['home'], Path(f'/home/{name}'))
            self.assertEqual(actual['globals'], Path(f'/globals/{name}'))
        del fixtures['workload_environment']['a']
        for helper in [BENCH.replay_inputs, BENCH.ORACLE.sources]:
            with self.assertRaises(KeyError):
                helper(fixtures, 'a')

    def test_environment_fingerprints_include_content_modes_and_empty_directories(self):
        with tempfile.TemporaryDirectory(prefix='graph-reset-input-unit-') as directory:
            root = Path(directory)
            path = root / 'settings'
            path.write_bytes(b'first')
            original = BENCH.fingerprint(root)
            path.write_bytes(b'second')
            self.assertNotEqual(BENCH.fingerprint(root), original)
            path.write_bytes(b'first')
            path.chmod(stat.S_IREAD)
            self.assertNotEqual(BENCH.fingerprint(root), original)
            path.chmod(stat.S_IREAD | stat.S_IWRITE)
            before_directory = BENCH.fingerprint(root)
            (root / 'empty-directory').mkdir()
            self.assertNotEqual(BENCH.fingerprint(root), before_directory)

    def test_output_projection_preserves_real_stacks_provider_lines_and_colors(self):
        original = b'provider event\nBitError: missing history\n    at realMethod (/released/file.js:74:3)\n'
        self.assertEqual(BENCH.STATE.normalized(original), original.decode())
        for changed in [original.replace(b'74:3', b'75:3'), original.replace(b'provider event', b'other event'),
                        b'\x1b[31m' + original + b'\x1b[39m']:
            self.assertNotEqual(BENCH.STATE.normalized(original), BENCH.STATE.normalized(changed))


if __name__ == '__main__':
    unittest.main()
