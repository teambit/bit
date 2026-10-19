#!/usr/bin/env python3
"""Strict lane revert JSON validation with native diagnostics in PTY output."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location(
    'lane_restoration_benchmark', Path(__file__).with_name('bench-lane-restoration.py'))
BENCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BENCH)


def output(**fields):
    return json.dumps({'historyId': 'history', 'mergeSnapResults': None, **fields}).encode()


class RevertJsonTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
