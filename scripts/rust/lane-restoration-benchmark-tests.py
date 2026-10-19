#!/usr/bin/env python3
"""Strict lane revert JSON validation with native diagnostics in PTY output."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import unittest
import tempfile
import zlib

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location(
    'lane_restoration_benchmark', Path(__file__).with_name('bench-lane-restoration.py'))
BENCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BENCH)


def output(**fields):
    return json.dumps({'historyId': 'history', 'mergeSnapResults': None, **fields}).encode()


class RevertJsonTests(unittest.TestCase):
    def test_only_ci_history_errors_delegate_and_never_claim_native_speed(self):
        for workload in BENCH.PREPARE.WORKLOADS:
            for mode in ['timed', 'ci', 'tty']:
                expected = not (mode == 'ci' and workload in ['missing-history', 'main-history'])
                self.assertEqual(BENCH.native_ownership(workload, mode), expected,
                                 (workload, mode))

    def test_plain_and_colored_json_keep_released_status_bytes(self):
        for status in ['updated', '\x1b[32mupdated\x1b[39m']:
            raw = output(components=[{'filesStatus': {'index.js': status}}])
            BENCH.validate_revert_json(raw, 'history')
            self.assertEqual(json.loads(BENCH.STATE.normalized(raw))['components'][0]
                             ['filesStatus']['index.js'], status)

    def test_pty_trace_lines_are_removed_before_schema_validation(self):
        raw = (b'bit-native: running `lane` natively\r\n'
               b'bit-native: engine commandApply took 1 ms\r\n' + output() + b'\r\n')
        BENCH.validate_revert_json(raw, 'history')

    def test_non_trace_output_remains_a_failure(self):
        for prefix in [b'provider output\r\n', b'bit-native-extra: output\r\n']:
            with self.assertRaises(json.JSONDecodeError):
                BENCH.validate_revert_json(prefix + output(), 'history')

    def test_wrong_history_or_non_null_snapshot_remains_a_failure(self):
        for fields in [{'historyId': 'other'}, {'mergeSnapResults': {}},
                       {'mergeSnapResults': 'unexpected'}]:
            with self.assertRaisesRegex(RuntimeError, 'released schema'):
                BENCH.validate_revert_json(output(**fields), 'history')

    def test_missing_required_fields_remain_a_failure(self):
        for fields in [{'historyId': 'history'}, {'mergeSnapResults': None}]:
            with self.assertRaisesRegex(RuntimeError, 'released schema'):
                BENCH.validate_revert_json(json.dumps(fields).encode(), 'history')

    def test_color_mismatch_still_fails_complete_output_comparison(self):
        plain = output(components=[{'filesStatus': {'index.js': 'updated'}}])
        colored = output(components=[{'filesStatus': {'index.js': '\x1b[32mupdated\x1b[39m'}}])
        self.assertNotEqual(BENCH.STATE.normalized(plain), BENCH.STATE.normalized(colored))


class RawHistoryTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='lane-raw-history-unit-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.scope = self.root / '.bit'
        self.scope.mkdir()
        self.directory = self.scope / 'bitmap-history'
        self.metadata = self.scope / 'bitmap-history-metadata.txt'

    def test_absence_is_distinct_from_creating_empty_directory_or_metadata(self):
        absent = BENCH.raw_history(self.root)
        self.directory.mkdir()
        empty_directory = BENCH.raw_history(self.root)
        self.assertNotEqual(absent, empty_directory)
        self.assertIsNone(empty_directory['metadata_base64'])
        self.assertEqual(empty_directory['backups'], {})
        self.metadata.write_bytes(b'')
        self.assertNotEqual(empty_directory, BENCH.raw_history(self.root))

    def test_existing_history_matches_frozen_oracle_capture_exactly(self):
        self.directory.mkdir()
        self.metadata.write_bytes(b'metadata\x00\xff')
        (self.directory / 'backup').write_bytes(b'bitmap\x00\xff')
        self.assertEqual(BENCH.raw_history(self.root), BENCH.HISTORY_PREPARE.CORE.raw_history(self.root))

    def test_backup_bytes_and_modes_remain_significant_without_metadata(self):
        self.directory.mkdir()
        backup = self.directory / 'backup'
        backup.write_bytes(b'before')
        backup.chmod(0o640)
        before = BENCH.raw_history(self.root)
        backup.write_bytes(b'after')
        self.assertNotEqual(before, BENCH.raw_history(self.root))
        backup.write_bytes(b'before')
        self.assertEqual(before, BENCH.raw_history(self.root))
        backup.chmod(0o600)
        self.assertNotEqual(before, BENCH.raw_history(self.root))
        backup.unlink()
        self.assertNotEqual(before, BENCH.raw_history(self.root))

    def test_metadata_bytes_and_directory_modes_remain_significant(self):
        self.directory.mkdir(mode=0o750)
        self.metadata.write_bytes(b'before')
        self.metadata.chmod(0o640)
        before = BENCH.raw_history(self.root)
        self.metadata.write_bytes(b'after')
        self.assertNotEqual(before, BENCH.raw_history(self.root))
        self.metadata.write_bytes(b'before')
        self.metadata.chmod(0o600)
        self.assertNotEqual(before, BENCH.raw_history(self.root))
        self.metadata.chmod(0o640)
        self.assertEqual(before, BENCH.raw_history(self.root))
        self.directory.chmod(0o700)
        self.assertNotEqual(before, BENCH.raw_history(self.root))


class HistoryRefreshTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='lane-refresh-unit-')
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name) / 'workspace'
        self.remote = Path(directory.name) / 'remote'
        (self.root / '.bit').mkdir(parents=True)
        self.lane = {'scope': 'bench.scope', 'name': 'dev'}
        self.lane_hash = '1' * 40
        self.reference = hashlib.sha1(f'{self.lane_hash}:LaneHistory'.encode()).hexdigest()
        (self.root / '.bitmap').write_text(json.dumps({'$schema': 'schema', '_bit_lane': {'id': self.lane}}))
        self.index = self.root / '.bit/index.json'
        self.index.write_text(json.dumps({'lanes': [{'id': self.lane, 'hash': self.lane_hash}]}))
        self.body = {'name': 'dev', 'scope': 'bench.scope', 'laneHash': self.lane_hash,
                     'history': {'before': {'message': 'retained ☃', 'components': []},
                                 'requested': {'message': 'refresh', 'components': []},
                                 'after': {'message': 'retained after', 'components': []}}}
        old = copy.deepcopy(self.body)
        del old['history']['requested']
        self.local = self.write(self.root / '.bit', self.reference, 'LaneHistory', old)
        self.local.chmod(0o640)
        self.local.parent.chmod(0o750)
        self.incoming = self.write(self.remote, self.reference, 'LaneHistory', self.body)
        self.incoming.chmod(0o600)
        self.version = self.write(self.root / '.bit', '2' * 40, 'Version', {'log': {'date': '1'}, 'files': []})
        self.baseline = BENCH.STATE.objects(self.root)

    @staticmethod
    def compact(value):
        return json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()

    @classmethod
    def write(cls, scope, reference, kind, value):
        body = cls.compact(value)
        length = len(body.decode().encode('utf-16-le')) // 2
        path = scope / 'objects' / reference[:2] / reference[2:]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(zlib.compress(f'{kind} {reference} {length}\0'.encode() + body))
        return path

    def expected_history(self):
        value = copy.deepcopy(self.body)
        value['history'] = {name: self.body['history'][name]
                            for name in ['before', 'after', 'requested']}
        return value

    def refresh(self):
        return BENCH.history_baseline(self.root, self.baseline, self.remote,
                                      'remote-history-refresh', 'requested')

    def test_other_workloads_return_original_baseline_identity(self):
        self.incoming.unlink()
        for workload in ['checkout', 'restore-json', 'provider-revert']:
            self.assertIs(BENCH.history_baseline(self.root, self.baseline, self.remote,
                                               workload, 'requested'), self.baseline)

    def test_exact_single_entry_refresh_preserves_original_modes_and_every_other_object(self):
        before = copy.deepcopy(self.baseline)
        expected = self.refresh()
        self.assertIsNot(expected, self.baseline)
        self.assertEqual(self.baseline, before)
        self.assertEqual(expected[self.reference], ('LaneHistory', self.compact(self.expected_history()),
                                                   *self.baseline[self.reference][2:]))
        self.assertEqual(expected['2' * 40], self.baseline['2' * 40])
        self.assertEqual(set(expected), set(self.baseline))
        self.assertEqual(list(json.loads(expected[self.reference][1])['history']),
                         ['before', 'after', 'requested'])
        self.assertNotEqual(expected[self.reference][1], self.compact(self.body))

    def test_unrelated_history_or_component_metadata_changes_are_rejected(self):
        variants = []
        changed = copy.deepcopy(self.body)
        changed['history']['before']['message'] = 'changed retained entry'
        variants.append(changed)
        changed = copy.deepcopy(self.body)
        changed['unexpected'] = 'extra metadata'
        variants.append(changed)
        changed = copy.deepcopy(self.body)
        del changed['history']['requested']
        variants.append(changed)
        for value in variants:
            with self.subTest(value=value):
                self.write(self.remote, self.reference, 'LaneHistory', value)
                with self.assertRaises(RuntimeError):
                    self.refresh()

    def test_wrong_lane_identity_and_ambiguous_active_lane_are_rejected(self):
        for field in ['name', 'scope', 'laneHash']:
            changed = copy.deepcopy(self.body)
            changed[field] = 'wrong'
            self.write(self.remote, self.reference, 'LaneHistory', changed)
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                self.refresh()
        self.write(self.remote, self.reference, 'LaneHistory', self.body)
        row = {'id': self.lane, 'hash': self.lane_hash}
        for rows in [[], [row, row], [{'id': self.lane, 'hash': '3' * 40}]]:
            self.index.write_text(json.dumps({'lanes': rows}))
            with self.subTest(rows=rows), self.assertRaises(RuntimeError):
                self.refresh()

    def test_invalid_remote_kind_hash_length_and_missing_separator_are_rejected(self):
        body = self.compact(self.body)
        length = len(body.decode().encode('utf-16-le')) // 2
        headers = [f'Version {self.reference} {length}\0',
                   f'LaneHistory {"0" * 40} {length}\0',
                   f'LaneHistory {self.reference} {length + 1}\0',
                   f'LaneHistory {self.reference} {length}']
        for header in headers:
            self.incoming.write_bytes(zlib.compress(header.encode() + body))
            with self.subTest(header=header), self.assertRaises(RuntimeError):
                self.refresh()

    def test_actual_state_adapter_rejects_unrelated_version_and_local_history_mutation(self):
        expected = self.refresh()
        self.write(self.root / '.bit', self.reference, 'LaneHistory', self.expected_history())
        history = BENCH.STATE.bitmap_history(self.root)
        BENCH.IMPORT_STATE.import_state(self.root, expected, history, self.remote)
        cases = [(self.version, self.version.read_bytes()), (self.local, self.local.read_bytes())]
        for path, original in cases:
            kind = 'Version' if path == self.version else 'LaneHistory'
            reference = path.parent.name + path.name
            self.write(path.parent.parent.parent, reference, kind, {'unexpected': 'changed body'})
            with self.subTest(kind=kind), self.assertRaisesRegex(RuntimeError, 'existing repository object changed'):
                BENCH.IMPORT_STATE.import_state(self.root, expected, history, self.remote)
            path.write_bytes(original)
        correct = self.local.read_bytes()
        self.local.write_bytes(self.incoming.read_bytes())
        with self.assertRaisesRegex(RuntimeError, 'existing repository object changed'):
            BENCH.IMPORT_STATE.import_state(self.root, expected, history, self.remote)
        self.local.write_bytes(correct)
        self.local.chmod(0o600)
        with self.assertRaisesRegex(RuntimeError, 'existing repository object changed'):
            BENCH.IMPORT_STATE.import_state(self.root, expected, history, self.remote)


if __name__ == '__main__':
    unittest.main()
