#!/usr/bin/env python3
"""Focused negative controls for the strict bitmap clock oracle validator."""
import base64
import copy
import datetime
import hashlib
import importlib.util
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('bitmap_history_oracle',
                                             Path(__file__).with_name('bitmap-history-oracle.py'))
ORACLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORACLE)


def encoded(data):
    return base64.b64encode(data).decode('ascii')


def sha(data):
    return hashlib.sha256(data).hexdigest()


class BitmapHistoryOracleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.history = self.root / '.bit/bitmap-history'
        self.history.mkdir(parents=True)
        self.history.chmod(0o750)
        self.metadata = self.root / '.bit/bitmap-history-metadata.txt'
        self.old = '.bitmap-2025-12-31-23-59-59'
        (self.history / self.old).write_bytes(b'baseline bitmap\n')
        (self.history / self.old).chmod(0o640)
        self.prefix = '2025-12-31-23-59-59 existing reason\n'
        self.metadata.write_text(self.prefix)
        self.metadata.chmod(0o640)
        self.baseline = {'backups': {self.old: [0o640, sha(b'baseline bitmap\n')]},
                         'metadata': self.prefix, 'metadata_mode': 0o640, 'directory_mode': 0o750}
        self.start = datetime.datetime(2026, 1, 2, 3, 4, 5)
        self.start_ns = int(self.start.timestamp()) * 1_000_000_000 + 1
        self.end_ns = self.start_ns + 20_000_000_000
        self.preimages = [f'complete preimage {index}\n'.encode() for index in range(15)]
        self.oracle = {
            'transitions': [{'reason': f'reason {index}', 'preimage_base64': encoded(body), 'mode': 0o640}
                            for index, body in enumerate(self.preimages)],
            'final_bitmap_sha256': sha(b'final bitmap\n'),
            'raw_history': {'metadata_mode': 0o640, 'directory_mode': 0o750}}
        (self.root / '.bitmap').write_bytes(b'final bitmap\n')
        (self.root / '.bitmap').chmod(0o640)
        self.groups = [0] * 5 + [1] * 10
        self.write(self.groups)
        self.oracle['raw_history'].update({
            'metadata_base64': encoded(self.metadata.read_bytes()),
            'backups': {path.name: {'bytes_base64': encoded(path.read_bytes()),
                                    'mode': path.stat().st_mode & 0o7777}
                        for path in self.history.iterdir()}})

    def identity(self, offset):
        value = self.start + datetime.timedelta(seconds=offset)
        return '-'.join(map(str, [value.year, value.month, value.day,
                                 value.hour, value.minute, value.second]))

    def write(self, groups):
        for path in self.history.iterdir():
            if path.name != self.old:
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                else:
                    path.unlink()
        lines = [self.prefix]
        for index, offset in enumerate(groups):
            identity = self.identity(offset)
            path = self.history / ('.bitmap-' + identity)
            path.write_bytes(self.preimages[index])
            path.chmod(0o640)
            lines.append(f'{identity} reason {index}\n')
        self.metadata.write_text(''.join(lines))

    def validate(self, **changes):
        arguments = {'root': self.root, 'baseline': self.baseline, 'oracle': self.oracle,
                     'interval_start_ns': self.start_ns, 'interval_end_ns': self.end_ns}
        arguments.update(changes)
        return ORACLE.validate(**arguments)

    def rejected(self):
        with self.assertRaises((ValueError, FileNotFoundError)):
            self.validate()

    def test_different_clock_partitions_keep_equal_logical_transitions_and_all_raw_evidence(self):
        logical, raw = self.validate()
        self.assertEqual(len(raw['backups']), 3)
        self.assertEqual(raw['groups'][0]['transition_indices'], list(range(5)))
        self.assertEqual(raw['groups'][1]['last_transition_index'], 14)
        self.assertEqual(raw['backups'][self.old]['bytes_base64'], encoded(b'baseline bitmap\n'))
        self.assertEqual(raw['metadata_base64'], encoded(self.metadata.read_bytes()))
        self.assertEqual(len(raw['oracle_transitions']), 15)
        self.write(list(range(15)))
        other_logical, other_raw = self.validate()
        self.assertEqual(logical, other_logical)
        self.assertEqual(len(other_raw['backups']), 16)
        self.assertEqual(len(other_raw['groups']), 15)
        self.write([0] * 15)
        self.assertEqual(logical, self.validate()[0])

    def test_wrong_last_preimage_is_rejected_even_if_an_earlier_oracle_body_matches(self):
        (self.history / ('.bitmap-' + self.identity(0))).write_bytes(self.preimages[3])
        self.rejected()

    def test_missing_fresh_backup_is_rejected(self):
        (self.history / ('.bitmap-' + self.identity(0))).unlink()
        self.rejected()

    def test_extra_unreferenced_backup_is_rejected(self):
        (self.history / '.bitmap-2026-1-2-3-4-7').write_bytes(b'extra')
        self.rejected()

    def test_reason_order_is_exact(self):
        self.metadata.write_text(self.metadata.read_text().replace('reason 2\n', 'different reason\n'))
        self.rejected()

    def test_baseline_metadata_prefix_is_exact(self):
        self.metadata.write_text(self.metadata.read_text().replace('existing reason', 'changed reason'))
        self.rejected()

    def test_missing_final_newline_is_rejected(self):
        self.metadata.write_bytes(self.metadata.read_bytes()[:-1])
        self.rejected()

    def test_baseline_bytes_and_mode_remain_exact(self):
        path = self.history / self.old
        path.write_bytes(b'changed baseline\n')
        self.rejected()
        path.write_bytes(b'baseline bitmap\n')
        path.chmod(0o600)
        self.rejected()

    def test_backup_metadata_and_directory_modes_are_checked(self):
        path = self.history / ('.bitmap-' + self.identity(0))
        for target in [path, self.metadata, self.history]:
            original = target.stat().st_mode & 0o7777
            target.chmod(0o700)
            self.rejected()
            target.chmod(original)

    def test_symlink_and_nested_directory_snapshots_are_rejected(self):
        path = self.history / ('.bitmap-' + self.identity(0))
        path.unlink()
        path.symlink_to(self.root / '.bitmap')
        self.rejected()
        path.unlink()
        path.mkdir()
        self.rejected()

    def test_metadata_symlink_is_rejected(self):
        original = self.metadata.read_bytes()
        self.metadata.unlink()
        other = self.root / 'external-metadata'
        other.write_bytes(original)
        self.metadata.symlink_to(other)
        self.rejected()

    def test_out_of_window_timestamp_is_rejected(self):
        self.write([21] * 15)
        self.rejected()

    def test_clock_groups_cannot_go_backwards(self):
        self.write([1] * 5 + [0] * 10)
        self.rejected()

    def test_baseline_clock_id_cannot_be_overwritten(self):
        self.metadata.write_text(self.prefix + ''.join(
            f'2025-12-31-23-59-59 reason {index}\n' for index in range(15)))
        with self.assertRaises(ValueError):
            self.validate(interval_start_ns=int(datetime.datetime(2025, 12, 31).timestamp()) * 10**9)

    def test_final_bitmap_and_transition_count_are_exact(self):
        (self.root / '.bitmap').write_bytes(b'wrong final\n')
        self.rejected()
        (self.root / '.bitmap').write_bytes(b'final bitmap\n')
        oracle = copy.deepcopy(self.oracle)
        oracle['transitions'].pop()
        with self.assertRaises(ValueError):
            self.validate(oracle=oracle)

    def test_unpadded_single_digit_date_and_time_are_accepted_but_padding_is_not(self):
        self.validate()
        self.metadata.write_text(self.metadata.read_text().replace('2026-1-2-3-4-5', '2026-01-2-3-4-5'))
        self.rejected()

    def test_oracle_raw_transcript_must_agree_with_its_claimed_preimages(self):
        oracle = copy.deepcopy(self.oracle)
        key = '.bitmap-' + self.identity(0)
        oracle['raw_history']['backups'][key]['bytes_base64'] = encoded(self.preimages[0])
        with self.assertRaises(ValueError):
            self.validate(oracle=oracle)


    def ten_transitions(self):
        self.preimages = self.preimages[:10]
        self.oracle['transitions'] = self.oracle['transitions'][:10]
        self.write([0] * 4 + [1] * 6)
        self.oracle['raw_history'].update({
            'metadata_base64': encoded(self.metadata.read_bytes()),
            'backups': {path.name: {'bytes_base64': encoded(path.read_bytes()),
                                   'mode': path.stat().st_mode & 0o7777}
                        for path in self.history.iterdir()}})

    def test_explicit_ten_write_workload_accepts_only_validated_last_writer_partitions(self):
        self.ten_transitions()
        first, raw_first = self.validate(expected_transitions=10)
        self.write([0] * 2 + [1] * 5 + [2] * 3)
        second, raw_second = self.validate(expected_transitions=10)
        self.assertEqual(first, second)
        self.assertNotEqual(raw_first['groups'], raw_second['groups'])

    def test_default_fifteen_write_contract_rejects_a_ten_write_transcript(self):
        self.ten_transitions()
        with self.assertRaisesRegex(ValueError, 'exactly 15 ordered transitions'):
            self.validate()


    def two_transitions(self):
        self.preimages = self.preimages[:2]
        self.oracle['transitions'] = self.oracle['transitions'][:2]
        self.write([0, 0])
        self.oracle['raw_history'].update({
            'metadata_base64': encoded(self.metadata.read_bytes()),
            'backups': {path.name: {'bytes_base64': encoded(path.read_bytes()),
                                   'mode': path.stat().st_mode & 0o7777}
                        for path in self.history.iterdir()}})

    def test_explicit_two_write_workload_validates_both_collided_and_separate_backups(self):
        self.two_transitions()
        first, _ = self.validate(expected_transitions=2)
        self.write([0, 1])
        second, raw = self.validate(expected_transitions=2)
        self.assertEqual(first, second)
        self.assertEqual(len(raw['groups']), 2)

    def test_two_write_contract_rejects_a_fifteen_write_transcript(self):
        with self.assertRaisesRegex(ValueError, 'exactly 2 ordered transitions'):
            self.validate(expected_transitions=2)


    def test_explicit_single_write_contract_validates_the_only_surviving_backup(self):
        self.preimages = self.preimages[:1]
        self.oracle['transitions'] = self.oracle['transitions'][:1]
        self.write([0])
        self.oracle['raw_history'].update({
            'metadata_base64': encoded(self.metadata.read_bytes()),
            'backups': {path.name: {'bytes_base64': encoded(path.read_bytes()),
                                   'mode': path.stat().st_mode & 0o7777}
                        for path in self.history.iterdir()}})
        logical, raw = self.validate(expected_transitions=1)
        self.assertEqual(len(logical['transitions']), 1)
        self.assertEqual(len(raw['groups']), 1)

    def test_single_write_contract_rejects_a_two_write_transcript(self):
        self.two_transitions()
        with self.assertRaisesRegex(ValueError, 'exactly 1 ordered transitions'):
            self.validate(expected_transitions=1)


if __name__ == '__main__':
    unittest.main()
