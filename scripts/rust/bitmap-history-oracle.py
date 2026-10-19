#!/usr/bin/env python3
"""Validate clock-collided bitmap backups against an independent Node transcript.

The timed processes are unmodified. Only the surviving backup for a clock ID is
observable: it must equal the oracle preimage at that ID's LAST metadata row.
Overwritten intermediate preimages remain explicitly oracle-only evidence.
"""
import base64
import datetime
import hashlib
from pathlib import Path
import re
import stat


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _encoded(data):
    return base64.b64encode(data).decode('ascii')


def _decoded(value):
    _require(isinstance(value, str), 'oracle preimage must be base64 text')
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError('invalid oracle base64 preimage') from error
    _require(_encoded(decoded) == value, 'noncanonical oracle base64 preimage')
    return decoded


def _mode(value):
    _require(type(value) is int and 0 <= value <= 0o7777, 'invalid history mode')
    return value


def _regular(path):
    metadata = path.lstat()
    _require(stat.S_ISREG(metadata.st_mode), f'nonregular history file: {path}')
    return path.read_bytes(), metadata.st_mode & 0o7777


def _optional(path, directory=False):
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return None
    required = stat.S_ISDIR if directory else stat.S_ISREG
    _require(required(metadata.st_mode), f'nonregular history entry: {path}')
    return metadata.st_mode & 0o7777


def _timestamp(identity):
    _require(isinstance(identity, str) and re.fullmatch(r'[0-9]{4}(?:-[0-9]{1,2}){5}', identity),
             'invalid history clock ID syntax')
    parts = list(map(int, identity.split('-')))
    _require(identity == '-'.join(map(str, parts)), 'history clock ID must be unpadded')
    try:
        return datetime.datetime(*parts)
    except ValueError as error:
        raise ValueError('invalid history calendar timestamp') from error


def _history(root):
    scope = root / '.bit'
    if not scope.exists():
        scope = root / '.git/bit'
    _require(_optional(scope, directory=True) is not None, 'missing local scope')
    directory = scope / 'bitmap-history'
    directory_mode = _optional(directory, directory=True)
    metadata_path = scope / 'bitmap-history-metadata.txt'
    metadata_mode = _optional(metadata_path)
    metadata = metadata_path.read_bytes() if metadata_mode is not None else b''
    files = {}
    if directory_mode is not None:
        for path in sorted(directory.iterdir()):
            body, mode = _regular(path)
            files[path.name] = {'bytes_base64': _encoded(body), 'mode': mode, 'sha256': _sha(body)}
    return {'metadata_base64': _encoded(metadata), 'metadata_mode': metadata_mode,
            'directory_mode': directory_mode, 'backups': files}, metadata


def _baseline(raw, metadata, baseline):
    original = baseline['metadata'].encode('utf-8')
    _require(not original or original.endswith(b'\n'), 'baseline metadata lacks final newline')
    _require(metadata.startswith(original), 'baseline metadata prefix changed')
    for field in ['metadata_mode', 'directory_mode']:
        expected = baseline[field]
        if expected is not None:
            _require(raw[field] == _mode(expected), f'baseline {field} changed')
    for filename, expected in baseline['backups'].items():
        actual = raw['backups'].get(filename)
        _require(actual is not None, f'baseline backup missing: {filename}')
        _require([actual['mode'], actual['sha256']] == list(expected),
                 f'baseline backup changed: {filename}')
    return metadata[len(original):]


def _oracle(oracle, expected_transitions):
    transitions = oracle['transitions']
    _require(isinstance(transitions, list) and len(transitions) == expected_transitions,
             f'oracle must contain exactly {expected_transitions} ordered transitions')
    result = []
    for index, transition in enumerate(transitions):
        reason = transition['reason']
        _require(isinstance(reason, str) and '\n' not in reason and '\r' not in reason,
                 'invalid oracle history reason')
        body = _decoded(transition['preimage_base64'])
        mode = _mode(transition['mode'])
        if 'backup_mode' in transition:
            _require(transition['backup_mode'] == mode, 'oracle copy mode differs from preimage')
        result.append({'index': index, 'reason': reason, 'preimage_sha256': _sha(body),
                       'mode': mode, 'preimage_base64': transition['preimage_base64']})
    return result


def _groups(appended, transitions, baseline, start, end):
    _require(appended.endswith(b'\n'), 'fresh metadata lacks final newline')
    lines = appended.decode('utf-8').splitlines(keepends=True)
    _require(len(lines) == len(transitions), 'fresh metadata transition count differs')
    groups, previous = {}, None
    for index, (line, transition) in enumerate(zip(lines, transitions)):
        _require(line.endswith('\n') and '\r' not in line, 'metadata newline serialization differs')
        identity, separator, reason = line[:-1].partition(' ')
        _require(separator and reason == transition['reason'], 'ordered history reason differs')
        moment = _timestamp(identity)
        _require(start <= moment <= end, 'history timestamp outside measured wall-clock interval')
        _require(previous is None or moment >= previous, 'history timestamps are not nondecreasing')
        previous = moment
        filename = '.bitmap-' + identity
        _require(filename not in baseline['backups'], 'fresh history overwrote baseline clock ID')
        groups.setdefault(filename, []).append(index)
    return groups


def _backups(raw, baseline, transitions, groups):
    fresh = set(raw['backups']) - set(baseline['backups'])
    _require(fresh == set(groups), 'missing or unreferenced fresh backup')
    for filename, indices in groups.items():
        last = transitions[indices[-1]]
        actual = raw['backups'][filename]
        _require(actual['bytes_base64'] == last['preimage_base64'],
                 f'backup differs from last clock-group preimage: {filename}')
        _require(actual['mode'] == last['mode'], f'backup mode differs: {filename}')


def _validate_oracle_history(oracle, baseline, transitions):
    """Reject inconsistent oracle transcripts as well as inconsistent timed data."""
    original = oracle['raw_history']
    raw = {**original, 'backups': {}}
    for name, snapshot in original['backups'].items():
        body = _decoded(snapshot['bytes_base64'])
        raw['backups'][name] = {**snapshot, 'sha256': _sha(body), 'mode': _mode(snapshot['mode'])}
    metadata = _decoded(original['metadata_base64'])
    appended = _baseline(raw, metadata, baseline)
    groups = _groups(appended, transitions, baseline, datetime.datetime.min, datetime.datetime.max)
    _backups(raw, baseline, transitions, groups)
    lines = appended.decode('utf-8').splitlines(keepends=True)
    for index, row in enumerate(oracle['transitions']):
        if 'sequence' in row:
            _require(row['sequence'] == index, 'oracle sequence index differs')
        if 'raw_metadata_line' in row:
            _require(row['raw_metadata_line'] == lines[index], 'oracle raw metadata line differs')
        if 'identity' in row:
            _require(row['identity'] == lines[index].partition(' ')[0], 'oracle clock identity differs')


def validate(root, baseline, oracle, interval_start_ns, interval_end_ns, *, expected_transitions=15):
    """Return ``(logical_projection, raw_proof)`` after every strict check.

    ``baseline`` is the unchanged ``STATE.bitmap_history`` mapping. Interval
    values are wall-clock ``time.time_ns()`` around the unmodified timed CLI.
    Oracle schema: 15 transitions {reason, preimage_base64, mode},
    final_bitmap_sha256, and raw_history {metadata_mode, directory_mode, ...}.
    """
    _require(type(interval_start_ns) is int and type(interval_end_ns) is int
             and 0 <= interval_start_ns <= interval_end_ns, 'invalid measurement interval')
    start = datetime.datetime.fromtimestamp(interval_start_ns // 1_000_000_000)
    end = datetime.datetime.fromtimestamp(interval_end_ns // 1_000_000_000)
    root = Path(root)
    raw, metadata = _history(root)
    appended = _baseline(raw, metadata, baseline)
    _require(type(expected_transitions) is int and expected_transitions in (1, 2, 10, 15),
             'unsupported fixed-workload transition count')
    transitions = _oracle(oracle, expected_transitions)
    _validate_oracle_history(oracle, baseline, transitions)
    for field in ['metadata_mode', 'directory_mode']:
        _require(raw[field] == _mode(oracle['raw_history'][field]), f'oracle {field} differs')
    groups = _groups(appended, transitions, baseline, start, end)
    _backups(raw, baseline, transitions, groups)
    final_bytes, final_mode = _regular(root / '.bitmap')
    final_hash = _sha(final_bytes)
    _require(final_hash == oracle['final_bitmap_sha256'], 'final bitmap differs from oracle')
    logical = {'baseline': baseline, 'metadata_mode': raw['metadata_mode'],
               'directory_mode': raw['directory_mode'],
               'transitions': [{key: row[key] for key in ['index', 'reason', 'preimage_sha256', 'mode']}
                               for row in transitions],
               'last_observed_backup_sha256': transitions[-1]['preimage_sha256'],
               'final_bitmap_sha256': final_hash,
               'evidence_limit': 'Overwritten intermediate preimages are oracle-only; every surviving timed backup is observed and checked.'}
    raw.update({'groups': [{'filename': filename, 'transition_indices': indices,
                            'last_transition_index': indices[-1]} for filename, indices in groups.items()],
                'baseline': baseline, 'oracle_transitions': transitions,
                'final_bitmap': {'bytes_base64': _encoded(final_bytes), 'mode': final_mode, 'sha256': final_hash},
                'interval_start_ns': interval_start_ns, 'interval_end_ns': interval_end_ns})
    return logical, raw
